// Fase 5 (F5-3, F5-e) · Núcleo del inventario: aplica movimientos dentro de la transacción de quien llama.
// Cada movimiento cambia la existencia con UNA escritura atómica (pipeline con $round: sin arrastrar el error
// del punto flotante y sin leer-modificar-escribir) y queda en el libro con la existencia resultante.
import mongoose from 'mongoose'
import Insumo from './insumo.model.js'
import MovimientoInventario from './movimiento.model.js'
import { AppError } from '../compartido/errors.js'
import { redondear, MAX_CANTIDAD_INVENTARIO } from './cantidades.js'

/** Rol de quien hace el cambio, o «sistema» para los efectos automáticos. */
export const actorDe = (sesion, sistema = false) => (sistema ? 'sistema' : sesion?.rol || 'staff')

/**
 * Aplica `lineas` = [{ insumo (id), cantidad (con signo), tipo, costoUnitario? }] en `session`.
 * - `costoUnitario` de una recepción recalcula el costo promedio (promedio ponderado sobre la existencia
 *   positiva); en los demás tipos el movimiento guarda el promedio vigente.
 * - Agrupa las líneas del mismo insumo y tipo (dos ítems con leche → un movimiento por insumo).
 * Devuelve los movimientos creados (lean) con { insumo, nombre, unidad, cantidad, existenciaDespues }.
 */
export const aplicarMovimientos = async (lineas, { motivo, sesion, sistema = false, referencia, session }) => {
    if (!session) throw new Error('aplicarMovimientos necesita la sesión de la transacción')
    // Una línea por insumo y tipo (el índice `una_vez_por_referencia` lo exige). Dos recepciones del mismo insumo
    // se juntan con su costo ponderado (Σ cantidad × costo / Σ cantidad)
    const agrupadas = new Map()
    for (const l of lineas) {
        const clave = `${l.insumo}|${l.tipo}`
        const previa = agrupadas.get(clave) || { insumo: String(l.insumo), tipo: l.tipo, cantidad: 0, costoTotal: 0, conCosto: false }
        previa.cantidad += l.cantidad
        if (l.costoUnitario !== undefined) {
            previa.conCosto = true
            previa.costoTotal += l.cantidad * l.costoUnitario
        }
        agrupadas.set(clave, previa)
    }
    for (const l of agrupadas.values()) {
        if (l.conCosto) l.costoUnitario = l.cantidad ? redondear(l.costoTotal / l.cantidad, 2) : 0
        l.cantidad = redondear(l.cantidad)
    }
    const creados = []
    for (const l of agrupadas.values()) {
        if (l.cantidad === 0) continue
        const recepcion = l.costoUnitario !== undefined
        const nuevaExistencia = { $round: [{ $add: ['$existencia', l.cantidad] }, 3] }
        const set = { existencia: nuevaExistencia }
        if (recepcion) {
            // (máx(existencia, 0) × promedio + cantidad × costo) / (máx(existencia, 0) + cantidad)
            const base = { $max: ['$existencia', 0] }
            set.costoPromedio = {
                $round: [{
                    $divide: [
                        { $add: [{ $multiply: [base, '$costoPromedio'] }, l.cantidad * l.costoUnitario] },
                        { $add: [base, l.cantidad] },
                    ],
                }, 2],
            }
        }
        // El pipeline no corre los validadores del esquema: el tope de la existencia va en el filtro
        const insumo = await Insumo.findOneAndUpdate(
            { _id: l.insumo, $expr: { $lte: [{ $abs: { $add: ['$existencia', l.cantidad] } }, MAX_CANTIDAD_INVENTARIO] } },
            [{ $set: set }],
            { returnDocument: 'after', session, updatePipeline: true },
        ).lean()
        if (!insumo) {
            if (await Insumo.exists({ _id: l.insumo }).session(session)) {
                throw new AppError(409, 'EXISTENCIA_FUERA_DE_RANGO', 'La existencia resultante supera el máximo permitido. Revisa la cantidad.')
            }
            throw new AppError(404, 'INSUMO_NO_ENCONTRADO', 'El insumo no existe.')
        }
        const [mov] = await MovimientoInventario.create([{
            insumo: insumo._id,
            tipo: l.tipo,
            cantidad: l.cantidad,
            existenciaDespues: insumo.existencia,
            costoUnitario: recepcion ? l.costoUnitario : insumo.costoPromedio,
            motivo,
            usuario: sesion?.id || null,
            actor: actorDe(sesion, sistema),
            referencia,
        }], { session })
        creados.push({ insumo: String(insumo._id), nombre: insumo.nombre, unidad: insumo.unidad, cantidad: mov.cantidad, existenciaDespues: mov.existenciaDespues, tipo: mov.tipo })
    }
    return creados
}

/** Neto que consumió cada insumo una referencia (consumo − devoluciones): lo que falta por devolver. */
export const pendientePorDevolver = async (referencias, session) => {
    const ids = referencias.map((r) => new mongoose.Types.ObjectId(String(r.id)))
    const tipos = [...new Set(referencias.map((r) => r.tipo))]
    const filas = await MovimientoInventario.aggregate([
        { $match: { 'referencia.tipo': { $in: tipos }, 'referencia.id': { $in: ids }, tipo: { $in: ['consumo', 'devolucion'] } } },
        { $group: { _id: '$insumo', neto: { $sum: '$cantidad' } } },
    ]).session(session)
    return filas.map((f) => ({ insumo: String(f._id), neto: redondear(f.neto) })).filter((f) => f.neto < 0)
}
