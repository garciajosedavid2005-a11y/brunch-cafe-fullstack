import { Router } from 'express'
import { verPerfil, actualizarPerfil } from '../controllers/usuario.controller.js'
import { validateToken } from '../middlewares/validateToken.js'


const router = Router()

router.get('/perfil', validateToken, verPerfil)
router.put('/perfil', validateToken, actualizarPerfil)


export default router