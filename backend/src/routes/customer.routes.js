import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { validateToken } from '../middlewares/validateToken.js';
import Usuario from '../models/usuario.model.js';
import Pedido from '../models/pedido.model.js';
import DetallePedido from '../models/detallePedido.model.js';
import MetodoPago from '../models/metodoPago.model.js';
import Reserva from '../models/reserva.model.js';
import Producto from '../models/producto.model.js';
import { crearComentario, listarMisComentarios } from '../controllers/comentario.controller.js';
import { STATUS_CLIENTE } from '../libs/estados.js';
import { cambiarEstado, estadoPorCodigo, registrarEvento } from '../services/estados.service.js';
import { validateSchema } from '../middlewares/validator.middleware.js';
import { cuerpoError } from '../libs/errors.js';
import { referenciaProducto, unaReferencia, MENSAJE_REFERENCIA, resolverProductos } from '../schema/referenciaProducto.js';
import { cancelacionClienteSchema } from '../schema/cambioEstado.schema.js';

const router = Router();
router.use(validateToken);

const profileSchema = z.object({
  nombre: z.string().trim().min(1).max(60),
  apellido: z.string().trim().min(1).max(60),
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  telefono: z.string().trim().min(7).max(30),
});

const reservationSchema = z.object({
  nombre: z.string().trim().min(3).max(120),
  correo: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  motivo: z.string().trim().min(3).max(120),
  personas: z.coerce.number().int().min(1).max(20),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }),
  hora: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  observaciones: z.string().trim().max(200).default(''),
});

const orderSchema = z.object({
  items: z.array(z.object({
    ...referenciaProducto,
    cantidad: z.coerce.number().int().min(1).max(20),
  }).refine(unaReferencia, { error: MENSAJE_REFERENCIA })).min(1).max(50),
  nombre: z.string().trim().min(3).max(50),
  direccion: z.string().trim().min(5).max(60).regex(
    /^(calle|cl|carrera|cra|avenida|av|transversal|tv|diagonal|dg)\s*\d+[a-zA-Z]?\s*(sur|norte|este|oeste)?\s*#\s*\d+[a-zA-Z]?\s*-\s*\d+[a-zA-Z]?$/i,
    'Ingresa una dirección válida. Ejemplo: Carrera 36B #30-06.'
  ),
  hora: z.string().regex(/^(?:(?:0[8-9]|1[0-5]):[0-5]\d|16:00)$/),
  barrio: z.string().trim().min(3).max(40),
  indicaciones: z.string().trim().max(120).default(''),
  metodoPagoId: z.string().refine(mongoose.isValidObjectId, 'Selecciona un método de pago válido.'),
});

const availableReservationTimes = (date) => {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  const lastHour = day === 0 || day === 6 ? 11 : 12;
  return Array.from({ length: lastHour - 7 }, (_, index) =>
    `${String(index + 8).padStart(2, '0')}:00`
  );
};

const reservationDateTime = (date, time) => new Date(`${date}T${time}:00-05:00`);

// El status del portal sale del código del estado (sin adivinar por el texto)
const statusCliente = (tipo, estado) => STATUS_CLIENTE[tipo][estado?.codigo] || 'pending';
const POBLAR_ESTADO = 'nombre codigo';
// Estados en los que el cliente todavía puede editar o cancelar su reserva
const RESERVA_EDITABLE = ['pendiente', 'confirmada'];

const serializeReservation = (reservation) => {
  const owner = reservation.usuario && typeof reservation.usuario === 'object'
    ? reservation.usuario
    : null;
  return {
    _id: reservation._id,
    nombre: reservation.nombre || [owner?.nombre, owner?.apellido].filter(Boolean).join(' '),
    correo: reservation.correo || owner?.correo || '',
    motivo: reservation.motivo || '',
    personas: reservation.cantidadPersonas,
    fecha: reservation.fecha,
    hora: reservation.hora,
    observaciones: reservation.observaciones || '',
    status: statusCliente('reserva', reservation.estado),
    statusLabel: reservation.estado?.nombre || '',
    codigo: reservation.estado?.codigo || '',
    createdAt: reservation.createdAt,
    user: owner ? {
      nombre: owner.nombre,
      apellido: owner.apellido,
      email: owner.correo,
    } : undefined,
  };
};

const validateReservationDate = (reservation) => {
  const startsAt = reservationDateTime(reservation.fecha, reservation.hora);
  if (Number.isNaN(startsAt.getTime()) || startsAt <= new Date()) {
    return 'La fecha y hora de la reserva deben ser futuras.';
  }
  if (!availableReservationTimes(reservation.fecha).includes(reservation.hora)) {
    return 'La hora debe respetar el horario del café: lunes a viernes de 8:00 a 12:00 y fines de semana de 8:00 a 11:00.';
  }
  return null;
};

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
    hora: order.horaEntrega || '',
    indicaciones: order.indicaciones || '',
  },
  items: details.map((detail) => ({
    productId: detail.productoId,
    name: detail.nombreProducto,
    quantity: detail.cantidad,
    unitPrice: detail.precioProducto,
  })),
});

