import { Router } from 'express'
import { listarUsuarios, actualizarUsuario, crearUsuario, reenviarEnlace } from './adminUsuario.controller.js'
import { autenticar } from './validateToken.js'
import { requirePermission } from './requirePermission.js'
import { validateSchema } from '../compartido/validator.middleware.js'
import { idempotencia } from '../compartido/idempotencia.js'
import { actualizarUsuarioSchema, crearUsuarioSchema } from './adminUsuario.schema.js'

const router = Router()

router.use(autenticar, requirePermission('usuario:gestionar'))
router.get('/', listarUsuarios)
// 1.5b · Crear usuario: la persona define su contraseña con el enlace «Crea tu contraseña»
router.post('/', validateSchema(crearUsuarioSchema), crearUsuario)
router.patch('/:id', validateSchema(actualizarUsuarioSchema), actualizarUsuario)
// Invalida el enlace anterior y envía uno nuevo de 24 h (solo cuentas que aún no crearon su contraseña)
// Idempotency-Key: un doble clic o un reintento de red no envía dos correos (el segundo invalidaría el primero)
router.post('/:id/reenviar-enlace', idempotencia, reenviarEnlace)

export default router
