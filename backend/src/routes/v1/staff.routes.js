import { Router } from 'express'
import { validateToken } from '../../middlewares/validateToken.js'
import { requirePermission } from '../../middlewares/requirePermission.js'
import { validateSchema } from '../../modulos/compartido/validator.middleware.js'
import { cambioEstadoSchema } from '../../modulos/compartido/cambioEstado.schema.js'
import { listarReservas, cambiarEstadoReserva } from '../../controllers/reserva.controller.js'
import pedidoRoutes from '../../modulos/pedidos/pedidosStaff.routes.js'

// /api/v1/staff: operación del salón y la cocina, por permiso (no por rol)
const router = Router()
router.use(validateToken)

router.get('/reservas', requirePermission('reserva:ver'), listarReservas)
router.patch('/reservas/:id/estado', requirePermission('reserva:cambiar_estado'), validateSchema(cambioEstadoSchema), cambiarEstadoReserva)

// Pedidos (0.13): listar con filtros y ver con historial (pedido:ver), cambiar estado
// (permiso de cada transición) y cancelar con motivo (pedido:cancelar)
router.use('/pedidos', pedidoRoutes)

export default router
