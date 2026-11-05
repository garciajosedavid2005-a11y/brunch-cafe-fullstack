import { Router } from 'express'
import { listarCatalogo } from '../controllers/producto.controller.js'
import clienteRoutes from './v1/cliente.routes.js'

// API versionada. Las rutas sin versión (/api/...) se irán migrando aquí (0.8).
const router = Router()

// Catálogo público: categorías y productos disponibles, precio entero en COP, imagen como URL
router.get('/catalogo', listarCatalogo)

router.use('/cliente', clienteRoutes)

export default router
