import mongoose from 'mongoose'
import Cuenta from './cuenta.model.js'
import Comanda from './comanda.model.js'
import Mesa from './mesa.model.js'
import Zona from './zona.model.js'
import Producto from '../catalogo/producto.model.js'
import Categoria from '../catalogo/categoria.model.js'
import Estacion from '../catalogo/estacion.model.js'
import Usuario from '../identidad/usuario.model.js'
import GrupoModificadores from '../catalogo/grupoModificadores.model.js'
import { gruposActivosDe, validarModificadores } from '../catalogo/modificadores.validacion.js'
import { estacionEfectiva } from '../catalogo/estaciones.js'
import { AppError } from '../compartido/errors.js'
import { conTransaccion } from '../compartido/transacciones.js'
import { siguienteValor } from '../compartido/contadores.js'
import { registrarEvento } from '../compartido/estados.service.js'
import {
    MAQUINA_MESA, MAQUINA_CUENTA, MAQUINA_ITEM, ESTADOS_CUENTA_ABIERTA, MESA_SEGUN_CUENTA,
} from '../compartido/estadosSalon.js'
import { atiendeMesas, tienePermiso } from '../identidad/permisos.js'
import { calcularItem, subtotalRonda, totalesCuenta } from './totales.js'
import {
    validar, abrirCuentaSchema, agregarItemSchema, modificarItemSchema, versionOpcionalSchema,
    enviarRondaSchema, cambioCuentaSchema, anularItemSchema, cambioMesaSchema,
    transferirSchema, moverSchema, unirSchema,
} from './cuentas.schema.js'
import { MAX_MESAS_POR_CUENTA } from './cuenta.model.js'

// 1.4 · Núcleo de cuenta y comanda (sin endpoints: llegan en 1.5 y reciben `sesion` = req.usuario).
// Reglas:
//   - Todo cambio va en una transacción y empieza «tocando» la cuenta (findOneAndUpdate con $inc
//     version y filtro por estado y, si llega, por versionEsperada): dos operaciones sobre la misma
//     cuenta se serializan (la segunda reintenta y ve lo que hizo la primera) y una tablet con datos
//     viejos recibe 409 CUENTA_MODIFICADA.
//   - Los montos se recalculan siempre desde los ítems (totales.js) y se guardan con save(), que
//     comprueba los invariantes de los esquemas.
//   - Cada cambio deja su Evento con quién lo hizo. F1-17: cualquiera con el permiso opera cualquier
//     cuenta; `mesero` solo indica el responsable.
//   - Mesa y cuenta cambian juntas: la mesa solo se escribe si apunta a esta cuenta (cuentaActual)
//     y está en el estado esperado; si no, 409 MESAS_INCONSISTENTES y no se escribe nada.
const { ObjectId } = mongoose.Types

const error = (status, code, message, details) => new AppError(status, code, message, details)
const cuentaNoEncontrada = () => error(404, 'CUENTA_NO_ENCONTRADA', 'La cuenta no existe.')
const itemNoEncontrado = () => error(404, 'ITEM_NO_ENCONTRADO', 'El ítem no existe en esta cuenta.')
const permisosDe = (sesion) => sesion?.permisos || []
const quien = (sesion) => ({ usuario: sesion.id, actor: sesion.rol || 'staff' })

const exigirPermiso = (sesion, clave) => {
    if (!tienePermiso(permisosDe(sesion), clave)) {
        throw error(403, 'FORBIDDEN', 'No tienes permiso para realizar esta acción.', { requiere: [clave] })
    }
}

// ── Formatos (los usa la API de 1.5) ───────────────────────────────────────────────────
const textoId = (valor) => (valor ? String(valor) : null)

const formatoItem = (item) => ({
    id: String(item._id),
    productoId: String(item.producto),
    codigoProducto: item.codigoProducto ?? null,
    nombre: item.nombre,
    precioBase: item.precioBase,
    modificadores: (item.modificadores || []).map((m) => ({
        grupoId: String(m.grupo), grupo: m.grupoNombre, opcionId: String(m.opcion), opcion: m.opcionNombre, precioExtra: m.precioExtra,
    })),
    estacion: { id: String(item.estacion.id), codigo: item.estacion.codigo, nombre: item.estacion.nombre },
    cantidad: item.cantidad,
    nota: item.nota || '',
    precioUnitario: item.precioUnitario,
    subtotal: item.subtotal,
    estado: item.estado,
    anulacion: item.anulacion
        ? { motivo: item.anulacion.motivo, detalle: item.anulacion.detalle || '', por: String(item.anulacion.por), en: item.anulacion.en }
        : null,
    agregadoPor: textoId(item.agregadoPor),
    agregadoEn: item.agregadoEn,
})

const formatoRonda = (comanda) => ({
    id: String(comanda._id),
    numeroRonda: comanda.numeroRonda,
    estado: comanda.estado,
    subtotal: comanda.subtotal,
    enviadaPor: textoId(comanda.enviadaPor),
    enviadaEn: comanda.enviadaEn || null,
    items: comanda.items.map(formatoItem),
})

const formatoCuenta = (cuenta, comandas) => ({
    id: String(cuenta._id),
    codigo: cuenta.codigo,
    canal: cuenta.canal,
    estado: cuenta.estado,
    mesas: cuenta.mesas.map((m) => ({
        id: String(m.mesa), numero: m.numero, nombre: m.nombre || '', zona: { id: String(m.zona), nombre: m.zonaNombre || '' },
    })),
    mesero: String(cuenta.mesero),
    comensales: cuenta.comensales,
    subtotal: cuenta.subtotal,
    pendiente: cuenta.pendiente,
    impuestos: cuenta.impuestos ?? null,
    propina: cuenta.propina ?? null,
    descuento: cuenta.descuento ?? null,
    total: cuenta.total,
    version: cuenta.version,
    ultimaRonda: cuenta.ultimaRonda,
    abiertaPor: String(cuenta.abiertaPor),
    abiertaEn: cuenta.abiertaEn,
    cerradaPor: textoId(cuenta.cerradaPor),
    cerradaEn: cuenta.cerradaEn || null,
    motivoCierre: cuenta.motivoCierre || '',
    notas: cuenta.notas || '',
    rondas: [...comandas].sort((a, b) => a.numeroRonda - b.numeroRonda).map(formatoRonda),
})

