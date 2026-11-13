import { Router } from 'express'
import { validateToken } from '../../modulos/identidad/validateToken.js'
import { requirePermission } from '../../modulos/identidad/requirePermission.js'
import { validateSchema } from '../../modulos/compartido/validator.middleware.js'
import { cambioEstadoSchema } from '../../modulos/compartido/cambioEstado.schema.js'
import { listarReservas, cambiarEstadoReserva, crearReserva } from '../../modulos/salon/reservasStaff.controller.js'
import { reservaStaffSchema } from '../../modulos/salon/reservas.schema.js'
import pedidoRoutes from '../../modulos/pedidos/pedidosStaff.routes.js'
import salonRoutes from '../../modulos/salon/salonStaff.routes.js'
import cuentasAbiertasRoutes from '../../modulos/salon/cuentasAbiertas.routes.js'
import cocinaRoutes from '../../modulos/cocina/cocina.routes.js'
import eventosRoutes from '../../modulos/tiempoReal/eventos.routes.js'

// /api/v1/staff: operación del salón y la cocina, por permiso (no por rol)
const router = Router()
router.use(validateToken)

router.get('/reservas', requirePermission('reserva:ver'), listarReservas)
router.post('/reservas', requirePermission('reserva:crear'), validateSchema(reservaStaffSchema), crearReserva)
router.patch('/reservas/:id/estado', requirePermission('reserva:cambiar_estado'), validateSchema(cambioEstadoSchema), cambiarEstadoReserva)

// Pedidos (0.13): listar con filtros y ver con historial (pedido:ver), cambiar estado
// (permiso de cada transición) y cancelar con motivo (pedido:cancelar)
router.use('/pedidos', pedidoRoutes)

// Salón (1.5): plano de mesas, cuentas y comandas, por permiso
router.use('/salon', salonRoutes)

// 1.9 · «Cuentas abiertas» (F1-11): salón (cuenta:ver) y domicilio (pedido:ver), solo lectura
router.use('/cuentas-abiertas', cuentasAbiertasRoutes)

// 2.2 · Cocina y barra: estado de un ítem (/items/:id/estado) y «Todo listo» (/cocina/rondas/:id/todo-listo)
router.use(cocinaRoutes)

// 2.4 · Tiempo real (SSE): /eventos?canales=… con permiso por canal
router.use(eventosRoutes)

export default router