router.get('/profile', async (req, res, next) => {
  try {
    const profile = await Usuario.findById(req.usuario.id).select('nombre apellido correo telefono');
    if (!profile) return res.status(404).json({ message: 'No se encontró el perfil.' });
    return res.json({
      profile: {
        nombre: profile.nombre,
        apellido: profile.apellido,
        email: profile.correo,
        telefono: profile.telefono || '',
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.patch('/profile', async (req, res, next) => {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Revisa los datos del perfil.', errors: parsed.error.flatten() });
  }

  try {
    const duplicate = await Usuario.findOne({
      correo: parsed.data.email,
      _id: { $ne: req.usuario.id },
    });
    if (duplicate) return res.status(409).json({ message: 'Ese correo ya está asociado a otra cuenta.' });

    const profile = await Usuario.findByIdAndUpdate(
      req.usuario.id,
      {
        nombre: parsed.data.nombre,
        apellido: parsed.data.apellido,
        correo: parsed.data.email,
        telefono: parsed.data.telefono,
      },
      { returnDocument: 'after', runValidators: true, select: 'nombre apellido correo telefono' }
    );
    if (!profile) return res.status(404).json({ message: 'No se encontró el perfil.' });

    return res.json({
      profile: {
        nombre: profile.nombre,
        apellido: profile.apellido,
        email: profile.correo,
        telefono: profile.telefono || '',
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'Ese correo ya está asociado a otra cuenta.' });
    }
    return next(error);
  }
});

router.get('/orders', async (req, res, next) => {
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
});

router.get('/payment-methods', async (req, res, next) => {
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
});

router.post('/orders', async (req, res, next) => {
  const parsed = orderSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Revisa los productos y datos de entrega.', errors: parsed.error.flatten() });
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
    return res.status(400).json({ message: 'Uno o más productos ya no están disponibles en el menú.' });
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
    if (!paymentMethod) return res.status(400).json({ message: 'El método de pago ya no está disponible. Actualiza la página y elige otro.' });

    const order = await Pedido.create({
      usuario: req.usuario.id,
      estado: pending._id,
      metodoPago: paymentMethod._id,
      total: lines.reduce((total, line) => total + line.subtotal, 0),
      nombreEntrega: parsed.data.nombre,
      direccion: parsed.data.direccion,
      barrio: parsed.data.barrio,
      horaEntrega: parsed.data.hora,
      indicaciones: parsed.data.indicaciones,
    });

    let details;
    try {
      details = await DetallePedido.insertMany(lines.map((line) => ({
        pedido: order._id,
        producto: line.productRef,
        productoId: line.productId,
        nombreProducto: line.name,
        precioProducto: line.unitPrice,
        cantidad: line.quantity,
        subtotal: line.subtotal,
      })));
    } catch (error) {
      await DetallePedido.deleteMany({ pedido: order._id });
      await Pedido.findByIdAndDelete(order._id);
      throw error;
    }
    await registrarEvento({
      entidad: 'pedido', entidadId: order._id, a: 'pendiente', usuario: req.usuario.id, actor: req.usuario.rol || 'cliente',
    });

    const populatedOrder = await Pedido.findById(order._id)
      .populate('estado', POBLAR_ESTADO)
      .populate('metodoPago', 'nombre')
      .lean();
    return res.status(201).json({ order: serializeOrder(populatedOrder, details) });
  } catch (error) {
    return next(error);
  }
});

router.get('/orders/:id', async (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ message: 'No se encontró el pedido.' });
  }
  try {
    const order = await Pedido.findOne({ _id: req.params.id, usuario: req.usuario.id })
      .populate('estado', POBLAR_ESTADO)
      .populate('metodoPago', 'nombre')
      .lean();
    if (!order) return res.status(404).json({ message: 'No se encontró el pedido.' });
    const details = await DetallePedido.find({ pedido: order._id }).lean();
    return res.json({ order: serializeOrder(order, details) });
  } catch (error) {
    return next(error);
  }
});

// El cliente solo puede cancelar su pedido mientras está pendiente
router.patch('/orders/:id/cancel', validateSchema(cancelacionClienteSchema), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ message: 'No se encontró el pedido.' });
  }
  const order = await Pedido.findOne({ _id: req.params.id, usuario: req.usuario.id }).populate('estado', 'codigo');
  if (!order) return res.status(404).json({ message: 'No se encontró el pedido.' });

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
});

