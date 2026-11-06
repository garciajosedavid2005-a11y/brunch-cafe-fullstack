import { z } from 'zod'
import { booleano } from '../modulos/compartido/comunes.schema.js'

export const visibilidadComentarioSchema = z.object({
    visible: booleano('El campo visible'),
})