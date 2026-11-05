import { Router } from 'express'
import { listarPedidos, cambiarEstadoPedido } from '../controllers/pedido.controller.js'
import { validateToken } from '../middlewares/validateToken.js'
import { requirePermission } from '../middlewares/requirePermission.js'
import { validateSchema } from '../middlewares/validator.middleware.js'
import { cambiarEstadoPedidoSchema } from '../schema/pedido.schema.js'

const router = Router()

router.use(validateToken)
router.get('/', requirePermission('pedido:ver'), listarPedidos)
// Basta con uno de los dos permisos para entrar; cada transición exige el suyo
// (avanzar → pedido:cambiar_estado, cancelar → pedido:cancelar). Ver src/libs/estados.js
router.patch(
    '/:id/estado',
    requirePermission('pedido:cambiar_estado', 'pedido:cancelar'),
    validateSchema(cambiarEstadoPedidoSchema),
    cambiarEstadoPedido
)

export default router