import { Router } from 'express'
import { listarReservas, cambiarEstadoReserva } from './reservasStaff.controller.js'
import { legadoCrear, legadoMias, legadoCancelar } from './reservas.controller.js'
import { validateToken } from '../../middlewares/validateToken.js'
import { requirePermission } from '../../middlewares/requirePermission.js'
import { validateSchema } from '../compartido/validator.middleware.js'
import { deprecado } from '../compartido/deprecado.js'
import { cambioEstadoSchema } from '../compartido/cambioEstado.schema.js'

// /api/reservas: alias deprecados (se retiran en 0.12). Usan el mismo servicio que
// /api/v1/cliente/reservas, así que ahora validan fecha futura, horario y datos de contacto.
const router = Router()
const aliasCliente = deprecado('/api/v1/cliente/reservas')
const aliasStaff = deprecado('/api/v1/staff/reservas')

router.post('/', validateToken, aliasCliente, legadoCrear)
router.get('/mias', validateToken, aliasCliente, legadoMias)
router.patch('/:id/cancelar', validateToken, aliasCliente, legadoCancelar)

// Staff (por permiso)
router.get('/', validateToken, aliasStaff, requirePermission('reserva:ver'), listarReservas)
router.patch('/:id/estado', validateToken, aliasStaff, requirePermission('reserva:cambiar_estado'), validateSchema(cambioEstadoSchema), cambiarEstadoReserva)

export default router
