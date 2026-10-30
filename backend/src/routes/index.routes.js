import { Router } from 'express'
import authRoutes from './auth.routes.js'
import usuarioRoutes from './usuario.routes.js'
import categoriaRoutes from './categorias.routes.js'
import productoRoutes from './producto.routes.js'
import pedidoRoutes from './pedido.routes.js'
import reservaRoutes from './reserva.routes.js'
import comentarioRoutes from './comentario.routes.js'
import estadoRoutes from './estado.routes.js'
import metodoPagoRoutes from './metodoPago.routes.js'

const router = Router()

router.use('/auth', authRoutes)
router.use('/usuarios', usuarioRoutes)
router.use('/categorias', categoriaRoutes)
router.use('/productos', productoRoutes)
router.use('/pedidos', pedidoRoutes)
router.use('/reservas', reservaRoutes)
router.use('/comentarios', comentarioRoutes)
router.use('/estados', estadoRoutes)
router.use('/metodos-pago', metodoPagoRoutes)

export default router