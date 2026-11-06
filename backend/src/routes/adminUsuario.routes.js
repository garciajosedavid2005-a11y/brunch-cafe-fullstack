import { Router } from 'express'
import { listarUsuarios, actualizarUsuario } from '../controllers/adminUsuario.controller.js'
import { autenticar } from '../middlewares/validateToken.js'
import { requirePermission } from '../middlewares/requirePermission.js'
import { validateSchema } from '../modulos/compartido/validator.middleware.js'
import { actualizarUsuarioSchema } from '../schema/adminUsuario.schema.js'

const router = Router()

router.use(autenticar, requirePermission('usuario:gestionar'))
router.get('/', listarUsuarios)
router.patch('/:id', validateSchema(actualizarUsuarioSchema), actualizarUsuario)

export default router