// Resumen de un ítem para el Evento (mermas de la Fase 5): sin datos personales
const resumenItem = (item) => ({
    itemId: String(item._id),
    productoId: String(item.producto),
    codigoProducto: item.codigoProducto ?? null,
    nombre: item.nombre,
    cantidad: item.cantidad,
    precioUnitario: item.precioUnitario,
    subtotal: item.subtotal,
    modificadores: (item.modificadores || []).map((m) => m.opcionNombre),
    estacion: item.estacion?.codigo,
})

const comandasDe = (cuentaId, session) => Comanda.find({ cuenta: cuentaId }).sort({ numeroRonda: 1 }).session(session)
const borradorDe = (cuentaId, session) => Comanda.findOne({ cuenta: cuentaId, estado: 'borrador' }).session(session)

const detalle = async (cuenta, session) => formatoCuenta(cuenta, await comandasDe(cuenta._id, session).lean())

// ── Cuenta: toque, totales y mesas ─────────────────────────────────────────────────────
/**
 * «Toca» la cuenta dentro de la transacción ($inc version) si está en `estados` y, con
 * versionEsperada, si nadie la cambió desde entonces. Devuelve el documento (para save()).
 */
const tocarCuenta = async (cuentaId, { versionEsperada, estados = ESTADOS_CUENTA_ABIERTA } = {}, session) => {
    if (!mongoose.isValidObjectId(cuentaId)) throw cuentaNoEncontrada()
    const filtro = { _id: cuentaId, estado: { $in: estados }, ...(versionEsperada === undefined ? {} : { version: versionEsperada }) }
    const cuenta = await Cuenta.findOneAndUpdate(filtro, { $inc: { version: 1 } }, { returnDocument: 'after', session })
    if (cuenta) return cuenta

    const actual = await Cuenta.findById(cuentaId).select('estado version').session(session).lean()
    if (!actual) throw cuentaNoEncontrada()
    if (!estados.includes(actual.estado)) {
        if (MAQUINA_CUENTA.esFinal(actual.estado)) {
            throw error(409, 'ESTADO_FINAL', 'La cuenta ya está cerrada y no admite cambios.', { estado: actual.estado })
        }
        throw error(409, 'CUENTA_NO_EDITABLE', `La cuenta está «${actual.estado}».`, { estado: actual.estado })
    }
    throw error(409, 'CUENTA_MODIFICADA', 'La cuenta cambió mientras la editabas. Recarga e intenta de nuevo.', { version: actual.version })
}

/** Recalcula subtotal, pendiente y total desde las rondas y guarda la cuenta (valida invariantes). */
const guardarCuenta = async (cuenta, session) => {
    const comandas = await Comanda.find({ cuenta: cuenta._id }).select('estado items.subtotal items.estado').session(session).lean()
    cuenta.set(totalesCuenta(comandas))
    await cuenta.save({ session })
}

/**
 * Cambia a la vez las mesas de la cuenta de `de` a `a` (transición del sistema). Solo escribe las
 * que apuntan a esta cuenta y están en `de`; si falta alguna, 409 y no se escribe nada.
 */
const moverMesas = async (cuenta, de, a, { sesion, session, liberar = false, motivo = '' }) => {
    MAQUINA_MESA.validar(de, a, { via: 'sistema' })
    const ids = cuenta.mesas.map((m) => m.mesa)
    const { matchedCount } = await Mesa.updateMany(
        { _id: { $in: ids }, cuentaActual: cuenta._id, estado: de },
        { $set: { estado: a, ...(liberar ? { cuentaActual: null } : {}) } },
        { session, runValidators: true },
    )
    if (matchedCount !== ids.length) {
        throw error(409, 'MESAS_INCONSISTENTES',
            'Las mesas de la cuenta no están como se esperaba. Recarga; si se repite, avisa al administrador.',
            { esperadas: ids.length, encontradas: matchedCount })
    }
    for (const m of cuenta.mesas) {
        await registrarEvento({
            entidad: 'mesa', entidadId: m.mesa, de, a, motivo, ...quien(sesion), datos: { cuenta: cuenta._id, codigo: cuenta.codigo }, session,
        })
    }
}

const cambiarEstadoCuenta = async (cuenta, a, { sesion, session, motivo = '', datos }) => {
    const de = cuenta.estado
    cuenta.estado = a
    await registrarEvento({ entidad: 'cuenta', entidadId: cuenta._id, de, a, motivo, ...quien(sesion), datos, session })
}

/** D2: con la cuenta pedida, pedir algo más la reabre (cuenta abierta y mesas ocupadas). */
const reabrirSiHaceFalta = async (cuenta, { sesion, session }) => {
    if (cuenta.estado !== 'cuenta_pedida') return
    MAQUINA_CUENTA.validar('cuenta_pedida', 'abierta', { permisos: permisosDe(sesion) })
    await moverMesas(cuenta, 'cuenta_pedida', 'ocupada', { sesion, session, motivo: 'se agregó un ítem' })
    await cambiarEstadoCuenta(cuenta, 'abierta', { sesion, session, motivo: 'se agregó un ítem' })
}

/**
 * F1-18: si en una cuenta pedida ya no queda ningún ítem enviado sin anular, vuelve sola a abierta
 * (mesas → ocupada). Cancelar sigue sin permitirse (hubo envíos): la cierra el admin sin cobro.
 */
const reabrirSiTodoAnulado = async (cuenta, { sesion, session }) => {
    if (cuenta.estado !== 'cuenta_pedida') return
    const queda = await Comanda.exists({ cuenta: cuenta._id, estado: 'enviada', items: { $elemMatch: { estado: { $ne: 'anulado' } } } }).session(session)
    if (queda) return
    const motivo = 'se anularon todos los ítems'
    MAQUINA_CUENTA.validar('cuenta_pedida', 'abierta', { via: 'sistema' })
    await moverMesas(cuenta, 'cuenta_pedida', 'ocupada', { sesion, session, motivo })
    await cambiarEstadoCuenta(cuenta, 'abierta', { sesion, session, motivo })
}

/** Borra la ronda en borrador (al cancelar o cerrar) y deja Evento con lo que tenía. */
const descartarBorrador = async (cuenta, { sesion, session }) => {
    const borrador = await borradorDe(cuenta._id, session)
    if (!borrador) return
    await Comanda.deleteOne({ _id: borrador._id }, { session })
    if (borrador.items.length) {
        await registrarEvento({
            entidad: 'cuenta', entidadId: cuenta._id, tipo: 'ronda_descartada', ...quien(sesion),
            datos: { comanda: borrador._id, numeroRonda: borrador.numeroRonda, items: borrador.items.map(resumenItem) }, session,
        })
    }
}

