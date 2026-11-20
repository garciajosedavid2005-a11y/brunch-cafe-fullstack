import Usuario from '../identidad/usuario.model.js'
import MovimientoPuntos from './movimientoPuntos.model.js'
import Comprobante from '../caja/comprobante.model.js'
import { AppError } from '../compartido/errors.js'
import { logger } from '../compartido/logger.js'
import { PESOS_POR_PUNTO, BLOQUE_CANJE, VALOR_BLOQUE, puntosGanados, descuentoPorPuntos } from './reglas.js'

// 6.6 (F6-5, F6-c) · Puntos: 1 por cada $1.000 pagados del consumo (después de descuentos, sin propina, hacia abajo);
// canje en la caja en bloques de 100 = $10.000, solo en el cobro completo y sin superar el consumo; un comprobante
// anulado revierte lo ganado y devuelve lo canjeado (lo que de verdad se registró en el libro).
export { PESOS_POR_PUNTO, BLOQUE_CANJE, VALOR_BLOQUE, puntosGanados, descuentoPorPuntos }
export const MAX_HISTORIAL = 50

/**
 * Cambia el saldo y deja el movimiento (en la transacción de quien llama). Con `puntos` negativos exige saldo
 * suficiente, salvo en una reversión (`permitirNegativo`: el cliente ya gastó lo que se le quita; F6-c).
 */
const mover = async ({ usuarioId, tipo, puntos, referencia, detalle = '', permitirNegativo = false, session }) => {
    if (!puntos) return null
    const filtro = { _id: usuarioId, ...(puntos < 0 && !permitirNegativo ? { puntos: { $gte: -puntos } } : {}) }
    const usuario = await Usuario.findOneAndUpdate(filtro, { $inc: { puntos } }, { returnDocument: 'after', session }).select('puntos').lean()
    if (!usuario) {
        // Sin saldo para el canje, 409. Si el usuario ya no existe (acumular o revertir), no se bloquea el cobro ni la
        // anulación: no se mueve nada y queda en el log
        if (tipo === 'canjea') throw new AppError(409, 'PUNTOS_INSUFICIENTES', 'El cliente no tiene puntos suficientes para ese canje.')
        logger.warn({ evento: 'puntos_sin_usuario', usuario: String(usuarioId), tipo, referencia: referencia.codigo }, 'puntos sin usuario')
        return null
    }
    const [movimiento] = await MovimientoPuntos.create([{
        usuario: usuarioId, tipo, puntos, saldoDespues: usuario.puntos, referencia, detalle,
    }], { session }).catch((error) => {
        if (error?.code === 11000) throw new AppError(409, 'PUNTOS_YA_REGISTRADOS', 'Los puntos de este comprobante ya se registraron.')
        throw error
    })
    return movimiento
}

const refComprobante = (c) => ({ modelo: 'Comprobante', id: c._id, codigo: c.codigo })

/** Al emitir un comprobante con cliente: descuenta lo canjeado y suma lo ganado (los trae `comprobante.puntos`). */
export const registrarPuntosDelCobro = async ({ comprobante, session }) => {
    const p = comprobante.puntos
    if (!p?.cliente) return
    await mover({ usuarioId: p.cliente, tipo: 'canjea', puntos: -(p.canjeados || 0), referencia: refComprobante(comprobante), detalle: `Canje en ${comprobante.codigo}`, session })
    await mover({ usuarioId: p.cliente, tipo: 'acumula', puntos: p.ganados || 0, referencia: refComprobante(comprobante), detalle: `Compra ${comprobante.codigo}`, session })
}

/**
 * 6.6 · Domicilio: acumula al ENTREGARSE (F6-5). Si se cobró antes (en camino), sus puntos quedaron en el comprobante y se
 * registran aquí, en la transacción del cambio a «entregado». Idempotente (no registra dos veces el mismo comprobante).
 */
