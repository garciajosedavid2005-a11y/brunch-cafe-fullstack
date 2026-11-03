import { Router } from 'express'
import {
    listarEstados,
    crearEstado,
    actualizarEstado,
    eliminarEstado
} from '../controllers/estado.controller.js'
import { validateToken } from '../middlewares/validateToken.js'
import { authorizeRole } from '../middlewares/authorizeRole.js'
import { validateSchema } from '../middlewares/validator.middleware.js'
import { crearEstadoSchema, actualizarEstadoSchema } from '../schema/estado.schema.js'

const router = Router()

// Todas las rutas de este archivo son solo para admin
router.use(validateToken, authorizeRole('admin'))

router.get('/', listarEstados)
router.post('/', validateSchema(crearEstadoSchema), crearEstado)
router.put('/:id', validateSchema(actualizarEstadoSchema), actualizarEstado)
router.delete('/:id', eliminarEstado)

export default router