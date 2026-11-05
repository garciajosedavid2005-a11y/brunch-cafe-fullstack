import { Router } from 'express'
import {
    listarCategorias,
    crearCategoria,
    actualizarCategoria,
    eliminarCategoria
} from '../controllers/categoria.controller.js'
import { validateToken } from '../middlewares/validateToken.js'
import { requirePermission } from '../middlewares/requirePermission.js'
import { validateSchema } from '../middlewares/validator.middleware.js'
import { crearCategoriaSchema, actualizarCategoriaSchema } from '../schema/categoria.schema.js'

const router = Router()

// Pública: el menú necesita listar las categorías
router.get('/', listarCategorias)

// Solo admin
router.post('/', validateToken, requirePermission('catalogo:gestionar'), validateSchema(crearCategoriaSchema), crearCategoria)
router.put('/:id', validateToken, requirePermission('catalogo:gestionar'), validateSchema(actualizarCategoriaSchema), actualizarCategoria)
router.delete('/:id', validateToken, requirePermission('catalogo:gestionar'), eliminarCategoria)

export default router