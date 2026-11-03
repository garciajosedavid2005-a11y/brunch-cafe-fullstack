import { Router } from 'express'
import {
    listarCategorias,
    crearCategoria,
    actualizarCategoria,
    eliminarCategoria
} from '../controllers/categoria.controller.js'
import { validateToken } from '../middlewares/validateToken.js'
import { authorizeRole } from '../middlewares/authorizeRole.js'
import { validateSchema } from '../middlewares/validator.middleware.js'
import { crearCategoriaSchema, actualizarCategoriaSchema } from '../schema/categoria.schema.js'

const router = Router()

// Pública: el menú necesita listar las categorías
router.get('/', listarCategorias)

// Solo admin
router.post('/', validateToken, authorizeRole('admin'), validateSchema(crearCategoriaSchema), crearCategoria)
router.put('/:id', validateToken, authorizeRole('admin'), validateSchema(actualizarCategoriaSchema), actualizarCategoria)
router.delete('/:id', validateToken, authorizeRole('admin'), eliminarCategoria)

export default router