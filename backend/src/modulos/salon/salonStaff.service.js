import mongoose from 'mongoose'
import Zona from './zona.model.js'
import Mesa from './mesa.model.js'
import Cuenta from './cuenta.model.js'
import Evento from '../compartido/evento.model.js'
import Usuario from '../identidad/usuario.model.js'
import Rol from '../identidad/rol.model.js'
import Producto from '../catalogo/producto.model.js'
import Categoria from '../catalogo/categoria.model.js'
import { AppError } from '../compartido/errors.js'
import { ESTADOS_CUENTA_ABIERTA } from '../compartido/estadosSalon.js'
import { atiendeMesas, tienePermiso } from '../identidad/permisos.js'
import { extrasDeModificadores } from '../catalogo/producto.controller.js'
import { urlPublica } from '../catalogo/imagenesProducto.js'
import { obtenerCuenta } from './cuentas.service.js'
import Pedido from '../pedidos/pedido.model.js'
import { pedidoComoCuenta } from '../pedidos/pedidoComoCuenta.js'
import { esEstadoFinal } from '../compartido/estados.js'
import { estadosDelTipo } from '../compartido/estados.service.js'

// 1.5 · Lecturas del salón para el staff (/api/v1/staff/salon). Cada lectura hace un número fijo de
// consultas en lote (sin N+1): el plano son 4 (zonas, mesas, cuentas y meseros) sea cual sea el
// número de mesas. Los permisos se comprueban en la ruta y otra vez aquí.
export const MAX_HISTORIAL = 200
export const MAX_MESEROS = 200

const exigirAlguno = (sesion, claves) => {
    if (!claves.some((clave) => tienePermiso(sesion?.permisos || [], clave))) {
        throw new AppError(403, 'FORBIDDEN', 'No tienes permiso para realizar esta acción.', { requiere: claves })
    }
}

const nombreCorto = (u) => (u ? [u.nombre, u.apellido?.[0] ? `${u.apellido[0]}.` : ''].filter(Boolean).join(' ') : '')

/** Map(id → { id, nombre }) de los usuarios indicados (una consulta). */
const personasPorId = async (ids) => {
    const unicos = [...new Set(ids.filter(Boolean).map(String))]
    if (!unicos.length) return new Map()
    const usuarios = await Usuario.find({ _id: { $in: unicos } }).select('nombre apellido').lean()
    return new Map(usuarios.map((u) => [String(u._id), { id: String(u._id), nombre: nombreCorto(u) }]))
}

const persona = (mapa, id) => (id ? mapa.get(String(id)) || { id: String(id), nombre: '' } : null)

/**
 * Plano de mesas: zonas activas y sus mesas activas (más cualquier mesa con cuenta, aunque su zona
 * o la mesa se hubieran desactivado: no se pierde una cuenta abierta). `bloqueada` es un estado
 * operativo y temporal (sale en el plano); `activa: false` es configuración (no sale).
 */
export const obtenerPlano = async ({ zona } = {}, sesion, ahora = new Date()) => {
    exigirAlguno(sesion, ['mesa:ver'])
    if (zona !== undefined && !mongoose.isValidObjectId(zona)) {
        throw new AppError(400, 'VALIDATION_ERROR', 'La zona no es válida.', [{ campo: 'zona', mensaje: 'La zona no es válida' }])
    }
    const zonas = await Zona.find({ activa: true }).sort({ orden: 1, nombre: 1 }).select('nombre orden').lean()
    const idsZonas = zonas.map((z) => z._id)
    const filtroMesas = {
        $or: [{ activa: true, zona: { $in: idsZonas } }, { cuentaActual: { $ne: null } }],
        ...(zona ? { zona } : {}),
    }
    const mesas = await Mesa.find(filtroMesas).sort({ numero: 1 })
        .select('numero nombre zona capacidad estado combinable posicion cuentaActual').lean()

    const idsCuentas = mesas.map((m) => m.cuentaActual).filter(Boolean)
    const cuentas = idsCuentas.length
        ? await Cuenta.find({ _id: { $in: idsCuentas }, estado: { $in: ESTADOS_CUENTA_ABIERTA } })
            .select('codigo estado comensales mesero abiertaEn total pendiente mesas.mesa mesas.numero mesas.zonaNombre version').lean()
        : []
    const meseros = await personasPorId(cuentas.map((c) => c.mesero))
    const cuentaPorId = new Map(cuentas.map((c) => [String(c._id), c]))
    const zonaPorId = new Map(zonas.map((z) => [String(z._id), z]))

    return {
        actualizadoEn: ahora.toISOString(),
        zonas: zonas.map((z) => ({ id: String(z._id), nombre: z.nombre, orden: z.orden })),
        mesas: mesas.map((m) => {
            const c = m.cuentaActual ? cuentaPorId.get(String(m.cuentaActual)) : null
            return {
                id: String(m._id),
                numero: m.numero,
                nombre: m.nombre || '',
                // Zona inactiva con una cuenta todavía abierta: el nombre que guardó la cuenta
                zona: {
                    id: String(m.zona),
                    nombre: zonaPorId.get(String(m.zona))?.nombre || c?.mesas.find((x) => String(x.mesa) === String(m._id))?.zonaNombre || '',
                },
                capacidad: m.capacidad,
                estado: m.estado,
                combinable: m.combinable,
                posicion: m.posicion || null,
                cuenta: c
                    ? {
                        id: String(c._id),
                        codigo: c.codigo,
                        estado: c.estado,
                        comensales: c.comensales,
                        mesero: persona(meseros, c.mesero),
                        abiertaEn: c.abiertaEn,
                        minutosOcupada: Math.max(0, Math.floor((ahora - c.abiertaEn) / 60_000)),
                        total: c.total,
                        pendiente: c.pendiente,
                        // Mesas que comparten la cuenta (F1-9), con la principal primero
                        mesas: c.mesas.map((x) => ({ id: String(x.mesa), numero: x.numero })),
                        version: c.version,
                    }
                    : null,
            }
        }),
    }
}

