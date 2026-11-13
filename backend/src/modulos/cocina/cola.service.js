// 2.3 · Cola por estación (PLAN_FASE_2 §2.3) y domicilio en el KDS (F2-3). Lecturas en lote (sin N+1):
// rondas enviadas del salón con ítems de la estación pendientes o terminados hace menos de 10 s (para
// el «Deshacer», F2-7) y pedidos a domicilio confirmados o en preparación con líneas de esa estación que
// aún no terminó. Sin datos de contacto del cliente.
import mongoose from 'mongoose'
import Comanda from '../salon/comanda.model.js'
import Cuenta from '../salon/cuenta.model.js'
import Usuario from '../identidad/usuario.model.js'
import Pedido from '../pedidos/pedido.model.js'
import DetallePedido from '../pedidos/detallePedido.model.js'
import Producto from '../catalogo/producto.model.js'
import Estacion, { umbralesDe, COLACION_NOMBRE } from '../catalogo/estacion.model.js'
import { AppError } from '../compartido/errors.js'
import { ESTADOS_CUENTA_ABIERTA } from '../compartido/estadosSalon.js'
import { estadoPorCodigo, registrarEvento } from '../compartido/estados.service.js'
import { validarTransicion } from '../compartido/estados.js'
import { conTransaccion } from '../compartido/transacciones.js'
import { estacionesDe } from '../salon/cuentas.service.js'
import { validar } from '../salon/cuentas.schema.js'
import { codigoPedido } from '../pedidos/pedidoComoCuenta.js'
import { tienePermiso } from '../identidad/permisos.js'
import { colaSchema, pedidoEstacionSchema, VENTANA_DESHACER_MS } from './cocina.schema.js'
import { publicar, CANAL_TODAS_LAS_ESTACIONES } from '../tiempoReal/bus.js'
import { operaEstacion } from '../identidad/permisos.js'
import { exigirEstacion } from './estacionesRol.js'

export const LIMITE_COLA = 200
export const LIMITE_ESTACIONES_KDS = 50
const PENDIENTES = ['enviado', 'en_preparacion']
const PREPARABLES = ['confirmado', 'en_preparacion']

const exigir = (sesion, clave) => {
    if (!tienePermiso(sesion?.permisos || [], clave)) {
        throw new AppError(403, 'FORBIDDEN', 'No tienes permiso para realizar esta acción.', { requiere: [clave] })
    }
}
const nombreCorto = (u) => (u ? [u.nombre, u.apellido?.[0] ? `${u.apellido[0]}.` : ''].filter(Boolean).join(' ') : '')
const opciones = (modificadores = []) => modificadores.map((m) => ({ grupo: m.grupoNombre, opcion: m.opcionNombre }))

const itemDeCola = (item) => ({
    id: String(item._id),
    nombre: item.nombre,
    cantidad: item.cantidad,
    nota: item.nota || '',
    modificadores: opciones(item.modificadores),
    estado: item.estado,
    iniciadoEn: item.iniciadoEn ?? null,
    listoEn: item.listoEn ?? null,
    listoPor: item.listoPor ? String(item.listoPor) : null,
    anulacion: item.anulacion ? { motivo: item.anulacion.motivo, detalle: item.anulacion.detalle || '' } : null,
})

const buscarEstacion = async (codigo) => {
    const estacion = await Estacion.findOne({ codigo }).lean()
    if (!estacion) throw new AppError(404, 'ESTACION_NO_ENCONTRADA', 'La estación no existe.', { estacion: codigo })
    if (estacion.activa === false) throw new AppError(409, 'ESTACION_INACTIVA', 'La estación está desactivada.', { estacion: codigo })
    return estacion
}

/** Filtro de las rondas de la cola (exportado para comprobar el índice con la consulta real). */
export const filtroColaSalon = (codigo, estadoItem, cuentaIds) => ({
    estado: 'enviada',
    cuenta: { $in: cuentaIds },
    items: { $elemMatch: { 'estacion.codigo': codigo, ...estadoItem } },
})

