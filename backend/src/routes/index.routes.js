import { Router } from 'express'
import { deprecadoBajo } from '../modulos/compartido/deprecado.js'
import authRoutes from '../modulos/identidad/auth.routes.js'
import usuarioRoutes from '../modulos/identidad/perfil.routes.js'
import reservaRoutes from '../modulos/salon/reserva.routes.js'
import customerRoutes from './customer.routes.js'
import comentarioRoutes from '../modulos/catalogo/comentario.routes.js'
import categoriaRoutes from '../modulos/catalogo/categoria.routes.js'
import metodoPagoRoutes from '../modulos/pedidos/metodoPago.routes.js'
import estadoRoutes from './estado.routes.js'
import rolRoutes from '../modulos/identidad/rol.routes.js'
import productoRoutes from '../modulos/catalogo/producto.routes.js'
import pedidoRoutes from '../modulos/pedidos/pedidosStaff.routes.js'
import permisoRoutes from '../modulos/identidad/permiso.routes.js'
import adminUsuarioRoutes from '../modulos/identidad/adminUsuario.routes.js'

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
