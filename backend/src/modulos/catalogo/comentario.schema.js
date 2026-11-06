import { z } from 'zod'
import { booleano } from '../compartido/comunes.schema.js'

export const visibilidadComentarioSchema = z.object({
    visible: booleano('El campo visible'),
})