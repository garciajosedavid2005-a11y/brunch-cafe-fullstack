import { Router } from 'express'
import { listarPedidos, cambiarEstadoPedido } from '../controllers/pedido.controller.js'
import { validateToken } from '../middlewares/validateToken.js'
import { requirePermission } from '../middlewares/requirePermission.js'
import { validateSchema } from '../middlewares/validator.middleware.js'
import { cambiarEstadoPedidoSchema } from '../schema/pedido.schema.js'

const router = Router()

router.use(validateToken)
router.get('/', requirePermission('pedido:ver'), listarPedidos)
// 0.7: cada transición declarará su propio permiso; por ahora basta pedido:cambiar_estado
router.patch('/:id/estado', requirePermission('pedido:cambiar_estado'), validateSchema(cambiarEstadoPedidoSchema), cambiarEstadoPedido)

export default router