/** Cierre final (cancelada, cerrada_sin_cobro): mesas → por_limpiar y sin cuenta. */
const cerrarCuenta = async (cuenta, a, { sesion, session, motivo }) => {
    await descartarBorrador(cuenta, { sesion, session })
    await moverMesas(cuenta, MESA_SEGUN_CUENTA[cuenta.estado], 'por_limpiar', { sesion, session, liberar: true, motivo })
    await cambiarEstadoCuenta(cuenta, a, { sesion, session, motivo })
    cuenta.set({ cerradaPor: sesion.id, cerradaEn: new Date(), motivoCierre: motivo })
    await guardarCuenta(cuenta, session)
}

// ── Catálogo: estación, disponibilidad y modificadores ─────────────────────────────────
/** Estación efectiva (snapshot { id, codigo, nombre }) de cada producto, en lote: Map(productoId → snapshot|null). */
const estacionesDe = async (productos, session) => {
    const sinPropia = productos.filter((p) => !p.estacion).map((p) => p.categoria)
    const categorias = sinPropia.length
        ? await Categoria.find({ _id: { $in: sinPropia } }).select('estacion').session(session).lean()
        : []
    const categoriaPorId = new Map(categorias.map((c) => [String(c._id), c]))
    const efectivas = new Map(productos.map((p) => [String(p._id), estacionEfectiva(p, categoriaPorId.get(String(p.categoria)))]))
    const ids = [...new Set([...efectivas.values()].filter(Boolean).map(String))]
    const estaciones = ids.length ? await Estacion.find({ _id: { $in: ids } }).select('codigo nombre').session(session).lean() : []
    const estacionPorId = new Map(estaciones.map((e) => [String(e._id), { id: e._id, codigo: e.codigo, nombre: e.nombre }]))
    return new Map([...efectivas].map(([productoId, estacion]) => [productoId, estacion ? estacionPorId.get(String(estacion)) || null : null]))
}

// 1.12 · gruposActivosDe y validarModificadores viven en catalogo/modificadores.validacion.js (los
// comparten las cuentas y el pedido a domicilio); se reexporta el validador para quien lo use desde aquí.
export { validarModificadores }
// 2.2 · Para el módulo de cocina: el resumen del ítem de los Eventos y (2.3) la estación de cada producto
export { resumenItem, estacionesDe }

/** Ítem nuevo con la copia del catálogo de este momento (F1-14). */
const armarItem = async ({ productoId, cantidad, nota, modificadores }, sesion, session) => {
    const producto = await Producto.findById(productoId).session(session).lean()
    if (!producto) throw error(404, 'PRODUCTO_NO_ENCONTRADO', 'El producto no existe.')
    if (producto.disponible === false) {
        throw error(409, 'PRODUCT_UNAVAILABLE', `«${producto.nombre}» está agotado.`, { productos: [producto.codigo ?? null], productoId: String(producto._id) })
    }
    if (!Number.isSafeInteger(producto.precio) || producto.precio < 0) {
        throw error(409, 'PRECIO_NO_VALIDO', `El precio de «${producto.nombre}» no es un entero en COP; corrígelo en el catálogo.`)
    }
    const estacion = (await estacionesDe([producto], session)).get(String(producto._id))
    if (!estacion) {
        throw error(409, 'PRODUCTO_SIN_ESTACION', `«${producto.nombre}» no tiene estación (cocina o barra); asígnala en el catálogo.`)
    }
    const snapshotModificadores = validarModificadores(await gruposActivosDe(producto, session), modificadores)
    const base = {
        producto: producto._id,
        codigoProducto: producto.codigo ?? null,
        nombre: producto.nombre,
        precioBase: producto.precio,
        modificadores: snapshotModificadores,
        estacion,
        cantidad,
        nota: nota || '',
        estado: 'borrador',
        agregadoPor: sesion.id,
        agregadoEn: new Date(),
    }
    return { ...base, ...calcularItem(base) }
}

/**
 * Al enviar (D3): revisa que cada producto siga existiendo y disponible, y cada opción elegida
 * siga disponible. Actualiza la estación al vigente (el KDS enruta por ella). Devuelve los problemas.
 * Carrera aceptada: el producto se lee sin escribirlo, así que si el admin lo agota en el mismo instante
 * la ronda puede salir igual (lo detecta cocina o barra).
 */
const revisarRonda = async (items, session) => {
    const productos = await Producto.find({ _id: { $in: items.map((i) => i.producto) } }).session(session).lean()
    const productoPorId = new Map(productos.map((p) => [String(p._id), p]))
    const idsGrupos = [...new Set(items.flatMap((i) => i.modificadores.map((m) => String(m.grupo))))]
    const grupos = idsGrupos.length ? await GrupoModificadores.find({ _id: { $in: idsGrupos } }).session(session).lean() : []
    const grupoPorId = new Map(grupos.map((g) => [String(g._id), g]))
    const estaciones = await estacionesDe(productos, session)

    const problemas = []
    for (const item of items) {
        const producto = productoPorId.get(String(item.producto))
        const opcionAgotada = item.modificadores.some((m) => {
            const opcion = grupoPorId.get(String(m.grupo))?.opciones.find((o) => String(o._id) === String(m.opcion))
            return !opcion || opcion.disponible === false
        })
        const estacion = producto ? estaciones.get(String(producto._id)) : null
        const motivo = !producto ? 'producto_eliminado'
            : producto.disponible === false ? 'producto_agotado'
                : opcionAgotada ? 'opcion_agotada'
                    : !estacion ? 'sin_estacion'
                        : null
        if (motivo) problemas.push({ itemId: String(item._id), nombre: item.nombre, motivo })
        else item.estacion = estacion
    }
    return problemas
}

const buscarItem = async (cuenta, itemId, session) => {
    if (!mongoose.isValidObjectId(itemId)) throw itemNoEncontrado()
    const comanda = await Comanda.findOne({ cuenta: cuenta._id, 'items._id': itemId }).session(session)
    if (!comanda) throw itemNoEncontrado()
    return { comanda, item: comanda.items.id(itemId) }
}

const exigirBorrador = (comanda) => {
    if (comanda.estado !== 'borrador') {
        throw error(409, 'ITEM_NO_EDITABLE', 'El ítem ya se envió: no se edita ni se quita; se anula con motivo.')
    }
}

