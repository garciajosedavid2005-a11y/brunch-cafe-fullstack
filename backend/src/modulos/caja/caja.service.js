import mongoose from 'mongoose'
import Cuenta from '../salon/cuenta.model.js'
import Usuario from '../identidad/usuario.model.js'
import Evento from '../compartido/evento.model.js'
import Contador from '../compartido/contador.model.js'
import { AppError } from '../compartido/errors.js'
import { tienePermiso } from '../identidad/permisos.js'
import { fechaLocal, instanteLocal } from '../compartido/fechas.js'
import Comprobante, { LEYENDAS_COMPROBANTE, codigoComprobante } from './comprobante.model.js'

// Fase 3 · Caja (PLAN_FASE_3 §3.1–3.3): lecturas de la caja y emisión del comprobante interno. El cobro
// (la transacción con la cuenta y las mesas) está en salon/cuentas.service.js (cobrarCuenta), que llama a
// emitirComprobante dentro de la misma transacción.
const MAXIMO_LISTA = 200
const CONTADOR = 'comprobante'

export const exigirCobro = (sesion) => {
    if (!tienePermiso(sesion?.permisos || [], 'cuenta:cobrar')) {
        throw new AppError(403, 'FORBIDDEN', 'No tienes permiso para realizar esta acción.', { requiere: ['cuenta:cobrar'] })
    }
}

const nombreCorto = (u) => (u ? [u.nombre, u.apellido?.[0] ? `${u.apellido[0]}.` : ''].filter(Boolean).join(' ') : '')
const nombresDe = async (ids, session) => {
    const usuarios = await Usuario.find({ _id: { $in: ids } }).select('nombre apellido').session(session ?? null).lean()
    return new Map(usuarios.map((u) => [String(u._id), nombreCorto(u)]))
}

// ── Pagos ──────────────────────────────────────────────────────────────────────────────
/**
 * Comprueba que los pagos sumen exactamente total + propina y calcula el cambio del efectivo
 * (sin `recibido`, se entiende que entregó lo justo). Lanza 400 PAGO_NO_CUADRA o EFECTIVO_INSUFICIENTE.
 */
export const calcularPagos = (pagos, totalACobrar) => {
    const suma = pagos.reduce((n, p) => n + p.monto, 0)
    if (suma !== totalACobrar) {
        throw new AppError(400, 'PAGO_NO_CUADRA', `Los pagos suman ${suma} y hay que cobrar ${totalACobrar}.`, { suma, total: totalACobrar })
    }
    return pagos.map((p) => {
        if (p.metodo !== 'efectivo') return { metodo: p.metodo, monto: p.monto, recibido: null, cambio: null }
        const recibido = p.recibido ?? p.monto
        if (recibido < p.monto) {
            throw new AppError(400, 'EFECTIVO_INSUFICIENTE', 'Lo recibido en efectivo no alcanza para su parte del pago.', { recibido, monto: p.monto })
        }
        return { metodo: 'efectivo', monto: p.monto, recibido, cambio: recibido - p.monto }
    })
}

// ── Comprobante ────────────────────────────────────────────────────────────────────────
/** El contador existe antes de la transacción (su primer upsert no compite dentro de ella). */
export const asegurarContador = async () => {
    try {
        await Contador.updateOne({ _id: CONTADOR }, { $setOnInsert: { seq: 0 } }, { upsert: true })
    } catch (error) {
        if (error?.code !== 11000) throw error // otro lo creó a la vez
    }
}

export const formatoComprobante = (c) => ({
    id: String(c._id),
    numero: c.numero,
    codigo: c.codigo,
    cuentaId: String(c.cuenta),
    mesas: c.mesas,
    mesero: c.mesero?.nombre || '',
    cajero: c.cajero?.nombre || '',
    emitidoEn: c.emitidoEn,
    lineas: c.lineas.map((l) => ({ nombre: l.nombre, cantidad: l.cantidad, opciones: l.opciones, nota: l.nota || '', precioUnitario: l.precioUnitario, subtotal: l.subtotal })),
    subtotal: c.subtotal,
    propina: c.propina,
    total: c.total,
    pagos: c.pagos.map((p) => ({ metodo: p.metodo, monto: p.monto, recibido: p.recibido ?? null, cambio: p.cambio ?? null })),
    cambio: c.cambio,
    leyendas: LEYENDAS_COMPROBANTE,
})

/**
 * Dentro de la transacción del cobro: toma el siguiente consecutivo (el contador se incrementa en la
 * misma transacción: si el cobro falla, el número no se gasta y no quedan huecos) y guarda la copia
 * de lo cobrado: ítems enviados y no anulados, propina y pagos.
 */
