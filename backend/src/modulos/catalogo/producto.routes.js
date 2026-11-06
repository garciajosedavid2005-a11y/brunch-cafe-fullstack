import { Router } from 'express'
import {
    listarProductos,
    crearProducto,
    actualizarProducto,
    eliminarProducto,
} from './producto.controller.js'
import { validateToken } from '../identidad/validateToken.js'
import { requirePermission } from '../identidad/requirePermission.js'
import { validateSchema } from '../compartido/validator.middleware.js'
import { crearProductoSchema, actualizarProductoSchema } from './producto.schema.js'

// Gestión de productos (admin). Se monta en /api/v1/admin/productos.
export const productosAdminRouter = Router()
productosAdminRouter.use(validateToken, requirePermission('catalogo:gestionar'))
productosAdminRouter.get('/', listarProductos)
productosAdminRouter.post('/', validateSchema(crearProductoSchema), crearProducto)
productosAdminRouter.put('/:id', validateSchema(actualizarProductoSchema), actualizarProducto)
productosAdminRouter.delete('/:id', eliminarProducto)