/** Si el índice único dice que la mesa ya está en otra cuenta abierta (dato incoherente), 409 en vez de 500. */
const siMesaEnOtraCuenta = async (operacion) => {
    try {
        return await operacion()
    } catch (e) {
        if (e?.code === 11000 && 'mesas.mesa' in (e.keyPattern || {})) {
            throw error(409, 'MESAS_INCONSISTENTES',
                'La mesa figura en otra cuenta abierta. Recarga; si se repite, avisa al administrador (npm run verificar:salon).')
        }
        throw e
    }
}
const crearCuentaOConflicto = (docs, opciones) => siMesaEnOtraCuenta(() => Cuenta.create(docs, opciones))

/** 1.5 · El responsable de una cuenta: usuario activo que atiende mesas (1.7b: sin el comodín del admin). */
const exigirMeseroValido = async (meseroId, session) => {
    const usuario = await Usuario.findById(meseroId).select('activo rol').populate('rol', 'permisos').session(session).lean()
    if (!usuario || usuario.activo === false || !atiendeMesas(usuario.rol?.permisos)) {
        throw error(400, 'MESERO_NO_VALIDO', 'Ese usuario no puede atender mesas: elige un mesero activo.')
    }
}

const mesaNoEncontrada = () => error(404, 'MESA_NO_ENCONTRADA', 'La mesa no existe.')

/** Mesa con cuenta abierta (para mover, unir y separar). */
const mesaConCuenta = async (mesaId, session) => {
    if (!mongoose.isValidObjectId(mesaId)) throw mesaNoEncontrada()
    const mesa = await Mesa.findById(mesaId).session(session).lean()
    if (!mesa) throw mesaNoEncontrada()
    if (!mesa.cuentaActual) throw error(409, 'MESA_SIN_CUENTA', `La mesa ${mesa.numero} no tiene una cuenta abierta.`)
    return mesa
}

/** «Toca» la zona activa (igual que al abrir: desactivarla a la vez entra en conflicto). */
const tocarZonaActiva = (zonaId, session) =>
    Zona.findOneAndUpdate({ _id: zonaId, activa: true }, { $currentDate: { updatedAt: true } }, { returnDocument: 'after', session })

const copiaDeMesa = (mesa, zona) => ({ mesa: mesa._id, numero: mesa.numero, nombre: mesa.nombre || '', zona: zona._id, zonaNombre: zona.nombre })

// ── Operaciones ────────────────────────────────────────────────────────────────────────
export const obtenerCuenta = async (cuentaId, sesion) => {
    exigirPermiso(sesion, 'cuenta:ver')
    if (!mongoose.isValidObjectId(cuentaId)) throw cuentaNoEncontrada()
    const cuenta = await Cuenta.findById(cuentaId).lean()
    if (!cuenta) throw cuentaNoEncontrada()
    return formatoCuenta(cuenta, await Comanda.find({ cuenta: cuenta._id }).lean())
}

/** Abre la cuenta de una mesa libre (F1-7): mesa → ocupada y apunta a la cuenta. */
export const abrirCuenta = async (datos, sesion) => {
    exigirPermiso(sesion, 'cuenta:abrir')
    const { mesaId, comensales, notas, meseroId } = validar(abrirCuentaSchema, datos)
    const otroMesero = Boolean(meseroId) && meseroId !== String(sesion.id)
    if (otroMesero) exigirPermiso(sesion, 'cuenta:transferir')
    // El responsable atiende mesas: quien no (un rol sin comanda:tomar o el admin) indica el mesero;
    // si se indica a sí mismo, el mismo 400 que al transferir a quien no atiende mesas (1.7b)
    if (!otroMesero && !atiendeMesas(permisosDe(sesion))) {
        if (meseroId) throw error(400, 'MESERO_NO_VALIDO', 'Ese usuario no puede atender mesas: elige un mesero activo.')
        throw error(400, 'MESERO_REQUERIDO', 'Elige el mesero que atenderá la mesa.')
    }
    // Fuera de la transacción: un reintento no consume otro número (los huecos son aceptables)
    const codigo = `C-${String(await siguienteValor('cuenta')).padStart(6, '0')}`

    return conTransaccion(async (session) => {
        const mesa = await Mesa.findById(mesaId).session(session).lean()
        if (!mesa) throw error(404, 'MESA_NO_ENCONTRADA', 'La mesa no existe.')
        const noDisponible = (motivo) => error(409, 'MESA_NO_DISPONIBLE', motivo, { estado: mesa.estado })
        if (!mesa.activa || mesa.estado !== 'libre' || mesa.cuentaActual) throw noDisponible(`La mesa ${mesa.numero} no está libre.`)
        // Toca la zona: desactivarla a la vez entra en conflicto con esta apertura (pendiente (b) de 1.2)
        const zona = await Zona.findOneAndUpdate(
            { _id: mesa.zona, activa: true }, { $currentDate: { updatedAt: true } }, { returnDocument: 'after', session },
        )
        if (!zona) throw noDisponible(`La zona de la mesa ${mesa.numero} está inactiva.`)
        if (otroMesero) await exigirMeseroValido(meseroId, session)

        MAQUINA_MESA.validar('libre', 'ocupada', { via: 'sistema' })
        const cuentaId = new ObjectId()
        const ocupada = await Mesa.findOneAndUpdate(
            { _id: mesa._id, activa: true, estado: 'libre', cuentaActual: null },
            { $set: { estado: 'ocupada', cuentaActual: cuentaId } },
            { returnDocument: 'after', session, runValidators: true },
        )
        if (!ocupada) throw noDisponible(`La mesa ${mesa.numero} no está libre.`)

        const [cuenta] = await crearCuentaOConflicto([{
            _id: cuentaId,
            codigo,
            canal: 'salon',
            mesas: [copiaDeMesa(mesa, zona)],
            mesero: otroMesero ? meseroId : sesion.id,
            comensales,
            estado: 'abierta',
            abiertaPor: sesion.id,
            abiertaEn: new Date(),
            notas: notas || '',
        }], { session })
        await registrarEvento({
            entidad: 'mesa', entidadId: mesa._id, de: 'libre', a: 'ocupada', ...quien(sesion), datos: { cuenta: cuentaId, codigo }, session,
        })
        await registrarEvento({
            entidad: 'cuenta', entidadId: cuentaId, a: 'abierta', ...quien(sesion), datos: { codigo, mesas: [mesa.numero], comensales }, session,
        })
        return formatoCuenta(cuenta, [])
    })
}

