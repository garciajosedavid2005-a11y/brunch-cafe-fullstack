import { Router } from 'express'
import {
    crearReserva,
    misReservas,
    cancelarReserva,
    listarReservas,
    cambiarEstadoReserva
} from '../controllers/reserva.controller.js'
import { validateToken } from '../middlewares/validateToken.js'
import { requirePermission } from '../middlewares/requirePermission.js'
import { validateSchema } from '../middlewares/validator.middleware.js'
import { crearReservaSchema } from '../schema/reserva.schema.js'
import { cambioEstadoSchema } from '../schema/cambioEstado.schema.js'

const router = Router()

// Rutas del cliente necesita estar logueado
router.post('/', validateToken, validateSchema(crearReservaSchema), crearReserva)
router.get('/mias', validateToken, misReservas)
router.patch('/:id/cancelar', validateToken, cancelarReserva)

// Rutas de staff (por permiso)
router.get('/', validateToken, requirePermission('reserva:ver'), listarReservas)
router.patch('/:id/estado', validateToken, requirePermission('reserva:cambiar_estado'), validateSchema(cambioEstadoSchema), cambiarEstadoReserva)

export default router