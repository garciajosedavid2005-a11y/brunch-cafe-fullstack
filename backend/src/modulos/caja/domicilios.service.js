import mongoose from 'mongoose'
import Pedido from '../pedidos/pedido.model.js'
import DetallePedido from '../pedidos/detallePedido.model.js'
import Estado from '../compartido/estado.model.js'
import Comprobante, { codigoComprobante } from './comprobante.model.js'
import Contador from '../compartido/contador.model.js'
import Usuario from '../identidad/usuario.model.js'
// Registra el modelo para el populate del método de pago
import '../pedidos/metodoPago.model.js'
import { AppError } from '../compartido/errors.js'
import { conTransaccion } from '../compartido/transacciones.js'
import { registrarEvento } from '../compartido/estados.service.js'
import { tienePermiso } from '../identidad/permisos.js'
import { nombreCorto, CAMPOS_NOMBRE } from '../compartido/nombres.js'
import { codigoPedido } from '../pedidos/pedidoComoCuenta.js'
import { cobrarSchema } from './caja.schema.js'
import { asegurarContador, calcularPagos, formatoComprobante } from './caja.service.js'
import { tomarTurnoAbierto } from './turno.service.js'

// Fase 3b.4 · Cobro de un domicilio al recibirlo (PLAN_FASE_3B, F3b-6): lo registra el cajero o el
// repartidor (pedido:cobrar) con el pedido «en camino» o «entregado» y sin comprobante. Exige un turno de caja
// abierto (el dinero entra a esa caja). Emite un comprobante del pedido (sus líneas, propina y pagos) con el
// mismo consecutivo CI-… de la caja; un pedido se cobra una sola vez (índice único parcial).
export const ESTADOS_COBRABLES = ['en_camino', 'entregado']
// Solo los pedidos de las últimas 48 h: los entregados de antes de 3b.4 (o de días atrás) no se cobran en el
// turno de hoy (descuadrarían el arqueo). Brayan (confirmada el 2026-11-15)
export const VENTANA_COBRO_MS = 48 * 60 * 60 * 1000
const recientes = () => ({ createdAt: { $gte: new Date(Date.now() - VENTANA_COBRO_MS) } })
const MAXIMO_LISTA = 200
const cobroSchema = cobrarSchema.omit({ versionEsperada: true })
// 6.1 · Todos los pedidos tienen canal (migración 6.1)
const DOMICILIO = { canal: 'domicilio' }

// Sin pago en línea, todo domicilio se paga al recibir (Contra Entrega, Tarjeta débito o crédito con datáfono):
// cualquiera se cobra UNA vez en la caja con su método real, para que entre en el arqueo (Brayan, 2026-11-15).
// El método del pedido solo sugiere cómo se cobra: «Contra Entrega» → efectivo; una tarjeta → tarjeta.
const normalizar = (texto) => String(texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[\s_-]+/g, ' ').trim()
export const esContraEntrega = (metodo) => metodo?.codigo === 'contra-entrega' || normalizar(metodo?.nombre) === 'contra entrega'
export const metodoSugerido = (metodo) => (!esContraEntrega(metodo) && /tarjeta/.test(normalizar(`${metodo?.codigo || ''} ${metodo?.nombre || ''}`)) ? 'tarjeta' : 'efectivo')

const exigir = (sesion, ...claves) => {
    if (!claves.some((c) => tienePermiso(sesion?.permisos || [], c))) {
        throw new AppError(403, 'FORBIDDEN', 'No tienes permiso para realizar esta acción.', { requiere: claves })
    }
}

const idsDeEstados = async (codigos, session) =>
    (await Estado.find({ tipo: 'pedido', codigo: { $in: codigos } }).select('_id codigo').session(session ?? null).lean())

/** Línea del comprobante desde el detalle del pedido (las anteriores a 1.12 no tienen precioUnitario). */
const lineaDeDetalle = (d) => {
    const precioUnitario = d.precioUnitario ?? d.precioProducto
    if (!Number.isSafeInteger(precioUnitario)) {
        throw new AppError(409, 'PEDIDO_SIN_PRECIOS', 'Una línea del pedido no tiene precio. Avisa al administrador.')
    }
    return {
        nombre: d.nombreProducto, cantidad: d.cantidad, opciones: (d.modificadores || []).map((m) => m.opcionNombre),
        nota: d.nota || '', precioUnitario, subtotal: precioUnitario * d.cantidad,
    }
}

