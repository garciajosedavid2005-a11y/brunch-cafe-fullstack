import { Router } from 'express'
import {
    listarRoles,
    crearRol,
    actualizarRol,
    eliminarRol
} from '../controllers/rol.controller.js'
import { validateToken } from '../middlewares/validateToken.js'
import { requirePermission } from '../middlewares/requirePermission.js'
import { validateSchema } from '../modulos/compartido/validator.middleware.js'
import { crearRolSchema, actualizarRolSchema } from '../schema/rol.schema.js'

const router = Router()

// Gestión de roles: requiere rol:gestionar
router.use(validateToken, requirePermission('rol:gestionar'))

router.get('/', listarRoles)
router.post('/', validateSchema(crearRolSchema), crearRol)
router.put('/:id', validateSchema(actualizarRolSchema), actualizarRol)
router.delete('/:id', eliminarRol)

export default router