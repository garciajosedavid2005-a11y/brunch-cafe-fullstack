import { Router } from 'express'
import {
    listarCategorias,
    obtenerCategoria,
    crearCategoria,
    actualizarCategoria,
    eliminarCategoria
} from '../controllers/categoria.controller.js'
import { validateToken } from '../middlewares/validateToken.js'
import { authorizeRole } from '../middlewares/authorizeRole.js'

const router = Router()

// ---------- Públicas ----------
router.get('/', listarCategorias)
router.get('/:id', obtenerCategoria)

// ---------- Admin ----------
router.post('/', validateToken, authorizeRole('admin'), crearCategoria)
router.put('/:id', validateToken, authorizeRole('admin'), actualizarCategoria)
router.delete('/:id', validateToken, authorizeRole('admin'), eliminarCategoria)

export default router