/** Código de estación de cada línea del domicilio: su copia (desde 2.3) o, si no la tiene, la del catálogo. */
const codigosDeLineas = async (lineas, session) => {
    const sinCopia = [...new Set(lineas.filter((l) => !l.estacion?.codigo).map((l) => String(l.producto)))]
    const delCatalogo = sinCopia.length ? await codigosDeProductos(sinCopia, session) : new Map()
    return new Map(lineas.map((l) => [String(l._id), l.estacion?.codigo ?? delCatalogo.get(String(l.producto)) ?? null]))
}

/** Código de estación de cada producto en el catálogo actual: Map(productoId → codigo|null). */
const codigosDeProductos = async (productoIds, session) => {
    const productos = await Producto.find({ _id: { $in: productoIds } }).select('estacion categoria').session(session ?? null).lean()
    const estaciones = await estacionesDe(productos, session)
    return new Map([...estaciones].map(([id, est]) => [id, est?.codigo ?? null]))
}

const tarjetasSalon = async (codigo, ahora, limite) => {
    // Primero las cuentas abiertas (pocas, con índice { estado, abiertaEn }): las rondas sin terminar de
    // una cuenta ya cerrada no deben ocupar el límite
    const cuentas = await Cuenta.find({ estado: { $in: ESTADOS_CUENTA_ABIERTA } }).select('mesas mesero').lean()
    const cuentaPorId = new Map(cuentas.map((c) => [String(c._id), c]))
    const ids = cuentas.map((c) => c._id)
    const [pendientes, recientes] = await Promise.all([
        Comanda.find(filtroColaSalon(codigo, { estado: { $in: PENDIENTES } }, ids)).sort({ enviadaEn: 1 }).limit(limite).lean(),
        // Recién terminadas: siguen a la vista mientras dura el «Deshacer»
        Comanda.find(filtroColaSalon(codigo, { estado: 'listo', listoEn: { $gte: new Date(ahora.getTime() - VENTANA_DESHACER_MS) } }, ids))
            .sort({ enviadaEn: 1 }).limit(limite).lean(),
    ])
    const comandas = [...new Map([...pendientes, ...recientes].map((c) => [String(c._id), c])).values()]
        .sort((a, b) => new Date(a.enviadaEn) - new Date(b.enviadaEn))
    const meseros = await Usuario.find({ _id: { $in: cuentas.map((c) => c.mesero) } }).select('nombre apellido').lean()
    const meseroPorId = new Map(meseros.map((u) => [String(u._id), u]))
    return {
        truncado: pendientes.length === limite || recientes.length === limite,
        tarjetas: comandas.filter((c) => cuentaPorId.has(String(c.cuenta))).map((c) => {
            const cuenta = cuentaPorId.get(String(c.cuenta))
            return {
                tipo: 'salon',
                comandaId: String(c._id),
                cuentaId: String(c.cuenta),
                numeroRonda: c.numeroRonda,
                mesas: (cuenta.mesas || []).map((m) => m.numero),
                mesero: nombreCorto(meseroPorId.get(String(cuenta.mesero))),
                enviadaEn: c.enviadaEn,
                items: c.items.filter((i) => i.estacion?.codigo === codigo && i.estado !== 'borrador').map(itemDeCola),
            }
        }),
    }
}

