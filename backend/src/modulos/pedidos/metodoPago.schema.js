import { z } from 'zod'
import { texto, textoOpcional, booleano } from '../compartido/comunes.schema.js'

export const crearMetodoPagoSchema = z.object({
    nombre: texto('El nombre', 2, 100),
    descripcion: textoOpcional('La descripción', 300),
    codigo: textoOpcional('El código', 50),
    icono: textoOpcional('El ícono', 40),
    activo: booleano('El campo activo').optional(),
})

// Al editar, todos los campos son opcionales (el código no cambia después de creado)
export const actualizarMetodoPagoSchema = crearMetodoPagoSchema.omit({ codigo: true }).partial()