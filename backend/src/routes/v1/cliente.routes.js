import { Router } from 'express'
import { validateToken } from '../../modulos/identidad/validateToken.js'
import {
    verMiPerfil, editarMiPerfil, cambiarMiContrasena,
    verMisDirecciones, agregarMiDireccion, editarMiDireccion, borrarMiDireccion, principalMiDireccion,
} from '../../modulos/identidad/perfil.controller.js'
import * as reservas from '../../modulos/salon/reservas.controller.js'
import * as pedidos from '../../modulos/pedidos/pedidosCliente.controller.js'
import { validateSchema } from '../../modulos/compartido/validator.middleware.js'
import { misPuntos } from '../../modulos/fidelizacion/puntos.service.js'
import { idempotencia } from '../../modulos/compartido/idempotencia.js'
import { cancelacionClienteSchema } from '../../modulos/compartido/cambioEstado.schema.js'
import { crearComentario, listarMisComentarios, editarMiComentario } from '../../modulos/catalogo/comentario.controller.js'

// /api/v1/cliente: lo que hace el usuario de la sesión sobre sus propios datos
const router = Router()
router.use(validateToken)

router.get('/perfil', verMiPerfil)
router.patch('/perfil', editarMiPerfil)
router.put('/perfil/contrasena', cambiarMiContrasena)

// 6.6 · Mis puntos: saldo y movimientos
router.get('/puntos', async (req, res) => res.json(await misPuntos(req.usuario.id)))

// 6.4 · Libreta de direcciones (hasta 5, una principal)
router.get('/direcciones', verMisDirecciones)
router.post('/direcciones', agregarMiDireccion)
router.patch('/direcciones/:id', editarMiDireccion)
router.delete('/direcciones/:id', borrarMiDireccion)
router.post('/direcciones/:id/principal', principalMiDireccion)

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
