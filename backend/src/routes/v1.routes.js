import { Router } from 'express'
import { listarCatalogo } from '../controllers/producto.controller.js'
import clienteRoutes from './v1/cliente.routes.js'
import staffRoutes from './v1/staff.routes.js'
import adminRoutes from './v1/admin.routes.js'
import comentariosRoutes from './v1/comentarios.routes.js'
import authRoutes from './auth.routes.js'

// API versionada (0.8): /auth, /catalogo y /comentarios (públicas), /cliente (la sesión sobre
// sus datos), /staff (operación, por permiso) y /admin (configuración, por permiso).
// Las rutas sin versión (/api/...) quedan como alias deprecados.
const router = Router()

// Catálogo público: categorías y productos disponibles, precio entero en COP, imagen como URL
router.get('/catalogo', listarCatalogo)

router.use('/auth', authRoutes)
router.use('/comentarios', comentariosRoutes)
router.use('/cliente', clienteRoutes)
router.use('/staff', staffRoutes)
router.use('/admin', adminRoutes)

export default router
