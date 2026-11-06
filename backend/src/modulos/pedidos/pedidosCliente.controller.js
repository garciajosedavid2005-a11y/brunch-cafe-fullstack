// Pedidos del cliente (0.8: movidos desde routes/customer.routes.js sin cambiar la lógica).
// Los usan /api/v1/cliente/pedidos, /api/v1/cliente/metodos-pago y los alias /api/customer/*.
import mongoose from 'mongoose';
import { z } from 'zod';
import Pedido from './pedido.model.js';
import DetallePedido from './detallePedido.model.js';
import MetodoPago from './metodoPago.model.js';
import Producto from '../catalogo/producto.model.js';
import { STATUS_CLIENTE } from '../compartido/estados.js';
import { cambiarEstado, estadoPorCodigo, registrarEvento } from '../compartido/estados.service.js';
import { cuerpoError } from '../compartido/errors.js';
import { referenciaProducto, unaReferencia, MENSAJE_REFERENCIA, resolverProductos } from '../catalogo/referenciaProducto.schema.js';
import { telefono } from '../compartido/comunes.schema.js';
import { horasDomicilio, hora12, textoAnticipacion, textoRango } from '../configuracion/horarios.reglas.js';
import { obtenerHorarios } from '../configuracion/horarios.service.js';
import { conTransaccion } from '../compartido/transacciones.js';

const orderSchema = z.object({
  items: z.array(z.object({
    ...referenciaProducto,
    cantidad: z.coerce.number().int().min(1).max(20),
  }).refine(unaReferencia, { error: MENSAJE_REFERENCIA })).min(1).max(50),
  nombre: z.string().trim().min(3).max(50),
  // Obligatorio para el domicilio (el formulario lo prellena con el del perfil)
  telefono: telefono(),
  direccion: z.string().trim().min(5).max(60).regex(
    /^(calle|cl|carrera|cra|avenida|av|transversal|tv|diagonal|dg)\s*\d+[a-zA-Z]?\s*(sur|norte|este|oeste)?\s*#\s*\d+[a-zA-Z]?\s*-\s*\d+[a-zA-Z]?$/i,
    'Ingresa una dirección válida. Ejemplo: Carrera 36B #30-06.'
  ),
  // Solo horas en punto; el rango y la anticipación los da la configuración de horarios
  hora: z.string().regex(/^([01]\d|2[0-3]):00$/, 'Elige una hora de entrega en punto (HH:00).'),
  barrio: z.string().trim().min(3).max(40),
  indicaciones: z.string().trim().max(120).default(''),
  metodoPagoId: z.string().refine(mongoose.isValidObjectId, 'Selecciona un método de pago válido.'),
});


// N8: el domicilio es para hoy (Bogotá), dentro del horario y con la anticipación mínima
const mensajeHoraDomicilio = ({ domicilio }, disponibles) => {
  const regla = `Los domicilios son para el mismo día, ${textoRango(domicilio)}, con al menos ${textoAnticipacion(domicilio.anticipacionMinutos)} de anticipación.`;
  return disponibles.length
    ? `Elige una hora de entrega disponible (la primera es ${hora12(disponibles[0])}). ${regla}`
    : `Hoy ya no hay horarios de domicilio disponibles. ${regla}`;
};

// El status del portal sale del código del estado (sin adivinar por el texto)
const statusCliente = (tipo, estado) => STATUS_CLIENTE[tipo][estado?.codigo] || 'pending';
const POBLAR_ESTADO = 'nombre codigo';
const serializeOrder = (order, details) => ({
  _id: order._id,
  orderNumber: order._id.toString().slice(-6).toUpperCase(),
  status: statusCliente('pedido', order.estado),
  statusLabel: order.estado?.nombre || 'Pendiente',
  codigo: order.estado?.codigo || '',
  paymentMethod: order.metodoPago?.nombre || '',
  total: order.total,
  createdAt: order.createdAt,
  delivery: {
    nombre: order.nombreEntrega || '',
    direccion: order.direccion || '',
    barrio: order.barrio || '',
    telefono: order.telefono || '',
    hora: order.horaEntrega || '',
    entregaEn: order.entregaEn || null,
    indicaciones: order.indicaciones || '',
  },
  items: details.map((detail) => ({
    productId: detail.productoId,
    name: detail.nombreProducto,
    quantity: detail.cantidad,
    unitPrice: detail.precioProducto,
  })),
});

export const listarMisPedidos = async (req, res, next) => {
  try {
    const orders = await Pedido.find({ usuario: req.usuario.id })
      .populate('estado', POBLAR_ESTADO)
      .populate('metodoPago', 'nombre')
      .sort({ createdAt: -1 })
      .lean();
    const ids = orders.map((order) => order._id);
    const details = await DetallePedido.find({ pedido: { $in: ids } }).lean();
    const detailsByOrder = new Map();
    for (const detail of details) {
      const key = detail.pedido.toString();
      detailsByOrder.set(key, [...(detailsByOrder.get(key) || []), detail]);
    }

    return res.json({
      orders: orders.map((order) => serializeOrder(order, detailsByOrder.get(order._id.toString()) || [])),
    });
  } catch (error) {
    return next(error);
  }
};

export const listarMetodosPagoActivos = async (req, res, next) => {
  try {
    const methods = await MetodoPago.find({ activo: { $ne: false } })
      .sort({ nombre: 1 })
      .select('nombre descripcion');
    return res.json(methods.map((method) => ({
      id: method._id,
      nombre: method.nombre,
      descripcion: method.descripcion || '',
    })));
  } catch (error) {
    return next(error);
  }
};

