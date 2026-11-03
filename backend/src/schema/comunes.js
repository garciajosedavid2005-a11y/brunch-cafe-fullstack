import { z } from 'zod'

// En Zod 4 el mensaje personalizado va en "error" ("required_error" ya no existe).
// Esta función distingue entre "falta el campo" y "el campo tiene un tipo incorrecto".
export const requerido = (campo) => ({
    error: (iss) => (iss.input === undefined ? `${campo} es requerido` : `${campo} no es válido`),
})

export const texto = (campo, min, max) =>
    z.string(requerido(campo))
        .trim()
        .min(min, { error: `${campo} debe tener al menos ${min} caracteres` })
        .max(max, { error: `${campo} no puede superar ${max} caracteres` })

export const textoOpcional = (campo, max) =>
    z.string(requerido(campo))
        .trim()
        .max(max, { error: `${campo} no puede superar ${max} caracteres` })
        .optional()

export const booleano = (campo) => z.boolean(requerido(campo))

export const colorHex = (campo) =>
    z.string(requerido(campo)).regex(/^#[0-9a-fA-F]{6}$/, {
        error: `${campo} debe ser un color hexadecimal (ej. #b78103)`,
    })