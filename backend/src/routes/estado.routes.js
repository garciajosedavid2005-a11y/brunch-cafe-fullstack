import { Router } from 'express'
import {
    listarEstados,
    crearEstado,
    actualizarEstado,
    eliminarEstado
} from '../controllers/estado.controller.js'
import { validateToken } from '../middlewares/validateToken.js'
import { requirePermission } from '../middlewares/requirePermission.js'
import { validateSchema } from '../middlewares/validator.middleware.js'
import { crearEstadoSchema, actualizarEstadoSchema } from '../schema/estado.schema.js'

const router = Router()

router.use(validateToken)

// Listar estados lo necesita cualquier staff que vea pedidos o reservas
router.get('/', requirePermission('estado:editar', 'pedido:ver', 'reserva:ver'), listarEstados)
router.post('/', requirePermission('estado:editar'), validateSchema(crearEstadoSchema), crearEstado)
router.put('/:id', requirePermission('estado:editar'), validateSchema(actualizarEstadoSchema), actualizarEstado)
router.delete('/:id', requirePermission('estado:editar'), eliminarEstado)

export default router