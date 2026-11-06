import { Router } from 'express'
import { listarEstados, actualizarEstado, estadosFijos } from './estado.controller.js'
import { validateToken } from '../identidad/validateToken.js'
import { requirePermission } from '../identidad/requirePermission.js'
import { validateSchema } from '../compartido/validator.middleware.js'
import { actualizarEstadoSchema } from './estado.schema.js'

const router = Router()

router.use(validateToken)

// Listar estados lo necesita cualquier staff que vea pedidos o reservas
router.get('/', requirePermission('estado:editar', 'pedido:ver', 'reserva:ver'), listarEstados)
router.put('/:id', requirePermission('estado:editar'), validateSchema(actualizarEstadoSchema), actualizarEstado)
// Crear y borrar ya no existen (405)
router.post('/', requirePermission('estado:editar'), estadosFijos)
router.delete('/:id', requirePermission('estado:editar'), estadosFijos)

export default router
