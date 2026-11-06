import { Router } from 'express'
import { listarPedidos, verPedido, cambiarEstadoPedido, cancelarPedido } from '../controllers/pedido.controller.js'
import { validateToken } from '../middlewares/validateToken.js'
import { requirePermission } from '../middlewares/requirePermission.js'
import { validateSchema } from '../modulos/compartido/validator.middleware.js'
import { cambiarEstadoPedidoSchema, cancelacionStaffSchema } from '../schema/pedido.schema.js'

const router = Router()

router.use(validateToken)
router.get('/', requirePermission('pedido:ver'), listarPedidos)
router.get('/:id', requirePermission('pedido:ver'), verPedido)
// Basta con uno de los dos permisos para entrar; cada transición exige el suyo
// (avanzar → pedido:cambiar_estado, cancelar → pedido:cancelar). Ver src/modulos/compartido/estados.js
router.patch(
    '/:id/estado',
    requirePermission('pedido:cambiar_estado', 'pedido:cancelar'),
    validateSchema(cambiarEstadoPedidoSchema),
    cambiarEstadoPedido
)

// Cancelación explícita (0.13): pedido:cancelar + motivo obligatorio
router.patch('/:id/cancelar', requirePermission('pedido:cancelar'), validateSchema(cancelacionStaffSchema), cancelarPedido)

export default router