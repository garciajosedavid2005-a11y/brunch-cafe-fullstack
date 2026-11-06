import { z } from 'zod'
import { texto, textoOpcional } from '../modulos/compartido/comunes.schema.js'

export const crearCategoriaSchema = z.object({
    nombre: texto('El nombre', 2, 50),
    descripcion: textoOpcional('La descripción', 200),
})

// Al editar, todos los campos son opcionales
export const actualizarCategoriaSchema = crearCategoriaSchema.partial()