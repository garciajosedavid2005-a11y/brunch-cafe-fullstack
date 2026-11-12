import { z } from 'zod'
import mongoose from 'mongoose'
import { requerido, textoOpcional } from '../compartido/comunes.schema.js'
import { AppError, detallesZod } from '../compartido/errors.js'
import { MOTIVOS_ANULACION } from '../compartido/estadosSalon.js'
import { MAX_COMENSALES, MAX_MESAS_POR_CUENTA } from './cuenta.model.js'
import { MAX_CANTIDAD } from './comanda.model.js'
import { modificadoresEntradaSchema, MAX_NOTA_ITEM } from '../catalogo/modificadores.validacion.js'

// 1.4 · Entradas del servicio de cuentas (los endpoints de 1.5 las reutilizan). Solo se aceptan los
// campos declarados (strict): precios, estados o el mesero nunca llegan del cliente.
// En minúsculas: '65AB…' y '65ab…' son el mismo ObjectId (las comparaciones de texto no se equivocan)
const id = (campo) => z.string(requerido(campo))
    .refine(mongoose.isValidObjectId, { error: `${campo} no es válido` })
    .transform((valor) => valor.toLowerCase())
const enteroEntre = (campo, min, max) => z.number(requerido(campo))
    .int({ error: `${campo} debe ser un número entero` })
    .min(min, { error: `${campo} debe ser al menos ${min}` })
    .max(max, { error: `${campo} no puede superar ${max}` })
const version = (requerida) => {
    const esquema = z.number(requerido('La versión de la cuenta', { femenino: true })).int().min(0)
    return requerida ? esquema : esquema.optional()
}
const motivo = textoOpcional('El motivo', 300)

export const abrirCuentaSchema = z.strictObject({
    mesaId: id('La mesa'),
    comensales: enteroEntre('Los comensales', 1, MAX_COMENSALES),
    notas: textoOpcional('Las notas', 300),
    // 1.5 · Otro responsable distinto de quien abre exige cuenta:transferir (F1-8)
    meseroId: id('El mesero').optional(),
})

// 1.5 · Transferir, mover, unir y separar (F1-8, F1-9). La versión es opcional (como al agregar).
export const transferirSchema = z.strictObject({ meseroId: id('El mesero'), motivo, versionEsperada: version(false) })
export const moverSchema = z.strictObject({ mesaDestinoId: id('La mesa de destino'), versionEsperada: version(false) })
export const unirSchema = z.strictObject({
    principalId: id('La mesa principal'),
    mesaIds: z.array(id('La mesa'), { error: 'Indica las mesas que quieres unir' })
        .min(1, { error: 'Elige al menos una mesa para unir' })
        .max(MAX_MESAS_POR_CUENTA - 1, { error: `Una cuenta tiene como máximo ${MAX_MESAS_POR_CUENTA} mesas` }),
    versionEsperada: version(false),
})

export const agregarItemSchema = z.strictObject({
    productoId: id('El producto'),
    cantidad: enteroEntre('La cantidad', 1, MAX_CANTIDAD),
    nota: textoOpcional('La nota', MAX_NOTA_ITEM),
    modificadores: modificadoresEntradaSchema, // 1.12: el mismo que el pedido a domicilio
    versionEsperada: version(false),
})

export const modificarItemSchema = z.strictObject({
    cantidad: enteroEntre('La cantidad', 1, MAX_CANTIDAD).optional(),
    nota: textoOpcional('La nota', MAX_NOTA_ITEM),
    versionEsperada: version(false),
}).refine((d) => d.cantidad !== undefined || d.nota !== undefined, { error: 'Indica la cantidad o la nota' })

export const versionOpcionalSchema = z.strictObject({ versionEsperada: version(false) })

export const enviarRondaSchema = z.strictObject({
    numeroRonda: enteroEntre('El número de ronda', 1, 10_000),
    versionEsperada: version(true),
})

export const cambioCuentaSchema = z.strictObject({ motivo, versionEsperada: version(true) })

export const anularItemSchema = z.strictObject({
    motivo: z.enum(Object.keys(MOTIVOS_ANULACION), { error: 'Elige un motivo de anulación de la lista' }),
    detalle: textoOpcional('El detalle', 300),
    versionEsperada: version(false),
})

export const cambioMesaSchema = z.strictObject({
    a: z.string(requerido('El estado')),
    motivo,
})

/** Valida `datos` con `esquema` o lanza 400 VALIDATION_ERROR con los detalles. */
export const validar = (esquema, datos) => {
    const resultado = esquema.safeParse(datos ?? {})
    if (!resultado.success) {
        const details = detallesZod(resultado.error)
        throw new AppError(400, 'VALIDATION_ERROR', details[0]?.mensaje || 'Datos inválidos.', details)
    }
    return resultado.data
}
