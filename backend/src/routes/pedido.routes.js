import { Router } from 'express'
import { listarPedidos, cambiarEstadoPedido } from '../controllers/pedido.controller.js'
import { validateToken } from '../middlewares/validateToken.js'
import { authorizeRole } from '../middlewares/authorizeRole.js'
import { validateSchema } from '../middlewares/validator.middleware.js'
import { cambiarEstadoPedidoSchema } from '../schema/pedido.schema.js'

const router = Router()

router.use(validateToken, authorizeRole('admin'))
router.get('/', listarPedidos)
router.patch('/:id/estado', validateSchema(cambiarEstadoPedidoSchema), cambiarEstadoPedido)

export default router