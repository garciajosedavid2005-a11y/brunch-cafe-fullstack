// Pedidos del cliente (0.8: movidos desde routes/customer.routes.js sin cambiar la lógica).
// Los usan /api/v1/cliente/pedidos, /api/v1/cliente/metodos-pago y los alias /api/customer/*.
import mongoose from 'mongoose';
import { z } from 'zod';
import Pedido from './pedido.model.js';
import DetallePedido from './detallePedido.model.js';
import { gruposActivosDeVarios, MAX_NOTA_ITEM, modificadoresEntradaSchema, validarModificadores } from '../catalogo/modificadores.validacion.js';
import { calcularItem } from '../salon/totales.js';
import { estacionesDe } from '../salon/cuentas.service.js';
import MetodoPago from './metodoPago.model.js';
import Producto from '../catalogo/producto.model.js';
import { STATUS_CLIENTE } from '../compartido/estados.js';
import { cambiarEstado, estadoPorCodigo, registrarEvento } from '../compartido/estados.service.js';
import { AppError, detallesZod, notFound } from '../compartido/errors.js';
import { referenciaProducto, resolverProductos } from '../catalogo/referenciaProducto.schema.js';
import { telefono, textoOpcional } from '../compartido/comunes.schema.js';
import { esDireccionValida, MENSAJE_DIRECCION, normalizarDireccion } from '../compartido/direccion.js';
import { horasDomicilio, hora12, textoAnticipacion, textoRango } from '../configuracion/horarios.reglas.js';
import { obtenerHorarios } from '../configuracion/horarios.service.js';
import { conTransaccion } from '../compartido/transacciones.js';

