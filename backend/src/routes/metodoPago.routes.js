import { Router } from 'express'
import {
    listarMetodosPago,
    crearMetodoPago,
    actualizarMetodoPago,
    eliminarMetodoPago
} from '../controllers/metodoPago.controller.js'
import { validateToken } from '../middlewares/validateToken.js'
import { requirePermission } from '../middlewares/requirePermission.js'
import { validateSchema } from '../modulos/compartido/validator.middleware.js'
import { crearMetodoPagoSchema, actualizarMetodoPagoSchema } from '../schema/metodoPago.schema.js'

const router = Router()

// Todas las rutas de este archivo son solo para admin
router.use(validateToken, requirePermission('metodo_pago:gestionar'))

router.get('/', listarMetodosPago)
router.post('/', validateSchema(crearMetodoPagoSchema), crearMetodoPago)
router.put('/:id', validateSchema(actualizarMetodoPagoSchema), actualizarMetodoPago)
router.delete('/:id', eliminarMetodoPago)

export default router