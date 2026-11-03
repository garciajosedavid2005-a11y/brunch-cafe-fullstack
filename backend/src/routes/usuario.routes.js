import { Router } from 'express'
import { verPerfil, actualizarPerfil, cambiarContrasena } from '../controllers/usuario.controller.js'
import { validateToken } from '../middlewares/validateToken.js'
import { validateSchema } from '../middlewares/validator.middleware.js'
import { actualizarPerfilSchema } from '../schema/usuario.schema.js'

const router = Router()

router.get('/perfil', validateToken, verPerfil)
router.put('/perfil', validateToken, validateSchema(actualizarPerfilSchema), actualizarPerfil)
router.put('/perfil/contrasena', validateToken, cambiarContrasena)

export default router