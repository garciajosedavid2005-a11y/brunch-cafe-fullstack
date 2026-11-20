import mongoose from 'mongoose'
import { registrarPuntosDelCobro, saldoDe } from '../fidelizacion/puntos.service.js'
import Cuenta from '../salon/cuenta.model.js'
import Comanda from '../salon/comanda.model.js'
import Usuario from '../identidad/usuario.model.js'
import Evento from '../compartido/evento.model.js'
import Contador from '../compartido/contador.model.js'
import { AppError } from '../compartido/errors.js'
import { tienePermiso } from '../identidad/permisos.js'
import { fechaLocal, instanteLocal } from '../compartido/fechas.js'
import Comprobante, { LEYENDAS_COMPROBANTE, codigoComprobante } from './comprobante.model.js'
import { nombreCorto, CAMPOS_NOMBRE } from '../compartido/nombres.js'
import { notasDe } from './anulacion.service.js'

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

const nombresDe = async (ids, session) => {
    const usuarios = await Usuario.find({ _id: { $in: ids } }).select(CAMPOS_NOMBRE).session(session ?? null).lean()
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
    cuentaId: c.cuenta ? String(c.cuenta) : null,
    pedidoId: c.pedido ? String(c.pedido) : null,
    pedido: c.pedidoCodigo || null,
    parte: c.parte ? { modo: c.parte.modo, numero: c.parte.numero, de: c.parte.de ?? null } : null,
    mesas: c.mesas,
    mesero: c.mesero?.nombre || '',
    cajero: c.cajero?.nombre || '',
    emitidoEn: c.emitidoEn,
    lineas: c.lineas.map((l) => ({ nombre: l.nombre, cantidad: l.cantidad, opciones: l.opciones, nota: l.nota || '', precioUnitario: l.precioUnitario, subtotal: l.subtotal })),
    subtotal: c.subtotal,
    descuentos: (c.descuentos || []).map((d) => ({ tipo: d.tipo, monto: d.monto, detalle: d.detalle || '' })), // 6.6
    propina: c.propina,
    total: c.total,
    puntos: c.puntos ? { canjeados: c.puntos.canjeados || 0, ganados: c.puntos.ganados || 0 } : null, // 6.6 · sin el id del cliente
    pagos: c.pagos.map((p) => ({ metodo: p.metodo, monto: p.monto, recibido: p.recibido ?? null, cambio: p.cambio ?? null })),
    cambio: c.cambio,
    leyendas: LEYENDAS_COMPROBANTE,
})

/**
 * Dentro de la transacción del cobro: toma el siguiente consecutivo (el contador se incrementa en la
 * misma transacción: si el cobro falla, el número no se gasta y no quedan huecos) y guarda la copia
 * de lo cobrado: ítems enviados y no anulados, propina y pagos.
 */