/** Agrega un ítem a la ronda en borrador (la crea si no hay). Con la cuenta pedida, la reabre (D2). */
export const agregarItem = async (cuentaId, datos, sesion) => {
    exigirPermiso(sesion, 'comanda:tomar')
    const entrada = validar(agregarItemSchema, datos)

    return conTransaccion(async (session) => {
        const cuenta = await tocarCuenta(cuentaId, { versionEsperada: entrada.versionEsperada }, session)
        const nuevo = await armarItem(entrada, sesion, session)
        await reabrirSiHaceFalta(cuenta, { sesion, session })

        const ronda = (await borradorDe(cuenta._id, session)) || new Comanda({
            cuenta: cuenta._id, numeroRonda: cuenta.ultimaRonda + 1, estado: 'borrador', items: [], subtotal: 0, creadaPor: sesion.id,
        })
        ronda.items.push(nuevo)
        ronda.subtotal = subtotalRonda(ronda.items)
        await ronda.save({ session })
        const item = ronda.items.at(-1)
        await guardarCuenta(cuenta, session)
        await registrarEvento({
            entidad: 'cuenta', entidadId: cuenta._id, tipo: 'item_agregado', ...quien(sesion),
            datos: { comanda: ronda._id, numeroRonda: ronda.numeroRonda, item: resumenItem(item) }, session,
        })
        return { cuenta: await detalle(cuenta, session), item: formatoItem(item) }
    })
}

/** Cambia la cantidad o la nota de un ítem del borrador. */
export const modificarItem = async (cuentaId, itemId, datos, sesion) => {
    exigirPermiso(sesion, 'comanda:tomar')
    const { cantidad, nota, versionEsperada } = validar(modificarItemSchema, datos)

    return conTransaccion(async (session) => {
        const cuenta = await tocarCuenta(cuentaId, { versionEsperada }, session)
        const { comanda, item } = await buscarItem(cuenta, itemId, session)
        exigirBorrador(comanda)
        const antes = { cantidad: item.cantidad, nota: item.nota }
        if (cantidad !== undefined) item.cantidad = cantidad
        if (nota !== undefined) item.nota = nota
        item.set(calcularItem(item))
        comanda.subtotal = subtotalRonda(comanda.items)
        await comanda.save({ session })
        await guardarCuenta(cuenta, session)
        await registrarEvento({
            entidad: 'cuenta', entidadId: cuenta._id, tipo: 'item_modificado', ...quien(sesion),
            datos: { comanda: comanda._id, numeroRonda: comanda.numeroRonda, itemId: String(item._id), antes, despues: { cantidad: item.cantidad, nota: item.nota } },
            session,
        })
        return detalle(cuenta, session)
    })
}

/** Quita un ítem del borrador (antes de enviar se quita libremente, F1-6). La ronda vacía se borra. */
export const quitarItem = async (cuentaId, itemId, datos, sesion) => {
    exigirPermiso(sesion, 'comanda:tomar')
    const { versionEsperada } = validar(versionOpcionalSchema, datos)

    return conTransaccion(async (session) => {
        const cuenta = await tocarCuenta(cuentaId, { versionEsperada }, session)
        const { comanda, item } = await buscarItem(cuenta, itemId, session)
        exigirBorrador(comanda)
        const resumen = resumenItem(item)
        comanda.items.pull(item._id)
        if (comanda.items.length === 0) {
            await Comanda.deleteOne({ _id: comanda._id }, { session })
        } else {
            comanda.subtotal = subtotalRonda(comanda.items)
            await comanda.save({ session })
        }
        await guardarCuenta(cuenta, session)
        await registrarEvento({
            entidad: 'cuenta', entidadId: cuenta._id, tipo: 'item_quitado', ...quien(sesion),
            datos: { comanda: comanda._id, numeroRonda: comanda.numeroRonda, item: resumen }, session,
        })
        return detalle(cuenta, session)
    })
}

/**
 * Envía la ronda en borrador a cocina y barra (F1-5: completa). Exige el número de ronda y la
 * versión: un doble envío recibe 409 RONDA_YA_ENVIADA (en 1.5 el endpoint añade Idempotency-Key).
 * Si algún producto u opción ya no está disponible se rechaza toda la ronda (D3).
 */
export const enviarRonda = async (cuentaId, datos, sesion) => {
    exigirPermiso(sesion, 'comanda:enviar')
    const { numeroRonda, versionEsperada } = validar(enviarRondaSchema, datos)

    return conTransaccion(async (session) => {
        if (!mongoose.isValidObjectId(cuentaId)) throw cuentaNoEncontrada()
        const previa = await Cuenta.findById(cuentaId).select('ultimaRonda').session(session).lean()
        if (!previa) throw cuentaNoEncontrada()
        if (numeroRonda <= previa.ultimaRonda) {
            throw error(409, 'RONDA_YA_ENVIADA', `La ronda ${numeroRonda} ya se envió.`, { numeroRonda })
        }
        const cuenta = await tocarCuenta(cuentaId, { versionEsperada }, session)
        const ronda = await borradorDe(cuenta._id, session)
        if (!ronda || ronda.items.length === 0) throw error(409, 'RONDA_VACIA', 'No hay ítems por enviar.')
        if (ronda.numeroRonda !== numeroRonda) {
            throw error(409, 'RONDA_NO_COINCIDE', `La ronda por enviar es la ${ronda.numeroRonda}.`, { numeroRonda: ronda.numeroRonda })
        }

        const problemas = await revisarRonda(ronda.items, session)
        if (problemas.length) {
            const nombres = problemas.map((p) => p.nombre).join(', ')
            throw error(409, 'PRODUCT_UNAVAILABLE',
                `No se envió la ronda: ${nombres} ya no ${problemas.length === 1 ? 'está disponible' : 'están disponibles'}. Quítalos o cámbialos.`,
                { items: problemas })
        }
        for (const item of ronda.items) {
            MAQUINA_ITEM.validar(item.estado, 'enviado', { permisos: permisosDe(sesion) })
            item.estado = 'enviado'
        }
        ronda.set({ estado: 'enviada', enviadaPor: sesion.id, enviadaEn: new Date() })
        await ronda.save({ session })
        cuenta.ultimaRonda = ronda.numeroRonda
        await guardarCuenta(cuenta, session)
        await registrarEvento({
            entidad: 'cuenta', entidadId: cuenta._id, tipo: 'ronda_enviada', ...quien(sesion),
            datos: { comanda: ronda._id, numeroRonda: ronda.numeroRonda, items: ronda.items.length, subtotal: ronda.subtotal }, session,
        })
        return detalle(cuenta, session)
    })
}