const orderSchema = z.object({
  items: z.array(z.object({
    ...referenciaProducto,
    cantidad: z.coerce.number().int().min(1).max(20),
    // 1.12 · Opciones del plato y nota por línea (como en la comanda del salón)
    modificadores: modificadoresEntradaSchema,
    nota: textoOpcional('La nota', MAX_NOTA_ITEM).default(''),
  })).min(1).max(50),
  nombre: z.string().trim().min(3).max(50),
  // Obligatorio para el domicilio (el formulario lo prellena con el del perfil)
  telefono: telefono(),
  // 1.11 · Validación flexible, la misma del frontend (compartido/direccion.js)
  direccion: z.string().max(200).transform(normalizarDireccion).refine(esDireccionValida, MENSAJE_DIRECCION),
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
  // 1.12 · Las líneas anteriores no tienen opciones, nota ni precioUnitario: se ven como antes
  items: details.map((detail) => ({
    productId: detail.productoId,
    name: detail.nombreProducto,
    quantity: detail.cantidad,
    unitPrice: detail.precioUnitario ?? detail.precioProducto,
    options: (detail.modificadores || []).map((m) => ({ group: m.grupoNombre, option: m.opcionNombre, extraPrice: m.precioExtra })),
    note: detail.nota || '',
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

// Índices de las líneas del pedido que cumplen `condicion` (para que el carrito las marque)
const lineasDonde = (items, condicion) => items.flatMap((item, i) => (condicion(item) ? [i] : []));

// 1.14 · Mismo formato de errores que las cuentas: AppError por el manejador central, validación como
// VALIDATION_ERROR con [{ campo, mensaje }] y `details.lineas` en los errores de una línea del carrito
export const crearPedido = async (req, res) => {
  const parsed = orderSchema.safeParse(req.body);
  if (!parsed.success) {
    const details = detallesZod(parsed.error);
    throw new AppError(400, 'VALIDATION_ERROR', details[0]?.mensaje || 'Revisa los productos y datos de entrega.', details);
  }

  const horarios = await obtenerHorarios();
  const disponibles = horasDomicilio(horarios);
  if (!disponibles.includes(parsed.data.hora)) {
    throw new AppError(400, 'HORA_NO_DISPONIBLE', mensajeHoraDomicilio(horarios, disponibles), { horasDisponibles: disponibles });
  }

  const productoDe = await resolverProductos(Producto, parsed.data.items);
  const products = parsed.data.items.map(productoDe).filter(Boolean);
  const inexistentes = lineasDonde(parsed.data.items, (item) => !productoDe(item));
  if (inexistentes.length) {
    throw new AppError(404, 'PRODUCTO_NO_ENCONTRADO', 'Uno o más productos ya no están en el menú. Quítalos del carrito para continuar.', { lineas: inexistentes });
  }
  // Agotados: existen pero no se pueden pedir (el carrito pudo llenarse antes de que se agotaran)
  const agotados = products.filter((product) => product.disponible === false);
  if (agotados.length) {
    // Uno por producto aunque vaya en varias líneas (por _id: `codigo` no es obligatorio)
    const unicos = [...new Map(agotados.map((product) => [String(product._id), product])).values()];
    const nombres = unicos.map((product) => product.nombre).join(', ');
    throw new AppError(
      409, 'PRODUCT_UNAVAILABLE',
      `${unicos.length === 1 ? 'Este producto está agotado' : 'Estos productos están agotados'}: ${nombres}. ${unicos.length === 1 ? 'Quítalo' : 'Quítalos'} del carrito para continuar.`,
      {
        productos: unicos.map((product) => product.codigo ?? null),
        lineas: lineasDonde(parsed.data.items, (item) => productoDe(item).disponible === false),
      },
    );
  }

  // 1.12 · Opciones validadas con el MISMO validador que las cuentas (obligatorio, mín./máx., opción
  // disponible, grupo activo y del producto). Precio y subtotal salen del catálogo, nunca del cliente.
  const gruposDe = await gruposActivosDeVarios(products);
  // 2.3 · Copia de la estación de cada plato (el KDS la usa; un cambio del catálogo no mueve el pedido)
  const estacionDe = await estacionesDe(products);
  const lines = parsed.data.items.map((item, linea) => {
    const product = productoDe(item);
    let modificadores;
    try {
      modificadores = validarModificadores(gruposDe(product), item.modificadores);
    } catch (error) {
      // Qué línea del carrito corregir (el mismo plato puede ir en varias). `linea` se mantiene por
      // compatibilidad con 1.12; `lineas` es la forma común de todos los errores de línea (1.14)
      if (error.details && typeof error.details === 'object') Object.assign(error.details, { linea, lineas: [linea], producto: product.nombre });
      throw error;
    }
    const { precioUnitario, subtotal } = calcularItem({ precioBase: product.precio, modificadores, cantidad: item.cantidad });
    return {
      productId: product.codigo,
      productRef: product._id,
      name: product.nombre,
      basePrice: product.precio,
      unitPrice: precioUnitario,
      quantity: item.cantidad,
      subtotal,
      modificadores,
      nota: item.nota,
      estacion: estacionDe.get(String(product._id)) || null,
    };
  });

  const [pending, paymentMethod] = await Promise.all([
    estadoPorCodigo('pedido', 'pendiente'),
    MetodoPago.findOne({ _id: parsed.data.metodoPagoId, activo: { $ne: false } }),
  ]);
  if (!paymentMethod) throw new AppError(400, 'METODO_PAGO_NO_DISPONIBLE', 'El método de pago ya no está disponible. Actualiza la página y elige otro.');

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
      precioProducto: line.basePrice,
      precioUnitario: line.unitPrice,
      modificadores: line.modificadores,
      nota: line.nota,
      estacion: line.estacion,
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
};

const PEDIDO_NO_ENCONTRADO = 'No se encontró el pedido.';

export const verMiPedido = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw notFound(PEDIDO_NO_ENCONTRADO);
  const order = await Pedido.findOne({ _id: req.params.id, usuario: req.usuario.id })
    .populate('estado', POBLAR_ESTADO)
    .populate('metodoPago', 'nombre')
    .lean();
  if (!order) throw notFound(PEDIDO_NO_ENCONTRADO);
  const details = await DetallePedido.find({ pedido: order._id }).lean();
  return res.json({ order: serializeOrder(order, details) });
};

// El cliente solo puede cancelar su pedido mientras está pendiente
// Requiere validateSchema(cancelacionClienteSchema) en la ruta
export const cancelarMiPedido = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw notFound(PEDIDO_NO_ENCONTRADO);
  const order = await Pedido.findOne({ _id: req.params.id, usuario: req.usuario.id }).populate('estado', 'codigo');
  if (!order) throw notFound(PEDIDO_NO_ENCONTRADO);

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
