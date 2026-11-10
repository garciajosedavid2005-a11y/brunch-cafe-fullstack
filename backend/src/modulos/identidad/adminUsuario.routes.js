import { Router } from 'express'
import { listarUsuarios, actualizarUsuario, crearUsuario } from './adminUsuario.controller.js'
import { autenticar } from './validateToken.js'
import { requirePermission } from './requirePermission.js'
import { validateSchema } from '../compartido/validator.middleware.js'
import { actualizarUsuarioSchema, crearUsuarioSchema } from './adminUsuario.schema.js'

const router = Router()

router.use(autenticar, requirePermission('usuario:gestionar'))
router.get('/', listarUsuarios)
// 1.5b · Crear usuario: la persona define su contraseña con el enlace «Crea tu contraseña»
router.post('/', validateSchema(crearUsuarioSchema), crearUsuario)
router.patch('/:id', validateSchema(actualizarUsuarioSchema), actualizarUsuario)

export default router
