import { Router } from 'express'
import { validateToken } from '../../middlewares/validateToken.js'
import { verMiPerfil, editarMiPerfil, cambiarMiContrasena } from '../../modulos/identidad/perfil.controller.js'

// /api/v1/cliente: lo que hace el usuario de la sesión sobre sus propios datos
const router = Router()
router.use(validateToken)

router.get('/perfil', verMiPerfil)
router.patch('/perfil', editarMiPerfil)
router.put('/perfil/contrasena', cambiarMiContrasena)

export default router
