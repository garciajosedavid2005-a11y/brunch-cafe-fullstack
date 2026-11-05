import { Router } from 'express'
import {
    listarProductos,
    crearProducto,
    actualizarProducto,
    eliminarProducto,
    listarCatalogo,
    obtenerImagenMenu,
} from '../controllers/producto.controller.js'
import { validateToken } from '../middlewares/validateToken.js'
import { requirePermission } from '../middlewares/requirePermission.js'
import { validateSchema } from '../middlewares/validator.middleware.js'
import { crearProductoSchema, actualizarProductoSchema } from '../schema/producto.schema.js'

const router = Router()

// Alias de GET /api/v1/catalogo hasta que no quede ningún cliente usándolo (0.12)
router.get('/menu', listarCatalogo)
router.get('/menu/imagenes/:nombre', obtenerImagenMenu)

router.use(validateToken, requirePermission('catalogo:gestionar'))
router.get('/', listarProductos)
router.post('/', validateSchema(crearProductoSchema), crearProducto)
router.put('/:id', validateSchema(actualizarProductoSchema), actualizarProducto)
router.delete('/:id', eliminarProducto)

export default router