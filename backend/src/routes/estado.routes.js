import { Router } from 'express'
import {
    listarEstados,
    obtenerEstado,
    crearEstado,
    actualizarEstado,
    eliminarEstado
} from '../controllers/estado.controller.js'
import { validateToken } from '../middlewares/validateToken.js'
import { authorizeRole } from '../middlewares/authorizeRole.js'

const router = Router()

// Todas las rutas de este archivo son solo para admin
router.use(validateToken, authorizeRole('admin'))

router.get('/', listarEstados)
router.get('/:id', obtenerEstado)
router.post('/', crearEstado)
router.put('/:id', actualizarEstado)
router.delete('/:id', eliminarEstado)

export default router