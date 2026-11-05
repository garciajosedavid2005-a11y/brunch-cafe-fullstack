import { Router } from 'express'
import { deprecadoBajo } from '../middlewares/deprecado.js'
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
import permisoRoutes from './permiso.routes.js'
import adminUsuarioRoutes from './adminUsuario.routes.js'

// Rutas anteriores a /api/v1: alias deprecados (cabeceras Deprecation y Link al
// sucesor). Reservas, perfil, cliente, comentarios y productos marcan cada ruta.
const router = Router()

router.use('/auth', deprecadoBajo('/api/v1/auth'), authRoutes)
router.use('/usuarios', usuarioRoutes)
router.use('/reservas', reservaRoutes)
router.use('/customer', customerRoutes)
router.use('/comentarios', comentarioRoutes)
router.use('/reviews', comentarioRoutes)

// Dashboard de administración
router.use('/categorias', deprecadoBajo('/api/v1/admin/categorias'), categoriaRoutes)
router.use('/metodos-pago', deprecadoBajo('/api/v1/admin/metodos-pago'), metodoPagoRoutes)
router.use('/estados', deprecadoBajo('/api/v1/admin/estados'), estadoRoutes)
router.use('/roles', deprecadoBajo('/api/v1/admin/roles'), rolRoutes)
router.use('/productos', productoRoutes)
router.use('/pedidos', deprecadoBajo('/api/v1/staff/pedidos'), pedidoRoutes)
router.use('/permisos', deprecadoBajo('/api/v1/admin/permisos'), permisoRoutes)
router.use('/admin/usuarios', deprecadoBajo('/api/v1/admin/usuarios'), adminUsuarioRoutes)

export default router
