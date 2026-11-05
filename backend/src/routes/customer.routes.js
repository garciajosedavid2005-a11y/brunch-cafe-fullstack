import { Router } from 'express';
import { validateToken } from '../middlewares/validateToken.js';
import { deprecado } from '../middlewares/deprecado.js';
import { validateSchema } from '../middlewares/validator.middleware.js';
import { cancelacionClienteSchema } from '../schema/cambioEstado.schema.js';
import { legadoVerCustomer, legadoEditarCustomer } from '../modulos/identidad/perfil.controller.js';
import * as reservas from '../modulos/salon/reservas.controller.js';
import * as pedidos from '../modulos/pedidos/pedidosCliente.controller.js';
import { crearComentario, listarMisComentarios } from '../controllers/comentario.controller.js';

// /api/customer: alias deprecados de /api/v1/cliente (se retiran en 0.12).
const router = Router();
router.use(validateToken);

// Perfil (mismo servicio y validaciones)
router.get('/profile', deprecado('/api/v1/cliente/perfil'), legadoVerCustomer);
router.patch('/profile', deprecado('/api/v1/cliente/perfil'), legadoEditarCustomer);

// Pedidos y métodos de pago
const aliasPedidos = deprecado('/api/v1/cliente/pedidos');
router.get('/orders', aliasPedidos, pedidos.listarMisPedidos);
router.post('/orders', aliasPedidos, pedidos.crearPedido);
router.get('/orders/:id', aliasPedidos, pedidos.verMiPedido);
router.patch('/orders/:id/cancel', aliasPedidos, validateSchema(cancelacionClienteSchema), pedidos.cancelarMiPedido);
router.get('/payment-methods', deprecado('/api/v1/cliente/metodos-pago'), pedidos.listarMetodosPagoActivos);

// Reservas: alias deprecados de /api/v1/cliente/reservas (mismo servicio y validaciones)
const aliasReservas = deprecado('/api/v1/cliente/reservas');
router.get('/reservations', aliasReservas, reservas.listar);
router.post('/reservations', aliasReservas, reservas.crear);
router.patch('/reservations/:id', aliasReservas, reservas.editar);
router.patch('/reservations/:id/cancel', aliasReservas, reservas.cancelar);

// Comentarios propios
const aliasComentarios = deprecado('/api/v1/cliente/comentarios');
router.get(['/reviews', '/comentarios'], aliasComentarios, listarMisComentarios);
router.post(['/reviews', '/comentarios'], aliasComentarios, crearComentario);

export default router;
