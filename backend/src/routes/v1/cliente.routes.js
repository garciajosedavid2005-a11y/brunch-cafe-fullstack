import { Router } from 'express'
import { validateToken } from '../../modulos/identidad/validateToken.js'
import { verMiPerfil, editarMiPerfil, cambiarMiContrasena } from '../../modulos/identidad/perfil.controller.js'
import * as reservas from '../../modulos/salon/reservas.controller.js'
import * as pedidos from '../../modulos/pedidos/pedidosCliente.controller.js'
import { validateSchema } from '../../modulos/compartido/validator.middleware.js'
import { idempotencia } from '../../modulos/compartido/idempotencia.js'
import { cancelacionClienteSchema } from '../../modulos/compartido/cambioEstado.schema.js'
import { crearComentario, listarMisComentarios, editarMiComentario } from '../../modulos/catalogo/comentario.controller.js'

// /api/v1/cliente: lo que hace el usuario de la sesión sobre sus propios datos
const router = Router()
router.use(validateToken)

router.get('/perfil', verMiPerfil)
router.patch('/perfil', editarMiPerfil)
router.put('/perfil/contrasena', cambiarMiContrasena)

router.get('/reservas', reservas.listar)
router.post('/reservas', reservas.crear)
router.patch('/reservas/:id', reservas.editar)
router.patch('/reservas/:id/cancelar', reservas.cancelar)

router.get('/pedidos', pedidos.listarMisPedidos)
router.post('/pedidos', idempotencia, pedidos.crearPedido)
router.get('/pedidos/:id', pedidos.verMiPedido)
router.patch('/pedidos/:id/cancelar', validateSchema(cancelacionClienteSchema), pedidos.cancelarMiPedido)
router.get('/metodos-pago', pedidos.listarMetodosPagoActivos)

router.get('/comentarios', listarMisComentarios)
router.post('/comentarios', crearComentario)
router.patch('/comentarios/:id', editarMiComentario)

export default router
