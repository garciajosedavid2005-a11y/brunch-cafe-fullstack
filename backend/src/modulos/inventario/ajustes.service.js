// Fase 5 · 5.3 (F5-4) · Movimientos manuales con motivo obligatorio: ajuste (conteo físico, suma o resta),
// merma y vencimiento (siempre restan). En una transacción: movimiento, Evento en el insumo y agotado o
// reactivación automáticos de lo que use ese insumo.
import mongoose from 'mongoose'
import { z } from 'zod'
import Insumo from './insumo.model.js'
import { AppError } from '../compartido/errors.js'
import { registrarEvento } from '../compartido/estados.service.js'
import { conTransaccion } from '../compartido/transacciones.js'
import { validar } from '../salon/cuentas.schema.js'
import { MAX_CANTIDAD_INVENTARIO } from './cantidades.js'
import { cantidad, id, motivoObligatorio } from './inventario.schema.js'
import { exigirPermiso } from './insumos.service.js'
import { aplicarMovimientos, actorDe } from './movimientos.service.js'
import { revisarDisponibilidad, avisarCambiosDisponibilidad } from './consumo.service.js'

export const TIPOS_MANUALES = ['ajuste', 'merma', 'vencimiento']

export const movimientoManualSchema = z.strictObject({
    insumoId: id('El insumo'),
    tipo: z.enum(TIPOS_MANUALES, { error: 'El tipo debe ser ajuste, merma o vencimiento' }),
    // Ajuste: con signo (+ entra, − sale). Merma y vencimiento: la cantidad que se pierde (positiva)
    cantidad: cantidad('La cantidad', { min: -MAX_CANTIDAD_INVENTARIO }).refine((v) => v !== 0, { error: 'La cantidad no puede ser 0' }),
    motivo: motivoObligatorio,
})

export const registrarMovimientoManual = async (datos, sesion) => {
    exigirPermiso(sesion, 'inventario:ajustar')
    const { insumoId, tipo, cantidad: valor, motivo } = validar(movimientoManualSchema, datos)
    if (tipo !== 'ajuste' && valor < 0) throw new AppError(400, 'VALIDATION_ERROR', 'Indica la cantidad perdida como un número positivo.')
    const cantidadFinal = tipo === 'ajuste' ? valor : -valor
    if (!mongoose.isValidObjectId(insumoId)) throw new AppError(404, 'INSUMO_NO_ENCONTRADO', 'El insumo no existe.')

    let cambios = []
    const resultado = await conTransaccion(async (session) => {
        cambios = []
        const insumo = await Insumo.findById(insumoId).select('nombre activo').session(session).lean()
        if (!insumo) throw new AppError(404, 'INSUMO_NO_ENCONTRADO', 'El insumo no existe.')
        const [mov] = await aplicarMovimientos([{ insumo: insumo._id, cantidad: cantidadFinal, tipo }], {
            motivo, sesion, session, referencia: { tipo: 'manual', id: new mongoose.Types.ObjectId() },
        })
        await registrarEvento({
            entidad: 'insumo', entidadId: insumo._id, tipo: 'inventario_ajustado', usuario: sesion.id, actor: actorDe(sesion),
            motivo, datos: { nombre: insumo.nombre, tipo, cantidad: mov.cantidad, existencia: mov.existenciaDespues }, session,
        })
        cambios = await revisarDisponibilidad([String(insumo._id)], sesion, session)
        return { insumo: String(insumo._id), tipo, cantidad: mov.cantidad, existencia: mov.existenciaDespues, cambiosDisponibilidad: cambios.length }
    })
    avisarCambiosDisponibilidad(cambios)
    return resultado
}