/** GET /staff/caja/domicilios: pedidos en camino o entregados (cualquier método de pago) que aún no se cobraron. */
export const listarDomiciliosPorCobrar = async (sesion) => {
    exigir(sesion, 'pedido:cobrar', 'cuenta:cobrar')
    const estados = await idsDeEstados(ESTADOS_COBRABLES)
    const codigoDe = new Map(estados.map((e) => [String(e._id), e.codigo]))
    // Los ya cobrados se excluyen en la consulta, antes del límite (un pedido de las últimas 48 h solo pudo
    // cobrarse en ese plazo): así 200 cobrados no tapan a los pendientes
    const cobrados = await Comprobante.distinct('pedido', { pedido: { $ne: null }, emitidoEn: { $gte: new Date(Date.now() - VENTANA_COBRO_MS) } })
    const pedidos = await Pedido.find({ ...DOMICILIO, ...recientes(), _id: { $nin: cobrados }, estado: { $in: estados.map((e) => e._id) } }).sort({ createdAt: -1 })
        .limit(MAXIMO_LISTA).populate('metodoPago', 'nombre codigo').lean()
    return {
        domicilios: pedidos.map((p) => ({
            id: String(p._id), codigo: codigoPedido(p._id), estado: codigoDe.get(String(p.estado)) || '',
            cliente: p.nombreEntrega || '', direccion: [p.direccion, p.barrio].filter(Boolean).join(' · '),
            horaEntrega: p.horaEntrega || '', metodoPago: p.metodoPago?.nombre || '', metodoSugerido: metodoSugerido(p.metodoPago), total: p.total,
        })),
    }
}

/** POST /staff/caja/domicilios/:id/cobrar { propina, pagos } → 201 { comprobante } */
export const cobrarDomicilio = async (id, datos, sesion) => {
    exigir(sesion, 'pedido:cobrar')
    const r = cobroSchema.safeParse(datos ?? {})
    if (!r.success) {
        throw new AppError(400, 'VALIDATION_ERROR', r.error.issues[0]?.message || 'Datos no válidos',
            r.error.issues.map((i) => ({ campo: i.path.join('.'), mensaje: i.message })))
    }
    const { propina, pagos } = r.data
    const noExiste = () => new AppError(404, 'PEDIDO_NO_ENCONTRADO', 'El pedido no existe.')
    if (!mongoose.isValidObjectId(id)) throw noExiste()
    await asegurarContador()
    const yaCobrado = () => new AppError(409, 'PEDIDO_YA_COBRADO', 'Este domicilio ya se cobró.')

    try {
        return await conTransaccion(async (session) => {
            const turno = await tomarTurnoAbierto(session)
            const estados = await idsDeEstados(ESTADOS_COBRABLES, session)
            // Escritura condicional: choca con un cambio de estado simultáneo (p. ej. cancelarlo)
            const pedido = await Pedido.findOneAndUpdate(
                { _id: id, ...DOMICILIO, ...recientes(), estado: { $in: estados.map((e) => e._id) } }, { $currentDate: { updatedAt: true } }, { returnDocument: 'after', session },
            ).lean()
            if (!pedido) {
                if (!(await Pedido.exists({ _id: id }).session(session))) throw noExiste()
                throw new AppError(409, 'PEDIDO_NO_COBRABLE', 'Solo se cobra un domicilio en camino o entregado de las últimas 48 horas.')
            }
            if (await Comprobante.exists({ pedido: pedido._id }).session(session)) throw yaCobrado()
            const lineas = (await DetallePedido.find({ pedido: pedido._id }).session(session).lean()).map(lineaDeDetalle)
            if (!lineas.length) throw new AppError(409, 'PEDIDO_SIN_LINEAS', 'El pedido no tiene productos para cobrar.')
            const subtotal = lineas.reduce((n, l) => n + l.subtotal, 0)
            // El comprobante cobra lo mismo que dice el pedido (sin domicilio ni descuentos hoy): si no cuadra, no se cobra
            if (subtotal !== pedido.total) {
                throw new AppError(409, 'PEDIDO_TOTAL_INCONSISTENTE', 'El total del pedido no coincide con sus productos. Avisa al administrador.', { total: pedido.total, lineas: subtotal })
            }
            const total = subtotal + propina
            const pagosCalculados = calcularPagos(pagos, total)
            const { seq: numero } = await Contador.findOneAndUpdate({ _id: 'comprobante' }, { $inc: { seq: 1 } }, { returnDocument: 'after', upsert: true, session })
            const cobrador = await Usuario.findById(sesion.id).select(CAMPOS_NOMBRE).session(session).lean()
            const codigo = codigoPedido(pedido._id)
            const [comprobante] = await Comprobante.create([{
                numero, codigo: codigoComprobante(numero), pedido: pedido._id, pedidoCodigo: codigo, turno: turno._id,
                mesas: [], cajero: { id: sesion.id, nombre: nombreCorto(cobrador) }, emitidoEn: new Date(),
                lineas, subtotal, propina, total, pagos: pagosCalculados, cambio: pagosCalculados.reduce((n, p) => n + (p.cambio ?? 0), 0),
            }], { session }).catch((error) => {
                if (error?.name !== 'ValidationError') throw error
                throw new AppError(500, 'COMPROBANTE_INCONSISTENTE', 'No se pudo emitir el comprobante. Avisa al administrador.', undefined, { cause: error })
            })
            await registrarEvento({
                entidad: 'pedido', entidadId: pedido._id, tipo: 'pedido_cobrado', usuario: sesion.id, actor: sesion.rol || 'staff',
                datos: { comprobante: comprobante.codigo, subtotal, propina, total, pagos: pagosCalculados.map((p) => ({ metodo: p.metodo, monto: p.monto })) },
                session,
            })
            return { comprobante: formatoComprobante(comprobante) }
        })
    } catch (error) {
        if (error?.code === 11000 && error?.keyPattern?.pedido) throw yaCobrado() // dos cobros a la vez
        throw error
    }
}
