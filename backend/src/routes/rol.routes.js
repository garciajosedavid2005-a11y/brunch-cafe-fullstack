import { Router } from 'express'
import {
    listarRoles,
    crearRol,
    actualizarRol,
    eliminarRol
} from '../controllers/rol.controller.js'
import { validateToken } from '../middlewares/validateToken.js'
import { authorizeRole } from '../middlewares/authorizeRole.js'
import { validateSchema } from '../middlewares/validator.middleware.js'
import { crearRolSchema, actualizarRolSchema } from '../schema/rol.schema.js'

const router = Router()

// Todas las rutas de este archivo son solo para admin
router.use(validateToken, authorizeRole('admin'))

router.get('/', listarRoles)
router.post('/', validateSchema(crearRolSchema), crearRol)
router.put('/:id', validateSchema(actualizarRolSchema), actualizarRol)
router.delete('/:id', eliminarRol)

export default router