/** Cuenta con rondas, totales, mesero y su historial de Eventos (quién y cuándo). */
export const detalleCuenta = async (cuentaId, sesion) => {
    const cuenta = await obtenerCuenta(cuentaId, sesion) // exige cuenta:ver y da 404 si no existe
    // Los más recientes (son los que importan) y luego en orden cronológico
    const recientes = await Evento.find({ entidad: 'cuenta', entidadId: cuenta.id })
        .sort({ createdAt: -1, _id: -1 }).limit(MAX_HISTORIAL + 1).select('tipo de a motivo usuario actor datos createdAt').lean()
    const historialTruncado = recientes.length > MAX_HISTORIAL
    const eventos = recientes.slice(0, MAX_HISTORIAL).reverse()
    const personas = await personasPorId([
        cuenta.mesero, cuenta.abiertaPor,
        ...eventos.map((e) => e.usuario),
        ...eventos.filter((e) => e.tipo === 'cuenta_transferida').flatMap((e) => [e.datos?.de, e.datos?.a]),
    ])
    return {
        ...cuenta,
        mesero: persona(personas, cuenta.mesero),
        abiertaPor: persona(personas, cuenta.abiertaPor),
        historialTruncado,
        historial: eventos.map((e) => ({
            tipo: e.tipo,
            de: e.de ?? null,
            a: e.a ?? null,
            motivo: e.motivo || '',
            por: persona(personas, e.usuario),
            en: e.createdAt,
            ...(e.tipo === 'cuenta_transferida'
                ? { meseroAnterior: persona(personas, e.datos?.de), meseroNuevo: persona(personas, e.datos?.a) }
                : {}),
            ...(e.datos?.numeroRonda ? { numeroRonda: e.datos.numeroRonda } : {}),
            ...(e.datos?.item?.nombre ? { item: { nombre: e.datos.item.nombre, cantidad: e.datos.item.cantidad } } : {}),
        })),
    }
}

/**
 * Catálogo para tomar la comanda (comanda:tomar): todos los productos, también los agotados
 * (`disponible: false`, se muestran deshabilitados), con estación y grupos activos.
 */
export const catalogoSalon = async (sesion) => {
    exigirAlguno(sesion, ['comanda:tomar'])
    const [productos, categorias] = await Promise.all([
        Producto.find().populate('categoria', 'nombre').sort({ codigo: 1, nombre: 1 }).lean(),
        Categoria.find().sort({ nombre: 1 }).select('nombre').lean(),
    ])
    const extra = await extrasDeModificadores(productos)
    return {
        categorias: categorias.map((c) => ({ id: String(c._id), nombre: c.nombre })),
        productos: productos.map((p) => ({
            id: String(p._id),
            codigo: p.codigo,
            nombre: p.nombre,
            precio: p.precio,
            categoriaId: p.categoria ? String(p.categoria._id) : null,
            categoria: p.categoria?.nombre || '',
            imagen: urlPublica(p.imagen),
            disponible: p.disponible !== false,
            ...extra(p),
        })),
    }
}

/** Usuarios activos que pueden ser responsables de una cuenta: su rol tiene comanda:tomar, sin
 * administradores (comodín) ni clientes (1.7b). «yo» marca al usuario conectado. */
