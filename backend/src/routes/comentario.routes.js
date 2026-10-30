import { Router } from 'express'
import {
    listarComentarios,
    crearComentario,
    misComentarios
} from '../controllers/comentario.controller.js'
import { validateToken } from '../middlewares/validateToken.js'
import { authorizeRole } from '../middlewares/authorizeRole.js'

const router = Router()

// ---------- Pública (el admin también los ve por aquí) ----------
router.get('/', listarComentarios)

// ---------- Solo cliente (el admin no puede comentar) ----------
router.get('/mios', validateToken, authorizeRole('cliente'), misComentarios)
router.post('/', validateToken, authorizeRole('cliente'), crearComentario)

export default router