export const emitirComprobante = async ({ cuenta, comandas, propina, total, pagos, sesion, session, turno, lineas: lineasParte, subtotal, parte = null, descuentos = [], puntos = null }) => {
    // 3b.1 · Todo comprobante nuevo es de un turno abierto (lo exige el cobro); sin él es un fallo nuestro
    if (!turno?._id) throw new AppError(500, 'COMPROBANTE_SIN_TURNO', 'No se pudo emitir el comprobante. Avisa al administrador.')
    // upsert por si el contador falta (asegurarContador ya lo crea antes, fuera de la transacción)
    const { seq: numero } = await Contador.findOneAndUpdate({ _id: CONTADOR }, { $inc: { seq: 1 } }, { returnDocument: 'after', upsert: true, session })
    const nombres = await nombresDe([cuenta.mesero, sesion.id], session)
    // 3b.2 · Una parte trae sus líneas y su subtotal; la cuenta entera, todo lo enviado y no anulado
    const lineas = lineasParte ?? comandas.filter((c) => c.estado === 'enviada').flatMap((c) => c.items)
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
        turno: turno._id,
        mesas: cuenta.mesas.map((m) => m.numero),
        mesero: { id: cuenta.mesero, nombre: nombres.get(String(cuenta.mesero)) || '' },
        cajero: { id: sesion.id, nombre: nombres.get(String(sesion.id)) || '' },
        emitidoEn: new Date(),
        lineas,
        subtotal: subtotal ?? cuenta.subtotal,
        parte,
        descuentos, // 6.6
        propina,
        total, // el mismo con el que se validaron los pagos (consumo − descuentos + propina)
        puntos, // 6.6
        pagos,
        cambio: pagos.reduce((n, p) => n + (p.cambio ?? 0), 0),
    }], { session }).catch((error) => {
        // 3b.2 · Esa parte (o la cuenta entera) ya tiene comprobante: otro cobro llegó antes
        if (error?.code === 11000 && error?.keyPattern?.cuenta) {
            throw new AppError(409, 'PARTE_YA_COBRADA', 'Esa parte de la cuenta ya se cobró. Vuelve a la caja para ver lo que falta.')
        }
        if (error?.name !== 'ValidationError') throw error
        // El detalle (qué invariante falló) va al log como causa, no a la respuesta
        throw new AppError(500, 'COMPROBANTE_INCONSISTENTE', 'No se pudo emitir el comprobante. Avisa al administrador.', undefined, { cause: error })
    })
    await registrarPuntosDelCobro({ comprobante, session }) // 6.6 · en la misma transacción
    return comprobante
}

// ── Lecturas de la caja ────────────────────────────────────────────────────────────────
/** Cuentas en «cuenta pedida» (las únicas que se cobran, F3-6), de la que más espera a la más nueva. */
export const listarPorCobrar = async (sesion) => {
    exigirCobro(sesion)
    const cuentas = await Cuenta.find({ estado: 'cuenta_pedida' }).sort({ updatedAt: 1 }).limit(MAXIMO_LISTA)
        .select('codigo canal paraLlevar cliente mesas mesero comensales subtotal total version division').lean()
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
            id: String(c._id), codigo: c.codigo, mesas: c.mesas.map((m) => m.numero), paraLlevar: paraLlevarDe(c), cliente: clienteDe(c),
            mesero: nombres.get(String(c.mesero)) || '', comensales: c.comensales,
            subtotal: c.subtotal, total: c.total, version: c.version, pedidaEn: pedidaEn.get(String(c._id)) || null,
            division: formatoDivision(c.division), porCobrar: c.total - (c.division?.cobrado || 0),
        })),
    }
}

/** 6.5 · Cliente identificado: nombre corto, alergias y preferencias (null si no se identificó). */
const clienteDe = (c) => (c.cliente?.usuario
    ? { id: String(c.cliente.usuario), nombre: c.cliente.nombre || '', alergias: c.cliente.alergias || '', preferencias: c.cliente.preferencias || '' }
    : null)

/** 6.3 · Quién recoge una cuenta para llevar (null en el salón). */
const paraLlevarDe = (c) => (c.canal === 'para_llevar' ? { nombre: c.paraLlevar?.nombre || '', telefono: c.paraLlevar?.telefono || '' } : null)

/** 3b.2 · Estado de la división (null si la cuenta no se dividió). */
const formatoDivision = (d) => (d ? { modo: d.modo, partes: d.partes ?? null, cobradas: d.cobradas, cobrado: d.cobrado } : null)

/**
 * 3b.2 · GET /staff/caja/cuentas/:id: lo que necesita la pantalla de cobro para dividir, solo de una cuenta
 * en «cuenta pedida»: sus ítems enviados y no anulados (con si ya se cobraron) y la división en curso.
 */
