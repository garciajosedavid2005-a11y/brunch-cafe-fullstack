import { Router } from 'express'
import { listarUsuarios, actualizarUsuario } from './adminUsuario.controller.js'
import { autenticar } from './validateToken.js'
import { requirePermission } from './requirePermission.js'
import { validateSchema } from '../compartido/validator.middleware.js'
import { actualizarUsuarioSchema } from './adminUsuario.schema.js'

const router = Router()

router.use(autenticar, requirePermission('usuario:gestionar'))
router.get('/', listarUsuarios)
router.patch('/:id', validateSchema(actualizarUsuarioSchema), actualizarUsuario)

export default router
