import { z } from 'zod'
import { booleano } from '../compartido/comunes.schema.js'

// 2.7 · Agotar (false) o reactivar (true) un producto o una opción desde la operación. Estricto: el resto
// del producto (precio, nombre…) solo lo cambia el admin desde el catálogo.
export const disponibilidadSchema = z.strictObject({
    disponible: booleano('Indica si está disponible (true) o agotado (false)'),
})