router.get('/reservations', async (req, res, next) => {
  try {
    const reservations = await Reserva.find({ usuario: req.usuario.id })
      .populate('usuario', 'nombre apellido correo')
      .populate('estado', POBLAR_ESTADO)
      .sort({ fecha: -1, hora: -1 })
      .lean();
    return res.json({ reservations: reservations.map(serializeReservation) });
  } catch (error) {
    return next(error);
  }
});

router.post('/reservations', async (req, res, next) => {
  const parsed = reservationSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Revisa los datos de la reserva.', errors: parsed.error.flatten() });
  }
  const dateError = validateReservationDate(parsed.data);
  if (dateError) return res.status(400).json({ message: dateError });

  try {
    const pending = await estadoPorCodigo('reserva', 'pendiente');

    const reservation = await Reserva.create({
      usuario: req.usuario.id,
      estado: pending._id,
      cantidadPersonas: parsed.data.personas,
      fecha: new Date(`${parsed.data.fecha}T12:00:00Z`),
      hora: parsed.data.hora,
      observaciones: parsed.data.observaciones,
      nombre: parsed.data.nombre,
      correo: parsed.data.correo,
      motivo: parsed.data.motivo,
    });
    await registrarEvento({
      entidad: 'reserva', entidadId: reservation._id, a: 'pendiente', usuario: req.usuario.id, actor: req.usuario.rol || 'cliente',
    });
    const populated = await Reserva.findById(reservation._id)
      .populate('usuario', 'nombre apellido correo')
      .populate('estado', POBLAR_ESTADO)
      .lean();
    return res.status(201).json({ reservation: serializeReservation(populated) });
  } catch (error) {
    return next(error);
  }
});

router.patch('/reservations/:id', async (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ message: 'No se encontró la reserva.' });
  }
  const parsed = reservationSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Revisa los datos de la reserva.', errors: parsed.error.flatten() });
  }
  const dateError = validateReservationDate(parsed.data);
  if (dateError) return res.status(400).json({ message: dateError });

  try {
    const reservation = await Reserva.findOne({ _id: req.params.id, usuario: req.usuario.id })
      .populate('estado', 'codigo');
    if (!reservation || !RESERVA_EDITABLE.includes(reservation.estado?.codigo)) {
      return res.status(404).json({ message: 'No se encontró una reserva activa que puedas editar.' });
    }

    const cambios = {
      cantidadPersonas: parsed.data.personas,
      fecha: new Date(`${parsed.data.fecha}T12:00:00Z`),
      hora: parsed.data.hora,
      observaciones: parsed.data.observaciones,
      nombre: parsed.data.nombre,
      correo: parsed.data.correo,
      motivo: parsed.data.motivo,
    };
    if (reservation.estado.codigo === 'confirmada') {
      // Una reserva confirmada vuelve a pendiente de aprobación (queda en Evento)
      await cambiarEstado({
        tipo: 'reserva',
        Modelo: Reserva,
        documento: reservation,
        a: 'pendiente',
        actor: 'cliente',
        sesion: req.usuario,
        cambios,
        filtro: { usuario: req.usuario.id },
      });
    } else {
      reservation.set(cambios);
      await reservation.save();
    }
    const updated = await Reserva.findById(reservation._id)
      .populate('usuario', 'nombre apellido correo')
      .populate('estado', POBLAR_ESTADO)
      .lean();

    return res.json({ reservation: serializeReservation(updated) });
  } catch (error) {
    return next(error);
  }
});

router.patch('/reservations/:id/cancel', async (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ message: 'No se encontró la reserva.' });
  }
  try {
    const reservation = await Reserva.findOne({ _id: req.params.id, usuario: req.usuario.id })
      .populate('estado', 'codigo');
    if (!reservation) return res.status(404).json({ message: 'No se encontró la reserva.' });
    if (reservation.estado?.codigo === 'cancelada') {
      return res.status(409).json({ message: 'Esta reserva ya fue cancelada.' });
    }

    const date = new Date(reservation.fecha).toISOString().slice(0, 10);
    if (reservationDateTime(date, reservation.hora) <= new Date()) {
      return res.status(409).json({ message: 'No es posible cancelar una reserva que ya inició.' });
    }

    await cambiarEstado({
      tipo: 'reserva',
      Modelo: Reserva,
      documento: reservation,
      a: 'cancelada',
      actor: 'cliente',
      sesion: req.usuario,
      filtro: { usuario: req.usuario.id },
    });
    const updated = await Reserva.findById(reservation._id)
      .populate('usuario', 'nombre apellido correo')
      .populate('estado', POBLAR_ESTADO)
      .lean();
    return res.json({ reservation: serializeReservation(updated) });
  } catch (error) {
    return next(error);
  }
});

router.get(['/reviews', '/comentarios'], listarMisComentarios);
router.post(['/reviews', '/comentarios'], crearComentario);

export default router;
