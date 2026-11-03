import { Router } from 'express'
import {
    listarProductos,
    crearProducto,
    actualizarProducto,
    eliminarProducto,
    listarMenuPublico,
    obtenerImagenMenu,
} from '../controllers/producto.controller.js'
import { validateToken } from '../middlewares/validateToken.js'
import { authorizeRole } from '../middlewares/authorizeRole.js'
import { validateSchema } from '../middlewares/validator.middleware.js'
import { crearProductoSchema, actualizarProductoSchema } from '../schema/producto.schema.js'

const router = Router()

router.get('/menu', listarMenuPublico)
router.get('/menu/imagenes/:nombre', obtenerImagenMenu)

router.use(validateToken, authorizeRole('admin'))
router.get('/', listarProductos)
router.post('/', validateSchema(crearProductoSchema), crearProducto)
router.put('/:id', validateSchema(actualizarProductoSchema), actualizarProducto)
router.delete('/:id', eliminarProducto)

export default router