import { Router } from 'express'
import { listarPedidos, verPedido, cambiarEstadoPedido, cancelarPedido, asignarRepartidor, listarRepartidores } from './pedidosStaff.controller.js'
import { validateToken } from '../identidad/validateToken.js'
import { requirePermission } from '../identidad/requirePermission.js'
import { validateSchema } from '../compartido/validator.middleware.js'
import { cambiarEstadoPedidoSchema, cancelacionStaffSchema, asignarRepartidorSchema } from './pedido.schema.js'
import { publicar, CANAL_TODAS_LAS_ESTACIONES } from '../tiempoReal/bus.js'

// 2.4 · Si el cambio salió bien, las estaciones releen su cola (el domicilio entra al confirmarse y
// sale al cancelarse). Después de responder: el controlador ya confirmó la transacción.
const avisarCocina = (req, res, next) => {
    res.on('finish', () => {
        if (res.statusCode < 300) publicar([CANAL_TODAS_LAS_ESTACIONES], { tipo: 'pedido_estado', ids: { pedidoId: req.params.id } })
    })
    next()
}

const router = Router()

router.use(validateToken)
router.get('/', requirePermission('pedido:ver'), listarPedidos)
// 6.2 · Antes de /:id (si no, «repartidores» se leería como un id)
router.get('/repartidores', requirePermission('pedido:asignar_repartidor'), listarRepartidores)
router.get('/:id', requirePermission('pedido:ver'), verPedido)
// Basta con uno de los dos permisos para entrar; cada transición exige el suyo
// (avanzar → pedido:cambiar_estado, cancelar → pedido:cancelar). Ver src/modulos/compartido/estados.js
router.patch(
    '/:id/estado',
    requirePermission('pedido:cambiar_estado', 'pedido:cancelar', 'pedido:entregar'),
    validateSchema(cambiarEstadoPedidoSchema),
    avisarCocina,
    cambiarEstadoPedido
)

// Cancelación explícita (0.13): pedido:cancelar + motivo obligatorio
router.patch('/:id/cancelar', requirePermission('pedido:cancelar'), validateSchema(cancelacionStaffSchema), avisarCocina, cancelarPedido)

// 6.2 · Asignar o quitar el repartidor de un domicilio
router.patch('/:id/repartidor', requirePermission('pedido:asignar_repartidor'), validateSchema(asignarRepartidorSchema), asignarRepartidor)

export default router