const tarjetasDomicilio = async (codigo, limite) => {
    const estados = await Promise.all(PREPARABLES.map((c) => estadoPorCodigo('pedido', c)))
    const codigoPorEstado = new Map(estados.map((e) => [String(e._id), e.codigo]))
    const pedidos = await Pedido.find({
        estado: { $in: estados.map((e) => e._id) },
        canal: { $in: ['domicilio', null] },
        estacionesListas: { $ne: codigo },
    }).sort({ createdAt: 1 }).lean() // los pedidos en curso son pocos: el límite va después de filtrar por estación
    const lineas = await DetallePedido.find({ pedido: { $in: pedidos.map((p) => p._id) } }).sort({ _id: 1 }).lean()
    const codigoDe = await codigosDeLineas(lineas)
    const lineasPorPedido = new Map()
    for (const linea of lineas) {
        if (codigoDe.get(String(linea._id)) !== codigo) continue
        const clave = String(linea.pedido)
        lineasPorPedido.set(clave, [...(lineasPorPedido.get(clave) || []), {
            id: String(linea._id), nombre: linea.nombreProducto, cantidad: linea.cantidad, nota: linea.nota || '', modificadores: opciones(linea.modificadores),
        }])
    }
    const conLineas = pedidos.filter((p) => lineasPorPedido.has(String(p._id)))
    return {
        truncado: conLineas.length > limite,
        tarjetas: conLineas.slice(0, limite).map((p) => ({
            tipo: 'domicilio',
            pedidoId: String(p._id),
            codigo: codigoPedido(p._id),
            estado: codigoPorEstado.get(String(p.estado)),
            horaEntrega: p.horaEntrega || '',
            entregaEn: p.entregaEn ?? null,
            desde: p.createdAt,
            estacionesListas: p.estacionesListas || [],
            lineas: lineasPorPedido.get(String(p._id)),
        })),
    }
}

/** 2.5 · GET /staff/cocina/estaciones (kds:ver): las activas para el filtro del KDS, con sus umbrales (F2-4). */
export const listarEstacionesKds = async (sesion) => {
    exigir(sesion, 'kds:ver')
    // 2.5b · Filtradas por rol en la consulta (si no, el límite podría dejar fuera las del rol)
    const todas = (sesion.permisos || []).includes('*')
    const estaciones = await Estacion.find({ activa: true, ...(todas ? {} : { codigo: { $in: sesion.estaciones || [] } }) })
        .select('codigo nombre umbralAvisoMin umbralAlertaMin')
        .collation(COLACION_NOMBRE).sort({ nombre: 1 }).limit(LIMITE_ESTACIONES_KDS).lean()
    // 2.5b · Solo las del rol del usuario (el comodín, todas)
    return estaciones.filter((e) => operaEstacion(sesion, e.codigo)).map((e) => ({ codigo: e.codigo, nombre: e.nombre, ...umbralesDe(e) }))
}

/** GET /staff/cocina/cola?estacion=… (kds:ver). */
export const obtenerCola = async (consulta, sesion, { limite = LIMITE_COLA } = {}) => {
    exigir(sesion, 'kds:ver')
    const { estacion: codigo } = validar(colaSchema, consulta)
    exigirEstacion(sesion, codigo) // 2.5b · antes de leer nada
    const estacion = await buscarEstacion(codigo)
    const ahora = new Date()
    const [salon, domicilio] = await Promise.all([tarjetasSalon(codigo, ahora, limite), tarjetasDomicilio(codigo, limite)])
    return {
        estacion: { codigo: estacion.codigo, nombre: estacion.nombre, ...umbralesDe(estacion) },
        actualizadoEn: ahora,
        truncado: salon.truncado || domicilio.truncado,
        salon: salon.tarjetas,
        domicilio: domicilio.tarjetas,
    }
}

/**
 * Domicilio por estación (F2-3), con pedido:preparar: «en_preparacion» = la estación empezó (el pedido
 * confirmado pasa a en preparación); «listo» = la estación terminó su parte (si estaba confirmado, pasa
 * antes por en preparación) y, cuando terminaron todas las estaciones con líneas, el pedido pasa a listo.
 * Una transacción con escritura condicional sobre el estado leído; dos estaciones a la vez: la que pierde
 * se reintenta y ve la otra estación ya lista.
 */