/** Anula un ítem enviado (F1-6, D1): item:anular, motivo del catálogo («otro» con detalle). No se cobra. */
export const anularItem = async (cuentaId, itemId, datos, sesion) => {
    exigirPermiso(sesion, 'item:anular')
    const { motivo, detalle: detalleMotivo, versionEsperada } = validar(anularItemSchema, datos)
    if (motivo === 'otro' && !detalleMotivo) throw error(400, 'MOTIVO_REQUERIDO', 'Describe el motivo de la anulación.')
    const texto = (detalleMotivo ? `${motivo}: ${detalleMotivo}` : motivo).slice(0, 300)

    return conTransaccion(async (session) => {
        const cuenta = await tocarCuenta(cuentaId, { versionEsperada }, session)
        const { comanda, item } = await buscarItem(cuenta, itemId, session)
        const de = item.estado
        MAQUINA_ITEM.validar(de, 'anulado', { permisos: permisosDe(sesion), motivo: texto })
        item.set({ estado: 'anulado', anulacion: { motivo, detalle: detalleMotivo || '', por: sesion.id, en: new Date() } })
        comanda.subtotal = subtotalRonda(comanda.items)
        await comanda.save({ session })
        await registrarEvento({
            entidad: 'cuenta', entidadId: cuenta._id, tipo: 'item_anulado', de, a: 'anulado', motivo: texto, ...quien(sesion),
            datos: { comanda: comanda._id, numeroRonda: comanda.numeroRonda, item: resumenItem(item) }, session,
        })
        await reabrirSiTodoAnulado(cuenta, { sesion, session })
        await guardarCuenta(cuenta, session)
        return detalle(cuenta, session)
    })
}

/** La mesa pide la cuenta: exige algo enviado y no anulado, y nada pendiente en el borrador. */
export const solicitarCuenta = async (cuentaId, datos, sesion) => {
    exigirPermiso(sesion, 'cuenta:solicitar')
    const { versionEsperada, motivo } = validar(cambioCuentaSchema, datos)

    return conTransaccion(async (session) => {
        const cuenta = await tocarCuenta(cuentaId, { versionEsperada }, session)
        MAQUINA_CUENTA.validar(cuenta.estado, 'cuenta_pedida', { permisos: permisosDe(sesion) })
        const comandas = await Comanda.find({ cuenta: cuenta._id }).select('estado items.estado').session(session).lean()
        if (comandas.some((c) => c.estado === 'borrador' && c.items.length)) {
            throw error(409, 'RONDA_PENDIENTE', 'Hay ítems sin enviar: envíalos o quítalos antes de pedir la cuenta.')
        }
        if (!comandas.some((c) => c.estado === 'enviada' && c.items.some((i) => i.estado !== 'anulado'))) {
            throw error(409, 'CUENTA_SIN_CONSUMO',
                'La cuenta no tiene ítems enviados. Si los clientes se fueron sin pedir o se abrió por error, cancela la cuenta.')
        }
        await moverMesas(cuenta, 'ocupada', 'cuenta_pedida', { sesion, session })
        await cambiarEstadoCuenta(cuenta, 'cuenta_pedida', { sesion, session, motivo: motivo || '' })
        await guardarCuenta(cuenta, session)
        return detalle(cuenta, session)
    })
}

/** D4: cancela una cuenta abierta sin ítems enviados (abierta por error, clientes que se fueron). */
export const cancelarCuenta = async (cuentaId, datos, sesion) => {
    exigirPermiso(sesion, 'cuenta:abrir')
    const { versionEsperada, motivo } = validar(cambioCuentaSchema, datos)

    return conTransaccion(async (session) => {
        const cuenta = await tocarCuenta(cuentaId, { versionEsperada }, session)
        const { motivo: texto } = MAQUINA_CUENTA.validar(cuenta.estado, 'cancelada', { permisos: permisosDe(sesion), motivo })
        // Cuenta también un ítem enviado y luego anulado: ya llegó a cocina o barra (mermas)
        if (await Comanda.exists({ cuenta: cuenta._id, estado: 'enviada' }).session(session)) {
            throw error(409, 'CUENTA_CON_ITEMS_ENVIADOS',
                'La cuenta tiene ítems enviados a cocina o barra: no se puede cancelar. Un administrador puede cerrarla sin cobro.')
        }
        await cerrarCuenta(cuenta, 'cancelada', { sesion, session, motivo: texto })
        return detalle(cuenta, session)
    })
}

/** F1-13: cierre sin cobro (cuenta:cerrar_sin_cobro, hoy solo admin) con motivo. */
export const cerrarSinCobro = async (cuentaId, datos, sesion) => {
    exigirPermiso(sesion, 'cuenta:cerrar_sin_cobro')
    const { versionEsperada, motivo } = validar(cambioCuentaSchema, datos)

    return conTransaccion(async (session) => {
        const cuenta = await tocarCuenta(cuentaId, { versionEsperada }, session)
        const { motivo: texto } = MAQUINA_CUENTA.validar(cuenta.estado, 'cerrada_sin_cobro', { permisos: permisosDe(sesion), motivo })
        await cerrarCuenta(cuenta, 'cerrada_sin_cobro', { sesion, session, motivo: texto })
        return detalle(cuenta, session)
    })
}

/**
 * Transiciones manuales de la mesa: por_limpiar → libre y libre ↔ bloqueada. Solo sin cuenta
 * (cuentaActual null o ausente): una mesa ocupada o con la cuenta pedida pasa a por_limpiar
 * únicamente al cerrar o cancelar su cuenta.
 */
