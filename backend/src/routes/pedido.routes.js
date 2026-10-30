import { Router } from 'express'
import {
    crearPedido,
    misPedidos,
    obtenerPedido,
    listarPedidos,
    cambiarEstadoPedido
} from '../controllers/pedido.controller.js'
import { validateToken } from '../middlewares/validateToken.js'
import { authorizeRole } from '../middlewares/authorizeRole.js'

const router = Router()

// ---------- Usuario logueado ----------
router.post('/', validateToken, crearPedido)
router.get('/mios', validateToken, misPedidos)

// ---------- Admin ----------
router.get('/', validateToken, authorizeRole('admin'), listarPedidos)
router.patch('/:id/estado', validateToken, authorizeRole('admin'), cambiarEstadoPedido)

// ---------- Cliente (solo el suyo) y admin (cualquiera); el controlador verifica el dueño ----------
// Va al final: si estuviera antes, '/mios' se interpretaría como un :id
router.get('/:id', validateToken, obtenerPedido)

export default router