export const acreditarDomicilioEntregado = async ({ pedidoId, session }) => {
    const comprobante = await Comprobante.findOne({ pedido: pedidoId }).session(session).lean()
    if (!comprobante?.puntos?.cliente) return
    if (await MovimientoPuntos.exists({ tipo: 'acumula', 'referencia.id': comprobante._id }).session(session)) return
    await registrarPuntosDelCobro({ comprobante, session })
}

/**
 * Al anular un comprobante (nota crédito): quita lo ganado y devuelve lo canjeado, en un solo movimiento. Según lo que
 * de verdad se registró en el libro (un domicilio cobrado y aún no entregado no sumó nada).
 */
export const revertirPuntos = async ({ comprobante, nota, session }) => {
    const p = comprobante.puntos
    if (!p?.cliente) return
    const registrados = await MovimientoPuntos.find({ 'referencia.id': comprobante._id, tipo: { $in: ['acumula', 'canjea'] } }).session(session).lean()
    const neto = -registrados.reduce((n, m) => n + m.puntos, 0) // devuelve lo canjeado y quita lo ganado
    await mover({
        usuarioId: p.cliente, tipo: 'revierte', puntos: neto, permitirNegativo: true,
        referencia: { modelo: 'NotaCredito', id: nota._id, codigo: nota.codigo }, detalle: `Anulación de ${comprobante.codigo}`, session,
    })
}

/** Saldo del usuario. */
export const saldoDe = async (usuarioId, session = null) => (await Usuario.findById(usuarioId).select('puntos').session(session).lean())?.puntos || 0

/**
 * Lo que va al comprobante: quién gana, lo canjeado (validado: bloques de 100, con saldo y sin superar el consumo)
 * y lo ganado sobre lo pagado del consumo. Sin cliente, null (ni gana ni canjea).
 */
export const puntosDelCobro = async ({ clienteId, consumo, canjear = 0, session }) => {
    if (!Number.isSafeInteger(canjear) || canjear < 0 || canjear % BLOQUE_CANJE !== 0) {
        throw new AppError(400, 'CANJE_NO_VALIDO', `Los puntos se canjean en bloques de ${BLOQUE_CANJE}.`)
    }
    if (!clienteId) {
        if (canjear) throw new AppError(400, 'CANJE_SIN_CLIENTE', 'Para canjear puntos, identifica primero al cliente de la cuenta.')
        return { puntos: null, descuento: 0 }
    }
    const descuento = descuentoPorPuntos(canjear)
    if (descuento > consumo) throw new AppError(400, 'CANJE_SUPERA_CONSUMO', 'El canje no puede superar el consumo de la cuenta.', { consumo, descuento })
    if (canjear && (await saldoDe(clienteId, session)) < canjear) {
        throw new AppError(409, 'PUNTOS_INSUFICIENTES', 'El cliente no tiene puntos suficientes para ese canje.')
    }
    return { puntos: { cliente: clienteId, canjeados: canjear, ganados: puntosGanados(consumo - descuento) }, descuento }
}

/** 6.6 · GET /cliente/puntos: saldo, reglas y los últimos movimientos. */
export const misPuntos = async (usuarioId) => {
    const [saldo, movimientos] = await Promise.all([
        saldoDe(usuarioId),
        MovimientoPuntos.find({ usuario: usuarioId }).sort({ createdAt: -1, _id: -1 }).limit(MAX_HISTORIAL).lean(),
    ])
    return {
        saldo,
        reglas: { pesosPorPunto: PESOS_POR_PUNTO, bloque: BLOQUE_CANJE, valorBloque: VALOR_BLOQUE },
        movimientos: movimientos.map((m) => ({
            id: String(m._id), tipo: m.tipo, puntos: m.puntos, saldoDespues: m.saldoDespues,
            referencia: m.referencia.codigo, detalle: m.detalle, fecha: m.createdAt,
        })),
    }
}
