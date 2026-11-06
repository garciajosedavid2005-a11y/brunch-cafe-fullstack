import { z } from 'zod'

// En Zod 4 el mensaje personalizado va en "error" ("required_error" ya no existe).
// Esta función distingue entre "falta el campo" y "el campo tiene un tipo incorrecto".
// Con { femenino: true } concuerda el género: "La contraseña es requerida".
export const requerido = (campo, { femenino = false } = {}) => ({
    error: (iss) => (iss.input === undefined
        ? `${campo} es ${femenino ? 'requerida' : 'requerido'}`
        : `${campo} no es ${femenino ? 'válida' : 'válido'}`),
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

// Teléfono: 7–30 caracteres de dígitos, espacios, +, ( ) o -, con al menos 7 dígitos
export const FORMATO_TELEFONO = /^[\d+\s()-]{7,30}$/
export const MENSAJE_TELEFONO = 'Ingresa un teléfono válido (7 a 30 dígitos).'
export const esTelefono = (valor) => FORMATO_TELEFONO.test(valor) && (valor.match(/\d/g) || []).length >= 7

/** Teléfono obligatorio (pedidos a domicilio y reservas). */
export const telefono = () => z.string(requerido('El teléfono'))
    .trim()
    .min(1, { error: 'El teléfono es requerido' })
    .refine(esTelefono, { error: MENSAJE_TELEFONO })

export const booleano = (campo) => z.boolean(requerido(campo))

export const colorHex = (campo) =>
    z.string(requerido(campo)).regex(/^#[0-9a-fA-F]{6}$/, {
        error: `${campo} debe ser un color hexadecimal (ej. #b78103)`,
    })