import { z } from 'zod'
import { booleano } from './comunes.js'

export const visibilidadComentarioSchema = z.object({
    visible: booleano('El campo visible'),
})