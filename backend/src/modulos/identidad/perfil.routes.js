import { Router } from 'express'
import { validateToken } from './validateToken.js'
import { deprecado } from '../compartido/deprecado.js'
import { legadoVerUsuario, legadoEditarUsuario, cambiarMiContrasena } from './perfil.controller.js'

// Alias deprecados de /api/v1/cliente/perfil (se retiran en 0.12)
const router = Router()
const alias = deprecado('/api/v1/cliente/perfil')

router.get('/perfil', validateToken, alias, legadoVerUsuario)
router.put('/perfil', validateToken, alias, legadoEditarUsuario)
router.put('/perfil/contrasena', validateToken, deprecado('/api/v1/cliente/perfil/contrasena'), cambiarMiContrasena)

export default router
