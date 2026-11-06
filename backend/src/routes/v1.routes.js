import { Router } from 'express'
import { listarCatalogo } from '../modulos/catalogo/producto.controller.js'
import clienteRoutes from './v1/cliente.routes.js'
import staffRoutes from './v1/staff.routes.js'
import adminRoutes from './v1/admin.routes.js'
import comentariosRoutes from '../modulos/catalogo/comentario.v1.routes.js'
import authRoutes from '../modulos/identidad/auth.routes.js'
import { verHorarios } from '../modulos/configuracion/horarios.controller.js'

// API versionada (0.8): /auth, /catalogo y /comentarios (públicas), /cliente (la sesión sobre
// sus datos), /staff (operación, por permiso) y /admin (configuración, por permiso).
// Las rutas sin versión (/api/...) se retiraron en 0.12 (salvo las imágenes del menú).
const router = Router()

// Catálogo público: categorías y productos disponibles, precio entero en COP, imagen como URL
router.get('/catalogo', listarCatalogo)
// Horarios de domicilio y reservas (públicos: los formularios solo ofrecen horas válidas)
router.get('/horarios', verHorarios)

router.use('/auth', authRoutes)
router.use('/comentarios', comentariosRoutes)
router.use('/cliente', clienteRoutes)
router.use('/staff', staffRoutes)
router.use('/admin', adminRoutes)

export default router