export const emitirComprobante = async ({ cuenta, comandas, propina, total, pagos, sesion, session }) => {
    // upsert por si el contador falta (asegurarContador ya lo crea antes, fuera de la transacción)
    const { seq: numero } = await Contador.findOneAndUpdate({ _id: CONTADOR }, { $inc: { seq: 1 } }, { returnDocument: 'after', upsert: true, session })
    const nombres = await nombresDe([cuenta.mesero, sesion.id], session)
    const lineas = comandas.filter((c) => c.estado === 'enviada').flatMap((c) => c.items)
        .filter((i) => i.estado !== 'anulado')
        .map((i) => ({
            nombre: i.nombre, cantidad: i.cantidad, opciones: (i.modificadores || []).map((m) => m.opcionNombre),
            nota: i.nota || '', precioUnitario: i.precioUnitario, subtotal: i.subtotal,
        }))
    // Los montos los calcula el servidor: si el esquema los rechaza es un fallo nuestro (500, queda en el
    // log y la transacción se deshace), no un dato mal enviado por el cajero (no un 400 de validación)
    const [comprobante] = await Comprobante.create([{
        numero,
        codigo: codigoComprobante(numero),
        cuenta: cuenta._id,
        mesas: cuenta.mesas.map((m) => m.numero),
        mesero: { id: cuenta.mesero, nombre: nombres.get(String(cuenta.mesero)) || '' },
        cajero: { id: sesion.id, nombre: nombres.get(String(sesion.id)) || '' },
        emitidoEn: new Date(),
        lineas,
        subtotal: cuenta.subtotal,
        propina,
        total, // el mismo con el que se validaron los pagos (consumo + propina)
        pagos,
        cambio: pagos.reduce((n, p) => n + (p.cambio ?? 0), 0),
    }], { session }).catch((error) => {
        if (error?.name !== 'ValidationError') throw error
        // El detalle (qué invariante falló) va al log como causa, no a la respuesta
        throw new AppError(500, 'COMPROBANTE_INCONSISTENTE', 'No se pudo emitir el comprobante. Avisa al administrador.', undefined, { cause: error })
    })
    return comprobante
}

// ── Lecturas de la caja ────────────────────────────────────────────────────────────────
/** Cuentas en «cuenta pedida» (las únicas que se cobran, F3-6), de la que más espera a la más nueva. */
export const listarPorCobrar = async (sesion) => {
    exigirCobro(sesion)
    const cuentas = await Cuenta.find({ estado: 'cuenta_pedida' }).sort({ updatedAt: 1 }).limit(MAXIMO_LISTA)
        .select('codigo mesas mesero comensales subtotal total version').lean()
    const ids = cuentas.map((c) => c._id)
    const [nombres, pedidas] = await Promise.all([
        nombresDe(cuentas.map((c) => c.mesero)),
        // Cuándo se pidió la cuenta: el último paso a «cuenta pedida» (índice entidad/entidadId/createdAt)
        Evento.aggregate([
            { $match: { entidad: 'cuenta', entidadId: { $in: ids }, a: 'cuenta_pedida' } },
            { $sort: { createdAt: -1 } },
            { $group: { _id: '$entidadId', en: { $first: '$createdAt' } } },
        ]),
    ])
    const pedidaEn = new Map(pedidas.map((p) => [String(p._id), p.en]))
    return {
        cuentas: cuentas.map((c) => ({
            id: String(c._id), codigo: c.codigo, mesas: c.mesas.map((m) => m.numero),
            mesero: nombres.get(String(c.mesero)) || '', comensales: c.comensales,
            subtotal: c.subtotal, total: c.total, version: c.version, pedidaEn: pedidaEn.get(String(c._id)) || null,
        })),
    }
}

/** «Cobradas hoy»: comprobantes del día en Bogotá, el más reciente primero. */
export const listarDeHoy = async (sesion) => {
    exigirCobro(sesion)
    const desde = instanteLocal(fechaLocal(), '00:00')
    const comprobantes = await Comprobante.find({ emitidoEn: { $gte: desde } }).sort({ numero: -1 }).limit(MAXIMO_LISTA).lean()
    return {
        comprobantes: comprobantes.map((c) => ({
            id: String(c._id), codigo: c.codigo, mesas: c.mesas, total: c.total, emitidoEn: c.emitidoEn,
            cajero: c.cajero?.nombre || '', metodos: c.pagos.map((p) => p.metodo),
        })),
    }
}

export const obtenerComprobante = async (id, sesion) => {
    exigirCobro(sesion)
    const noExiste = () => new AppError(404, 'COMPROBANTE_NO_ENCONTRADO', 'El comprobante no existe.')
    if (!mongoose.isValidObjectId(id)) throw noExiste()
    const comprobante = await Comprobante.findById(id).lean()
    if (!comprobante) throw noExiste()
    return formatoComprobante(comprobante)
}