export const cambiarEstadoMesa = async (mesaId, datos, sesion) => {
    // Sin ninguno de los permisos de las transiciones manuales, 403 antes de leer la mesa
    if (!['mesa:operar', 'mesa:bloquear'].some((clave) => tienePermiso(permisosDe(sesion), clave))) exigirPermiso(sesion, 'mesa:operar')
    const { a, motivo } = validar(cambioMesaSchema, datos)
    if (!mongoose.isValidObjectId(mesaId)) throw error(404, 'MESA_NO_ENCONTRADA', 'La mesa no existe.')

    return conTransaccion(async (session) => {
        const mesa = await Mesa.findById(mesaId).session(session).lean()
        if (!mesa) throw error(404, 'MESA_NO_ENCONTRADA', 'La mesa no existe.')
        const { motivo: texto } = MAQUINA_MESA.validar(mesa.estado, a, { via: 'manual', permisos: permisosDe(sesion), motivo })
        if (mesa.cuentaActual) {
            throw error(409, 'MESA_CON_CUENTA', `La mesa ${mesa.numero} tiene una cuenta: cambia al cerrar o cancelar esa cuenta.`,
                { cuenta: String(mesa.cuentaActual) })
        }
        const actualizada = await Mesa.findOneAndUpdate(
            { _id: mesa._id, estado: mesa.estado, cuentaActual: null },
            { $set: { estado: a } },
            { returnDocument: 'after', session, runValidators: true },
        )
        if (!actualizada) throw error(409, 'CONFLICTO_ESTADO', 'La mesa cambió mientras la editabas. Recarga e intenta de nuevo.')
        await registrarEvento({ entidad: 'mesa', entidadId: mesa._id, de: mesa.estado, a, motivo: texto, ...quien(sesion), session })
        return { id: String(actualizada._id), numero: actualizada.numero, estado: actualizada.estado }
    })
}

// ── 1.5 · Transferir, mover, unir y separar (F1-8, F1-9) ───────────────────────────────
/** F1-8: cambia el mesero responsable (cuenta:transferir, motivo opcional). */
export const transferirCuenta = async (cuentaId, datos, sesion) => {
    exigirPermiso(sesion, 'cuenta:transferir')
    const { meseroId, motivo, versionEsperada } = validar(transferirSchema, datos)

    return conTransaccion(async (session) => {
        const cuenta = await tocarCuenta(cuentaId, { versionEsperada }, session)
        if (String(cuenta.mesero) === meseroId) throw error(409, 'MISMO_MESERO', 'La cuenta ya es de ese mesero.')
        await exigirMeseroValido(meseroId, session)
        const anterior = cuenta.mesero
        cuenta.mesero = meseroId
        await guardarCuenta(cuenta, session)
        await registrarEvento({
            entidad: 'cuenta', entidadId: cuenta._id, tipo: 'cuenta_transferida', motivo: motivo || '', ...quien(sesion),
            datos: { de: anterior, a: new ObjectId(meseroId) }, session,
        })
        return detalle(cuenta, session)
    })
}

/**
 * Mueve la cuenta de una mesa a otra libre (mesa:operar), con la cuenta abierta (no pedida). Si la
 * cuenta tiene mesas unidas, el destino debe ser de la misma zona y combinable (F1-1). La mesa que
 * se deja pasa a por limpiar.
 */
export const moverCuenta = async (mesaOrigenId, datos, sesion) => {
    exigirPermiso(sesion, 'mesa:operar')
    const { mesaDestinoId, versionEsperada } = validar(moverSchema, datos)
    if (mesaDestinoId === String(mesaOrigenId)) throw error(400, 'MESA_DESTINO_NO_VALIDA', 'Elige una mesa distinta.')

    return conTransaccion(async (session) => {
        const origen = await mesaConCuenta(mesaOrigenId, session)
        const cuenta = await tocarCuenta(origen.cuentaActual, { versionEsperada, estados: ['abierta'] }, session)
        const destino = await Mesa.findById(mesaDestinoId).session(session).lean()
        if (!destino) throw mesaNoEncontrada()
        if (!destino.activa || destino.estado !== 'libre' || destino.cuentaActual) {
            throw error(409, 'MESA_NO_DISPONIBLE', `La mesa ${destino.numero} no está libre.`, { estado: destino.estado })
        }
        if (cuenta.mesas.length > 1 && (String(destino.zona) !== String(origen.zona) || !destino.combinable)) {
            throw error(409, 'MESA_NO_COMBINABLE', `La cuenta tiene mesas unidas: la mesa ${destino.numero} debe ser de la misma zona y combinable.`)
        }
        const zona = await tocarZonaActiva(destino.zona, session)
        if (!zona) throw error(409, 'MESA_NO_DISPONIBLE', `La zona de la mesa ${destino.numero} está inactiva.`)

        MAQUINA_MESA.validar('ocupada', 'por_limpiar', { via: 'sistema' })
        MAQUINA_MESA.validar('libre', 'ocupada', { via: 'sistema' })
        const dejada = await Mesa.updateOne(
            { _id: origen._id, cuentaActual: cuenta._id, estado: 'ocupada' },
            { $set: { estado: 'por_limpiar', cuentaActual: null } }, { session, runValidators: true },
        )
        const ocupada = await Mesa.updateOne(
            { _id: destino._id, activa: true, estado: 'libre', cuentaActual: null },
            { $set: { estado: 'ocupada', cuentaActual: cuenta._id } }, { session, runValidators: true },
        )
        if (dejada.matchedCount !== 1 || ocupada.matchedCount !== 1) {
            throw error(409, 'MESAS_INCONSISTENTES', 'Las mesas cambiaron mientras movías la cuenta. Recarga e intenta de nuevo.')
        }
        const posicion = cuenta.mesas.findIndex((m) => String(m.mesa) === String(origen._id))
        if (posicion === -1) throw error(409, 'MESAS_INCONSISTENTES', 'La mesa no figura en su cuenta. Avisa al administrador (npm run verificar:salon).')
        cuenta.mesas.splice(posicion, 1, copiaDeMesa(destino, zona))
        await siMesaEnOtraCuenta(() => guardarCuenta(cuenta, session))

        const datosEvento = { cuenta: cuenta._id, codigo: cuenta.codigo, de: origen.numero, a: destino.numero }
        const motivo = `cuenta movida de la mesa ${origen.numero} a la ${destino.numero}`
        await registrarEvento({ entidad: 'mesa', entidadId: origen._id, de: 'ocupada', a: 'por_limpiar', motivo, ...quien(sesion), datos: datosEvento, session })
        await registrarEvento({ entidad: 'mesa', entidadId: destino._id, de: 'libre', a: 'ocupada', motivo, ...quien(sesion), datos: datosEvento, session })
        await registrarEvento({ entidad: 'cuenta', entidadId: cuenta._id, tipo: 'mesa_movida', motivo, ...quien(sesion), datos: datosEvento, session })
        return detalle(cuenta, session)
    })
}