export const crearPedido = async (req, res, next) => {
  const parsed = orderSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(cuerpoError('BAD_REQUEST', 'Revisa los productos y datos de entrega.', parsed.error.flatten()));
  }

  const horarios = await obtenerHorarios();
  const disponibles = horasDomicilio(horarios);
  if (!disponibles.includes(parsed.data.hora)) {
    return res.status(400).json(cuerpoError(
      'HORA_NO_DISPONIBLE', mensajeHoraDomicilio(horarios, disponibles), { horasDisponibles: disponibles },
    ));
  }

  const productoDe = await resolverProductos(Producto, parsed.data.items);
  const products = parsed.data.items.map(productoDe).filter(Boolean);
  const lines = parsed.data.items.map((item) => {
    const product = productoDe(item);
    if (!product) return null;
    return {
      productId: product.codigo,
      productRef: product._id,
      name: product.nombre,
      unitPrice: product.precio,
      quantity: item.cantidad,
      subtotal: product.precio * item.cantidad,
    };
  });
  if (lines.some((line) => !line)) {
    return res.status(400).json(cuerpoError('BAD_REQUEST', 'Uno o más productos ya no están disponibles en el menú.'));
  }
  // Agotados: existen pero no se pueden pedir (el carrito pudo llenarse antes de que se agotaran)
  const agotados = products.filter((product) => product.disponible === false);
  if (agotados.length) {
    const nombres = agotados.map((product) => product.nombre).join(', ');
    return res.status(409).json(cuerpoError(
      'PRODUCT_UNAVAILABLE',
      `${agotados.length === 1 ? 'Este producto está agotado' : 'Estos productos están agotados'}: ${nombres}. ${agotados.length === 1 ? 'Quítalo' : 'Quítalos'} del carrito para continuar.`,
      { productos: agotados.map((product) => product.codigo) },
    ));
  }

  try {
    const [pending, paymentMethod] = await Promise.all([
      estadoPorCodigo('pedido', 'pendiente'),
      MetodoPago.findOne({ _id: parsed.data.metodoPagoId, activo: { $ne: false } }),
    ]);
    if (!paymentMethod) return res.status(400).json(cuerpoError('BAD_REQUEST', 'El método de pago ya no está disponible. Actualiza la página y elige otro.'));

    // Pedido, líneas (con nombre y precio del momento) y Evento inicial en una transacción (0.9):
    // si algo falla no queda nada a medias
    const { order, details } = await conTransaccion(async (session) => {
      const [creado] = await Pedido.create([{
        usuario: req.usuario.id,
        estado: pending._id,
        metodoPago: paymentMethod._id,
        total: lines.reduce((total, line) => total + line.subtotal, 0),
        nombreEntrega: parsed.data.nombre,
        telefono: parsed.data.telefono,
        direccion: parsed.data.direccion,
        barrio: parsed.data.barrio,
        horaEntrega: parsed.data.hora,
        indicaciones: parsed.data.indicaciones,
      }], { session });
      const lineas = await DetallePedido.insertMany(lines.map((line) => ({
        pedido: creado._id,
        producto: line.productRef,
        productoId: line.productId,
        nombreProducto: line.name,
        precioProducto: line.unitPrice,
        cantidad: line.quantity,
        subtotal: line.subtotal,
      })), { session });
      await registrarEvento({
        entidad: 'pedido', entidadId: creado._id, a: 'pendiente', usuario: req.usuario.id, actor: req.usuario.rol || 'cliente', session,
      });
      return { order: creado, details: lineas };
    });

    const populatedOrder = await Pedido.findById(order._id)
      .populate('estado', POBLAR_ESTADO)
      .populate('metodoPago', 'nombre')
      .lean();
    return res.status(201).json({ order: serializeOrder(populatedOrder, details) });
  } catch (error) {
    return next(error);
  }
};

export const verMiPedido = async (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json(cuerpoError('NOT_FOUND', 'No se encontró el pedido.'));
  }
  try {
    const order = await Pedido.findOne({ _id: req.params.id, usuario: req.usuario.id })
      .populate('estado', POBLAR_ESTADO)
      .populate('metodoPago', 'nombre')
      .lean();
    if (!order) return res.status(404).json(cuerpoError('NOT_FOUND', 'No se encontró el pedido.'));
    const details = await DetallePedido.find({ pedido: order._id }).lean();
    return res.json({ order: serializeOrder(order, details) });
  } catch (error) {
    return next(error);
  }
};

// El cliente solo puede cancelar su pedido mientras está pendiente
// Requiere validateSchema(cancelacionClienteSchema) en la ruta
export const cancelarMiPedido = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json(cuerpoError('NOT_FOUND', 'No se encontró el pedido.'));
  }
  const order = await Pedido.findOne({ _id: req.params.id, usuario: req.usuario.id }).populate('estado', 'codigo');
  if (!order) return res.status(404).json(cuerpoError('NOT_FOUND', 'No se encontró el pedido.'));

  await cambiarEstado({
    tipo: 'pedido',
    Modelo: Pedido,
    documento: order,
    a: 'cancelado',
    actor: 'cliente',
    sesion: req.usuario,
    motivo: req.validado?.motivo,
    filtro: { usuario: req.usuario.id },
  });
  const updated = await Pedido.findById(order._id)
    .populate('estado', POBLAR_ESTADO)
    .populate('metodoPago', 'nombre')
    .lean();
  const details = await DetallePedido.find({ pedido: order._id }).lean();
  return res.json({ order: serializeOrder(updated, details) });
};
