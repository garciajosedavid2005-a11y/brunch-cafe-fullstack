import { z } from 'zod'
import { texto, textoOpcional } from '../compartido/comunes.schema.js'
import { estacionDeCategoria } from './catalogoConfig.schema.js'

export const crearCategoriaSchema = z.object({
    nombre: texto('El nombre', 2, 50),
    descripcion: textoOpcional('La descripción', 200),
    // 1.3 · Estación por defecto de sus productos; sin ella, Cocina (F1-3). No admite null.
    estacionId: estacionDeCategoria,
})

// Al editar, todos los campos son opcionales
export const actualizarCategoriaSchema = crearCategoriaSchema.partial()
