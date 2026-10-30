import { Router } from 'express'
import {
    crearReserva,
    misReservas,
    cancelarReserva,
    listarReservas,
    cambiarEstadoReserva
} from '../controllers/reserva.controller.js'
import { validateToken } from '../middlewares/validateToken.js'
import { authorizeRole } from '../middlewares/authorizeRole.js'
import { validateSchema } from '../middlewares/validator.middleware.js'
import { crearReservaSchema } from '../schema/reserva.schema.js'

const router = Router()

// Rutas del cliente necesita estar logueado
router.post('/', validateToken, authorizeRole('cliente'), validateSchema(crearReservaSchema), crearReserva)
router.get('/mias', validateToken, misReservas)
router.patch('/:id/cancelar', validateToken, cancelarReserva)

// Rutas del admin logueado como admin
router.get('/', validateToken, authorizeRole('admin'), listarReservas)
router.patch('/:id/estado', validateToken, authorizeRole('admin'), cambiarEstadoReserva)

export default router