import { z } from 'zod'
import { textoOpcional } from './comunes.js'

// Cambio de estado por staff: el destino llega como `codigo` (preferido) o como
// `estado` (_id del Estado, lo que envía el dashboard actual).
export const cambioEstadoSchema = z.object({
    codigo: textoOpcional('El código del estado', 40),
    estado: textoOpcional('El estado', 40),
    motivo: textoOpcional('El motivo', 300),
}).refine((datos) => datos.codigo || datos.estado, {
    error: 'Indica el estado de destino',
    path: ['estado'],
})

// Cancelación por el cliente: el motivo es opcional
export const cancelacionClienteSchema = z.object({
    motivo: textoOpcional('El motivo', 300),
}).default({})
