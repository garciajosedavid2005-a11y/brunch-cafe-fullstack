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
import { validateSchema } from '../modulos/compartido/validator.middleware.js'
import { deprecado } from '../modulos/compartido/deprecado.js'
import { crearProductoSchema, actualizarProductoSchema } from '../schema/producto.schema.js'

// Gestión de productos (admin). Se monta en /api/v1/admin/productos y en el alias /api/productos.
export const productosAdminRouter = Router()
productosAdminRouter.use(validateToken, requirePermission('catalogo:gestionar'))
productosAdminRouter.get('/', listarProductos)
productosAdminRouter.post('/', validateSchema(crearProductoSchema), crearProducto)
productosAdminRouter.put('/:id', validateSchema(actualizarProductoSchema), actualizarProducto)
productosAdminRouter.delete('/:id', eliminarProducto)

// /api/productos (anterior a v1)
const router = Router()

// Imágenes del catálogo: sus URL están guardadas en los productos; esta ruta no se depreca
router.get('/menu/imagenes/:nombre', obtenerImagenMenu)
// Alias de GET /api/v1/catalogo hasta que no quede ningún cliente usándolo (0.12)
router.get('/menu', deprecado('/api/v1/catalogo'), listarCatalogo)

router.use(deprecado('/api/v1/admin/productos'), productosAdminRouter)

export default router