/**
 * F1-9: une mesas libres a la cuenta abierta de la mesa principal (mesa:unir). Todas de la misma
 * zona, activas y combinables (F1-1); comparten la cuenta. Unir dos cuentas no se permite (Fase 3).
 */
export const unirMesas = async (datos, sesion) => {
    exigirPermiso(sesion, 'mesa:unir')
    const { principalId, mesaIds, versionEsperada } = validar(unirSchema, datos)
    if (new Set(mesaIds).size !== mesaIds.length || mesaIds.includes(principalId)) {
        throw error(400, 'MESAS_REPETIDAS', 'Hay mesas repetidas en la unión.')
    }

    return conTransaccion(async (session) => {
        const principal = await mesaConCuenta(principalId, session)
        const cuenta = await tocarCuenta(principal.cuentaActual, { versionEsperada, estados: ['abierta'] }, session)
        if (cuenta.mesas.length + mesaIds.length > MAX_MESAS_POR_CUENTA) {
            throw error(409, 'DEMASIADAS_MESAS', `Una cuenta tiene como máximo ${MAX_MESAS_POR_CUENTA} mesas.`)
        }
        const nuevas = await Mesa.find({ _id: { $in: mesaIds } }).sort({ numero: 1 }).session(session).lean()
        if (nuevas.length !== mesaIds.length) throw mesaNoEncontrada()
        const noCombinables = [principal, ...nuevas].filter((m) => !m.combinable || String(m.zona) !== String(principal.zona))
        if (noCombinables.length) {
            throw error(409, 'MESA_NO_COMBINABLE',
                `Solo se unen mesas combinables de la misma zona (mesa ${noCombinables.map((m) => m.numero).join(', ')}).`,
                { mesas: noCombinables.map((m) => m.numero) })
        }
        const ocupadas = nuevas.filter((m) => !m.activa || m.estado !== 'libre' || m.cuentaActual)
        if (ocupadas.length) {
            throw error(409, 'MESA_NO_DISPONIBLE', `La mesa ${ocupadas.map((m) => m.numero).join(', ')} no está libre.`,
                { mesas: ocupadas.map((m) => m.numero) })
        }
        const zona = await tocarZonaActiva(principal.zona, session)
        if (!zona) throw error(409, 'MESA_NO_DISPONIBLE', 'La zona de estas mesas está inactiva.')

        MAQUINA_MESA.validar('libre', 'ocupada', { via: 'sistema' })
        const { matchedCount } = await Mesa.updateMany(
            { _id: { $in: nuevas.map((m) => m._id) }, activa: true, estado: 'libre', cuentaActual: null },
            { $set: { estado: 'ocupada', cuentaActual: cuenta._id } }, { session, runValidators: true },
        )
        if (matchedCount !== nuevas.length) throw error(409, 'MESA_NO_DISPONIBLE', 'Alguna mesa dejó de estar libre. Recarga e intenta de nuevo.')
        cuenta.mesas.push(...nuevas.map((m) => copiaDeMesa(m, zona)))
        await siMesaEnOtraCuenta(() => guardarCuenta(cuenta, session))

        for (const m of nuevas) {
            await registrarEvento({
                entidad: 'mesa', entidadId: m._id, de: 'libre', a: 'ocupada', motivo: `unida a la mesa ${principal.numero}`, ...quien(sesion),
                datos: { cuenta: cuenta._id, codigo: cuenta.codigo, principal: principal.numero }, session,
            })
        }
        await registrarEvento({
            entidad: 'cuenta', entidadId: cuenta._id, tipo: 'mesas_unidas', ...quien(sesion),
            datos: { principal: principal.numero, mesas: nuevas.map((m) => m.numero) }, session,
        })
        return detalle(cuenta, session)
    })
}

/**
 * F1-9: separa una mesa de su cuenta (mesa:unir) mientras la cuenta no tenga ítems enviados
 * (también si se anularon, como al cancelar). La mesa separada pasa a por limpiar.
 */
export const separarMesa = async (mesaId, datos, sesion) => {
    exigirPermiso(sesion, 'mesa:unir')
    const { versionEsperada } = validar(versionOpcionalSchema, datos)

    return conTransaccion(async (session) => {
        const mesa = await mesaConCuenta(mesaId, session)
        const cuenta = await tocarCuenta(mesa.cuentaActual, { versionEsperada, estados: ['abierta'] }, session)
        if (!cuenta.mesas.some((m) => String(m.mesa) === String(mesa._id))) {
            throw error(409, 'MESAS_INCONSISTENTES', 'La mesa no figura en su cuenta. Avisa al administrador (npm run verificar:salon).')
        }
        if (cuenta.mesas.length < 2) throw error(409, 'MESA_NO_UNIDA', `La mesa ${mesa.numero} no está unida a otras.`)
        if (await Comanda.exists({ cuenta: cuenta._id, estado: 'enviada' }).session(session)) {
            throw error(409, 'CUENTA_CON_ITEMS_ENVIADOS',
                'La cuenta ya tiene ítems enviados: las mesas no se separan (la división de la cuenta llega en la Fase 3).')
        }
        MAQUINA_MESA.validar('ocupada', 'por_limpiar', { via: 'sistema' })
        const { matchedCount } = await Mesa.updateOne(
            { _id: mesa._id, cuentaActual: cuenta._id, estado: 'ocupada' },
            { $set: { estado: 'por_limpiar', cuentaActual: null } }, { session, runValidators: true },
        )
        if (matchedCount !== 1) throw error(409, 'MESAS_INCONSISTENTES', 'La mesa cambió mientras la separabas. Recarga e intenta de nuevo.')
        cuenta.mesas = cuenta.mesas.filter((m) => String(m.mesa) !== String(mesa._id))
        await guardarCuenta(cuenta, session)

        const motivo = `separada de la cuenta ${cuenta.codigo}`
        await registrarEvento({
            entidad: 'mesa', entidadId: mesa._id, de: 'ocupada', a: 'por_limpiar', motivo, ...quien(sesion),
            datos: { cuenta: cuenta._id, codigo: cuenta.codigo }, session,
        })
        await registrarEvento({ entidad: 'cuenta', entidadId: cuenta._id, tipo: 'mesa_separada', ...quien(sesion), datos: { mesa: mesa.numero }, session })
        return detalle(cuenta, session)
    })
}
