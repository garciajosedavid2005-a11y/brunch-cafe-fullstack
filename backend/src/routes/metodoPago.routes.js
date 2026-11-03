import { Router } from 'express'
import {
    listarMetodosPago,
    crearMetodoPago,
    actualizarMetodoPago,
    eliminarMetodoPago
} from '../controllers/metodoPago.controller.js'
import { validateToken } from '../middlewares/validateToken.js'
import { authorizeRole } from '../middlewares/authorizeRole.js'
import { validateSchema } from '../middlewares/validator.middleware.js'
import { crearMetodoPagoSchema, actualizarMetodoPagoSchema } from '../schema/metodoPago.schema.js'

const router = Router()

// Todas las rutas de este archivo son solo para admin
router.use(validateToken, authorizeRole('admin'))

router.get('/', listarMetodosPago)
router.post('/', validateSchema(crearMetodoPagoSchema), crearMetodoPago)
router.put('/:id', validateSchema(actualizarMetodoPagoSchema), actualizarMetodoPago)
router.delete('/:id', eliminarMetodoPago)

export default router