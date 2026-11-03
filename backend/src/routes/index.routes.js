import { Router } from 'express'
import authRoutes from './auth.routes.js'
import usuarioRoutes from './usuario.routes.js'
import reservaRoutes from './reserva.routes.js'
import customerRoutes from './customer.routes.js'
import comentarioRoutes from './comentario.routes.js'
import categoriaRoutes from './categorias.routes.js'
import metodoPagoRoutes from './metodoPago.routes.js'
import estadoRoutes from './estado.routes.js'
import rolRoutes from './rol.routes.js'
import productoRoutes from './producto.routes.js'
import pedidoRoutes from './pedido.routes.js'

const router = Router()

router.use('/auth', authRoutes)
router.use('/usuarios', usuarioRoutes)
router.use('/reservas', reservaRoutes)
router.use('/customer', customerRoutes)
router.use('/comentarios', comentarioRoutes)
router.use('/reviews', comentarioRoutes)

// Dashboard de administración
router.use('/categorias', categoriaRoutes)
router.use('/metodos-pago', metodoPagoRoutes)
router.use('/estados', estadoRoutes)
router.use('/roles', rolRoutes)
router.use('/productos', productoRoutes)
router.use('/pedidos', pedidoRoutes)

export default router