export const detalleParaCobro = async (id, sesion) => {
    exigirCobro(sesion)
    const noExiste = () => new AppError(404, 'CUENTA_NO_ENCONTRADA', 'La cuenta no existe.')
    if (!mongoose.isValidObjectId(id)) throw noExiste()
    const cuenta = await Cuenta.findById(id).select('codigo canal paraLlevar cliente estado mesas mesero comensales total version division').lean()
    if (!cuenta) throw noExiste()
    if (cuenta.estado !== 'cuenta_pedida') throw new AppError(409, 'CUENTA_NO_EDITABLE', 'La cuenta no está esperando el cobro.', { estado: cuenta.estado })
    const comandas = await Comanda.find({ cuenta: cuenta._id, estado: 'enviada' }).sort({ numeroRonda: 1 }).lean()
    const cobrados = new Set((cuenta.division?.itemsCobrados || []).map(String))
    const nombres = await nombresDe([cuenta.mesero])
    return {
        id: String(cuenta._id), codigo: cuenta.codigo, mesas: cuenta.mesas.map((m) => m.numero), paraLlevar: paraLlevarDe(cuenta), cliente: clienteDe(cuenta),
        puntosCliente: cuenta.cliente?.usuario ? await saldoDe(cuenta.cliente.usuario) : null, // 6.6 · para el canje
        mesero: nombres.get(String(cuenta.mesero)) || '',
        comensales: cuenta.comensales, total: cuenta.total, version: cuenta.version,
        division: formatoDivision(cuenta.division), porCobrar: cuenta.total - (cuenta.division?.cobrado || 0),
        items: comandas.flatMap((c) => c.items).filter((i) => i.estado !== 'anulado').map((i) => ({
            id: String(i._id), nombre: i.nombre, cantidad: i.cantidad, opciones: (i.modificadores || []).map((m) => m.opcionNombre),
            subtotal: i.subtotal, cobrado: cobrados.has(String(i._id)),
        })),
    }
}

/** «Cobradas hoy»: comprobantes del día en Bogotá, el más reciente primero. */
/**
 * Quién puede leer comprobantes: el cajero (cuenta:cobrar) todos; el repartidor (solo pedido:cobrar) únicamente
 * los de domicilios que él mismo cobró, para volver a abrirlos o reimprimirlos (pendiente de 3b).
 * Devuelve el filtro extra para la consulta.
 */
const alcanceLectura = (sesion) => {
    const permisos = sesion?.permisos || []
    if (tienePermiso(permisos, 'cuenta:cobrar')) return {}
    if (tienePermiso(permisos, 'pedido:cobrar') && mongoose.isValidObjectId(sesion?.id)) {
        return { 'cajero.id': new mongoose.Types.ObjectId(String(sesion.id)), pedido: { $type: 'objectId' } }
    }
    throw new AppError(403, 'FORBIDDEN', 'No tienes permiso para realizar esta acción.', { requiere: ['cuenta:cobrar', 'pedido:cobrar'] })
}

export const listarDeHoy = async (sesion) => {
    const alcance = alcanceLectura(sesion)
    const desde = instanteLocal(fechaLocal(), '00:00')
    const comprobantes = await Comprobante.find({ ...alcance, emitidoEn: { $gte: desde } }).sort({ numero: -1 }).limit(MAXIMO_LISTA).lean()
    const notas = await notasDe(comprobantes.map((c) => c._id)) // 3b.3 · los anulados
    return {
        comprobantes: comprobantes.map((c) => ({
            id: String(c._id), codigo: c.codigo, mesas: c.mesas, pedido: c.pedidoCodigo || null, total: c.total, emitidoEn: c.emitidoEn,
            cajero: c.cajero?.nombre || '', metodos: c.pagos.map((p) => p.metodo),
            parte: c.parte ? { modo: c.parte.modo, numero: c.parte.numero, de: c.parte.de ?? null } : null,
            anulado: notas.get(String(c._id)) || null,
        })),
    }
}

export const obtenerComprobante = async (id, sesion) => {
    const alcance = alcanceLectura(sesion)
    const noExiste = () => new AppError(404, 'COMPROBANTE_NO_ENCONTRADO', 'El comprobante no existe.')
    if (!mongoose.isValidObjectId(id)) throw noExiste()
    // Uno ajeno al alcance responde 404, igual que uno que no existe (no revela cuáles hay)
    const comprobante = await Comprobante.findOne({ ...alcance, _id: id }).lean()
    if (!comprobante) throw noExiste()
    const notas = await notasDe([comprobante._id])
    return { ...formatoComprobante(comprobante), anulado: notas.get(String(comprobante._id)) || null }
}
