import { Router } from 'express'
import {
    listarMetodosPago,
    obtenerMetodoPago,
    crearMetodoPago,
    actualizarMetodoPago,
    eliminarMetodoPago
} from '../controllers/metodoPago.controller.js'
import { validateToken } from '../middlewares/validateToken.js'
import { authorizeRole } from '../middlewares/authorizeRole.js'

const router = Router()

// ---------- Públicas (el checkout las necesita) ----------
router.get('/', listarMetodosPago)
router.get('/:id', obtenerMetodoPago)

// ---------- Admin ----------
router.post('/', validateToken, authorizeRole('admin'), crearMetodoPago)
router.put('/:id', validateToken, authorizeRole('admin'), actualizarMetodoPago)
router.delete('/:id', validateToken, authorizeRole('admin'), eliminarMetodoPago)

export default router