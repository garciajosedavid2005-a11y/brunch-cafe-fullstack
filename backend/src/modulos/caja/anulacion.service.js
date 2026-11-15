import mongoose from 'mongoose'
import { z } from 'zod'
import Comprobante from './comprobante.model.js'
import NotaCredito, { codigoNota } from './notaCredito.model.js'
import TurnoCaja from './turno.model.js'
import Contador from '../compartido/contador.model.js'
import Usuario from '../identidad/usuario.model.js'
import { AppError } from '../compartido/errors.js'
import { conTransaccion } from '../compartido/transacciones.js'
import { registrarEvento } from '../compartido/estados.service.js'
import { tienePermiso } from '../identidad/permisos.js'
import { nombreCorto, CAMPOS_NOMBRE } from '../compartido/nombres.js'

// Fase 3b.3 · Anular un comprobante (PLAN_FASE_3B, F3b-5): solo con factura:anular (hoy, el admin por «*»),
// con motivo. Emite la nota crédito NC-000001 (consecutivo sin huecos, dentro de la transacción) que devuelve
// el total por los mismos métodos. El comprobante no cambia y la cuenta tampoco se reabre.
const CONTADOR = 'notaCredito'

export const anularSchema = z.strictObject({
    motivo: z.string({ error: 'Escribe el motivo de la anulación' }).trim()
        .min(5, { error: 'El motivo debe tener al menos 5 caracteres' }).max(300, { error: 'El motivo admite hasta 300 caracteres' }),
}, { error: 'Solo se acepta el motivo' })

export const formatoNota = (n) => ({
    id: String(n._id), codigo: n.codigo, comprobante: n.comprobanteCodigo, motivo: n.motivo, autor: n.autor?.nombre || '',
    emitidaEn: n.emitidaEn, total: n.total, pagos: n.pagos.map(({ metodo, monto }) => ({ metodo, monto })),
})

const asegurarContador = async () => {
    try {
        await Contador.updateOne({ _id: CONTADOR }, { $setOnInsert: { seq: 0 } }, { upsert: true })
    } catch (error) {
        if (error?.code !== 11000) throw error
    }
}

const yaAnulado = () => new AppError(409, 'COMPROBANTE_ANULADO', 'Este comprobante ya está anulado.')

/** POST /staff/caja/comprobantes/:id/anular { motivo } → 201 { nota } */
export const anularComprobante = async (id, datos, sesion) => {
    if (!tienePermiso(sesion?.permisos || [], 'factura:anular')) {
        throw new AppError(403, 'FORBIDDEN', 'No tienes permiso para realizar esta acción.', { requiere: ['factura:anular'] })
    }
    const r = anularSchema.safeParse(datos ?? {})
    if (!r.success) {
        throw new AppError(400, 'VALIDATION_ERROR', r.error.issues[0]?.message || 'Datos no válidos',
            r.error.issues.map((i) => ({ campo: i.path.join('.'), mensaje: i.message })))
    }
    const { motivo } = r.data
    const noExiste = () => new AppError(404, 'COMPROBANTE_NO_ENCONTRADO', 'El comprobante no existe.')
    if (!mongoose.isValidObjectId(id)) throw noExiste()
    await asegurarContador()

    try {
        return await conTransaccion(async (session) => {
            const comprobante = await Comprobante.findById(id).session(session).lean()
            if (!comprobante) throw noExiste()
            if (await NotaCredito.exists({ comprobante: comprobante._id }).session(session)) throw yaAnulado()
            // Entra en el turno abierto (lo «toca» para chocar con un cierre simultáneo); sin turno, queda sin él
            const turno = await TurnoCaja.findOneAndUpdate({ estado: 'abierto' }, { $inc: { version: 1 } }, { returnDocument: 'after', session }).lean()
            const { seq: numero } = await Contador.findOneAndUpdate({ _id: CONTADOR }, { $inc: { seq: 1 } }, { returnDocument: 'after', upsert: true, session })
            const autor = await Usuario.findById(sesion.id).select(CAMPOS_NOMBRE).session(session).lean()
            const [nota] = await NotaCredito.create([{
                numero, codigo: codigoNota(numero), comprobante: comprobante._id, comprobanteCodigo: comprobante.codigo,
                turno: turno?._id ?? null, motivo, autor: { id: sesion.id, nombre: nombreCorto(autor) }, emitidaEn: new Date(),
                total: comprobante.total, pagos: comprobante.pagos.map((p) => ({ metodo: p.metodo, monto: p.monto })),
            }], { session }).catch((error) => {
                // Los datos los calcula el servidor: un invariante roto es un fallo nuestro (500, al log), no un 400
                if (error?.name !== 'ValidationError') throw error
                throw new AppError(500, 'NOTA_INCONSISTENTE', 'No se pudo emitir la nota crédito. Avisa al administrador.', undefined, { cause: error })
            })
            await registrarEvento({
                entidad: 'cuenta', entidadId: comprobante.cuenta, tipo: 'comprobante_anulado', motivo,
                usuario: sesion.id, actor: sesion.rol || 'staff',
                datos: { comprobante: comprobante.codigo, nota: nota.codigo, total: nota.total, turno: turno?.codigo ?? null }, session,
            })
            return { nota: formatoNota(nota.toObject()) }
        })
    } catch (error) {
        if (error?.code === 11000 && error?.keyPattern?.comprobante) throw yaAnulado() // dos anulaciones a la vez
        throw error
    }
}

/** Notas de esos comprobantes: Map(id del comprobante → nota resumida). */
export const notasDe = async (comprobanteIds) => {
    const notas = await NotaCredito.find({ comprobante: { $in: comprobanteIds } }).lean()
    return new Map(notas.map((n) => [String(n.comprobante), { codigo: n.codigo, motivo: n.motivo, emitidaEn: n.emitidaEn, autor: n.autor?.nombre || '' }]))
}