export const marcarPedidoEstacion = async (pedidoId, datos, sesion) => {
    exigir(sesion, 'pedido:preparar')
    const { estacion, a } = validar(pedidoEstacionSchema, datos)
    exigirEstacion(sesion, estacion) // 2.5b
    if (!mongoose.isValidObjectId(pedidoId)) throw new AppError(404, 'PEDIDO_NO_ENCONTRADO', 'El pedido no existe.')
    const permisos = sesion.permisos || []
    const quien = { usuario: sesion.id, actor: sesion.rol || 'staff' }

    const resultado = await conTransaccion(async (session) => {
        const pedido = await Pedido.findById(pedidoId).populate('estado', 'codigo').session(session).lean()
        if (!pedido) throw new AppError(404, 'PEDIDO_NO_ENCONTRADO', 'El pedido no existe.')
        const actual = pedido.estado?.codigo
        if (!PREPARABLES.includes(actual)) {
            throw new AppError(409, 'PEDIDO_NO_PREPARABLE', 'El pedido no está confirmado ni en preparación.', { estado: actual })
        }
        const lineas = await DetallePedido.find({ pedido: pedido._id }).select('producto estacion').session(session).lean()
        const codigoDe = await codigosDeLineas(lineas, session)
        const conLineas = [...new Set([...codigoDe.values()].filter(Boolean))]
        if (!conLineas.includes(estacion)) {
            throw new AppError(409, 'ESTACION_SIN_LINEAS', 'Este pedido no tiene nada para esta estación.', { estacion })
        }
        const listas = pedido.estacionesListas || []
        if (a === 'listo' && listas.includes(estacion)) {
            throw new AppError(409, 'ESTACION_YA_LISTA', 'Esta estación ya marcó su parte como lista.', { estacion })
        }

        const eventos = []
        let codigo = actual
        const pasar = (destino) => {
            validarTransicion('pedido', codigo, destino, { actor: 'cocina', permisos })
            eventos.push({ entidad: 'pedido', entidadId: pedido._id, de: codigo, a: destino, ...quien })
            codigo = destino
        }
        if (codigo === 'confirmado') pasar('en_preparacion')
        let nuevasListas = listas
        if (a === 'listo') {
            nuevasListas = [...listas, estacion]
            eventos.push({ entidad: 'pedido', entidadId: pedido._id, tipo: 'estacion_lista', datos: { estacion }, ...quien })
            if (conLineas.every((c) => nuevasListas.includes(c))) pasar('listo')
        }
        if (!eventos.length) return { pedidoId: String(pedido._id), estado: codigo, estacionesListas: listas } // ya empezado

        const destino = codigo === actual ? pedido.estado._id : (await estadoPorCodigo('pedido', codigo))._id
        // Condicional sobre lo leído ($ne también vale para pedidos anteriores a 2.3, sin el campo)
        const r = await Pedido.updateOne(
            { _id: pedido._id, estado: pedido.estado._id, ...(a === 'listo' ? { estacionesListas: { $ne: estacion } } : {}) },
            // $addToSet: atómico aunque esta escritura saliera algún día de la transacción
            { $set: { estado: destino }, ...(a === 'listo' ? { $addToSet: { estacionesListas: estacion } } : {}) },
            { session },
        )
        if (r.matchedCount === 0) throw new AppError(409, 'PEDIDO_MODIFICADO', 'El pedido cambió mientras lo marcabas: recarga la pantalla.')
        for (const evento of eventos) await registrarEvento({ ...evento, session })
        return { pedidoId: String(pedido._id), estado: codigo, estacionesListas: nuevasListas }
    })
    // 2.4 · Después de confirmar: todas las estaciones releen (el pedido sale o entra de sus colas)
    publicar([CANAL_TODAS_LAS_ESTACIONES], { tipo: 'pedido_estacion', ids: { pedidoId: resultado.pedidoId } })
    return resultado
}
