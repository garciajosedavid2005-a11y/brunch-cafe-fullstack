import { Router } from 'express'
import {
    listarProductos,
    obtenerProducto,
    crearProducto,
    actualizarProducto,
    eliminarProducto
} from '../controllers/producto.controller.js'
import { validateToken } from '../middlewares/validateToken.js'
import { authorizeRole } from '../middlewares/authorizeRole.js'

const router = Router()

// ---------- Públicas ----------
router.get('/', listarProductos)
router.get('/:id', obtenerProducto)

// ---------- Admin ----------
router.post('/', validateToken, authorizeRole('admin'), crearProducto)
router.put('/:id', validateToken, authorizeRole('admin'), actualizarProducto)
router.delete('/:id', validateToken, authorizeRole('admin'), eliminarProducto)

export default router