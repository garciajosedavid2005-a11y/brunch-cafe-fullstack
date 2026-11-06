import { Router } from 'express'
import { validateToken } from '../../middlewares/validateToken.js'
import { requirePermission } from '../../middlewares/requirePermission.js'
import { validateSchema } from '../../modulos/compartido/validator.middleware.js'
import { visibilidadComentarioSchema } from '../../modulos/catalogo/comentario.schema.js'
import { listarComentariosAdmin, cambiarVisibilidadComentario, eliminarComentario } from '../../modulos/catalogo/comentario.controller.js'
import categoriaRoutes from '../../modulos/catalogo/categoria.routes.js'
import metodoPagoRoutes from '../../modulos/pedidos/metodoPago.routes.js'
import estadoRoutes from '../estado.routes.js'
import rolRoutes from '../rol.routes.js'
import permisoRoutes from '../permiso.routes.js'
import adminUsuarioRoutes from '../adminUsuario.routes.js'
import { productosAdminRouter } from '../../modulos/catalogo/producto.routes.js'
import { horariosSchema } from '../../modulos/configuracion/horarios.schema.js'
import { verHorariosAdmin, editarHorarios } from '../../modulos/configuracion/horarios.controller.js'

// /api/v1/admin: configuración del negocio. Cada router exige su permiso (no el rol).
const router = Router()

router.use('/categorias', categoriaRoutes)
router.use('/productos', productosAdminRouter)
router.use('/estados', estadoRoutes)
router.use('/roles', rolRoutes)
router.use('/permisos', permisoRoutes)
router.use('/metodos-pago', metodoPagoRoutes)
router.use('/usuarios', adminUsuarioRoutes)

const comentarios = Router()
comentarios.use(validateToken, requirePermission('resena:moderar'))
comentarios.get('/', listarComentariosAdmin)
comentarios.patch('/:id/visibilidad', validateSchema(visibilidadComentarioSchema), cambiarVisibilidadComentario)
comentarios.delete('/:id', eliminarComentario)
router.use('/comentarios', comentarios)

const horarios = Router()
horarios.use(validateToken, requirePermission('horario:editar'))
horarios.get('/', verHorariosAdmin)
horarios.put('/', validateSchema(horariosSchema), editarHorarios)
router.use('/horarios', horarios)

export default router