export const listarMeseros = async (sesion, { limite = MAX_MESEROS } = {}) => {
    exigirAlguno(sesion, ['cuenta:transferir', 'cuenta:abrir'])
    const roles = await Rol.find({ permisos: 'comanda:tomar' }).select('_id').lean()
    const filtro = { rol: { $in: roles.map((r) => r._id) }, activo: { $ne: false } }
    // Orden alfabético en español («Íngrid» entre «Ana» y «Zoe»), no por bytes
    const usuarios = await Usuario.find(filtro).collation({ locale: 'es' })
        .sort({ nombre: 1, apellido: 1 }).limit(limite).select('nombre apellido').lean()
    // Si el límite deja fuera al usuario conectado y atiende mesas, va igualmente (es el valor por defecto)
    if (atiendeMesas(sesion.permisos) && !usuarios.some((u) => String(u._id) === String(sesion.id))) {
        const yo = await Usuario.findOne({ ...filtro, _id: sesion.id }).select('nombre apellido').lean()
        if (yo) usuarios.push(yo)
    }
    return usuarios.map((u) => ({ id: String(u._id), nombre: nombreCorto(u), yo: String(u._id) === String(sesion.id) }))
}

// ── 1.9 · «Cuentas abiertas»: salón + domicilio, solo lectura ────────────────────────────────
export const MAX_CUENTAS_ABIERTAS = 200
const NOMBRE_ESTADO_CUENTA = { abierta: 'Abierta', cuenta_pedida: 'Cuenta pedida' }

// Con más del límite se conservan las MÁS NUEVAS (orden descendente + límite) y se avisa con «truncado»:
// una cuenta o un pedido viejo olvidado no debe esconder lo que está pasando ahora
const cuentasDeSalon = async (ahora, limite) => {
    const cuentas = await Cuenta.find({ estado: { $in: ESTADOS_CUENTA_ABIERTA } }).sort({ abiertaEn: -1 })
        .limit(limite).select('codigo estado mesero abiertaEn total pendiente comensales mesas.numero').lean()
    const meseros = await personasPorId(cuentas.map((c) => c.mesero))
    return cuentas.map((c) => {
        const numeros = c.mesas.map((m) => m.numero)
        return {
            id: String(c._id),
            canal: 'salon',
            codigo: c.codigo,
            estado: { codigo: c.estado, nombre: NOMBRE_ESTADO_CUENTA[c.estado] || c.estado },
            referencia: `${numeros.length > 1 ? 'Mesas' : 'Mesa'} ${numeros.join(', ')}`,
            cliente: '',
            responsable: persona(meseros, c.mesero),
            comensales: c.comensales,
            total: c.total,
            pendiente: c.pendiente,
            desde: c.abiertaEn.toISOString(),
            minutos: Math.max(0, Math.floor((ahora - c.abiertaEn) / 60_000)),
        }
    })
}

const domiciliosEnCurso = async (ahora, limite) => {
    const estados = await estadosDelTipo('pedido')
    const enCurso = [...estados.values()].filter((e) => !esEstadoFinal('pedido', e.codigo)).map((e) => e._id)
    // canal: los anteriores a 1.9 no lo tienen (null); cuando la Fase 6 añada otros canales no se cuelan aquí
    const pedidos = await Pedido.find({ estado: { $in: enCurso }, canal: { $in: ['domicilio', null] } })
        .sort({ createdAt: -1 }).limit(limite)
        .select('canal estado total nombreEntrega barrio horaEntrega entregaEn createdAt').populate('estado', 'codigo nombre').lean()
    return pedidos.map((p) => pedidoComoCuenta(p, ahora))
}

/**
 * Cuentas abiertas del local (F1-11): las de salón (abierta o cuenta pedida) con cuenta:ver y los
 * domicilios sin terminar con pedido:ver; cada parte solo con su permiso. De la más antigua a la más
 * nueva. Sin datos de contacto. `truncado`: alguna parte llegó al límite.
 */
export const listarCuentasAbiertas = async (sesion, { ahora = new Date(), limite = MAX_CUENTAS_ABIERTAS } = {}) => {
    const salon = tienePermiso(sesion?.permisos || [], 'cuenta:ver')
    const domicilio = tienePermiso(sesion?.permisos || [], 'pedido:ver')
    exigirAlguno(sesion, ['cuenta:ver', 'pedido:ver'])
    const [deSalon, aDomicilio] = await Promise.all([
        salon ? cuentasDeSalon(ahora, limite) : [],
        domicilio ? domiciliosEnCurso(ahora, limite) : [],
    ])
    return {
        actualizadoEn: ahora.toISOString(),
        canales: { salon, domicilio },
        truncado: deSalon.length === limite || aDomicilio.length === limite,
        cuentas: [...deSalon, ...aDomicilio].sort((a, b) => a.desde.localeCompare(b.desde)),
    }
}
