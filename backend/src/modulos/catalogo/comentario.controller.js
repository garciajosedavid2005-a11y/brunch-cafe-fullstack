import { AppError, detallesZod, notFound } from '../compartido/errors.js';
import Pedido from '../pedidos/pedido.model.js';
import DetallePedido from '../pedidos/detallePedido.model.js';
import Reserva from '../salon/reserva.model.js';
import { estadoPorCodigo } from '../compartido/estados.service.js';
import { z } from 'zod';
import Comentario from './comentario.model.js';
import Producto from './producto.model.js';
import mongoose from 'mongoose';
import { referenciaProducto, resolverProductos } from './referenciaProducto.schema.js';

// 1.15 · Mensajes en español: el error de validación muestra el del primer campo
const MENSAJE_CALIFICACION = 'La calificación debe ser un número entero de 1 a 5.';
const calificacion = z.coerce.number({ error: MENSAJE_CALIFICACION }).int({ error: MENSAJE_CALIFICACION })
  .min(1, { error: MENSAJE_CALIFICACION }).max(5, { error: MENSAJE_CALIFICACION });
const comentario = z.string({ error: 'Escribe tu comentario.' }).trim()
  .min(10, { error: 'El comentario debe tener al menos 10 caracteres.' })
  .max(300, { error: 'El comentario no puede superar 300 caracteres.' });

const comentarioSchema = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('general'), calificacion, comentario }),
  z.object({ tipo: z.literal('producto'), ...referenciaProducto, calificacion, comentario }),
], { error: 'Elige si la reseña es general o de un producto.' });

const edicionSchema = z.object({ calificacion, comentario });

// Decisión 14: ¿el usuario recibió algún pedido (con ese producto, si se indica)?
const recibioPedido = async (usuarioId, productoId) => {
  const entregado = await estadoPorCodigo('pedido', 'entregado');
  const pedidos = await Pedido.find({ usuario: usuarioId, estado: entregado._id }).select('_id').lean();
  if (!pedidos.length) return false;
  if (!productoId) return true;
  return Boolean(await DetallePedido.exists({ pedido: { $in: pedidos.map(({ _id }) => _id) }, producto: productoId }));
};

const completoReserva = async (usuarioId) => {
  const completada = await estadoPorCodigo('reserva', 'completada');
  return Boolean(await Reserva.exists({ usuario: usuarioId, estado: completada._id }));
};

const resenaExistente = (id) => new AppError(409, 'RESENA_EXISTENTE',
  'Ya dejaste una reseña de este producto. Puedes editarla desde "Mis comentarios".', id ? { id: String(id) } : undefined);

export const listarComentariosPublicos = async (req, res, next) => {
  try {
    const comentarios = await Comentario.find({ visible: { $ne: false } })
      .populate('usuario', 'nombre apellido')
      .sort({ createdAt: -1 })
      .limit(60)
      .lean();
    const codigos = [...new Set(comentarios.filter((comentario) => comentario.tipo === 'producto').map((comentario) => comentario.productoId))];
    const productos = await Producto.find({ codigo: { $in: codigos } }).select('codigo nombre').lean();
    const nombrePorCodigo = new Map(productos.map((producto) => [producto.codigo, producto.nombre]));

    return res.json({
      reviews: comentarios.map((comentario) => ({
        _id: comentario._id,
        nombre:
          [comentario.usuario?.nombre, comentario.usuario?.apellido]
            .filter(Boolean)
            .join(' ') || 'Cliente',
        tipo: comentario.tipo,
        productoId: comentario.productoId,
        productoRef: comentario.producto || null,
        producto: nombrePorCodigo.get(comentario.productoId) || '',
        calificacion: comentario.calificacion,
        comentario: comentario.comentario,
        verificada: comentario.verificada === true,
        createdAt: comentario.createdAt,
      })),
    });
  } catch (error) {
    return next(error);
  }
};

export const listarComentariosAdmin = async (req, res, next) => {
  try {
    const comentarios = await Comentario.find()
      .populate('usuario', 'nombre apellido correo')
      .sort({ createdAt: -1 })
      .lean();
    const codigos = [...new Set(comentarios.filter((c) => c.tipo === 'producto').map((c) => c.productoId))];
    const productos = await Producto.find({ codigo: { $in: codigos } }).select('codigo nombre').lean();
    const nombrePorCodigo = new Map(productos.map((producto) => [producto.codigo, producto.nombre]));

    return res.json(comentarios.map((comentario) => ({
      id: comentario._id,
      autor: [comentario.usuario?.nombre, comentario.usuario?.apellido].filter(Boolean).join(' ') || 'Cliente',
      correo: comentario.usuario?.correo || '',
      tipo: comentario.tipo === 'producto' ? 'Producto' : 'General',
      producto: nombrePorCodigo.get(comentario.productoId) || '',
      calificacion: comentario.calificacion,
      comentario: comentario.comentario,
      visible: comentario.visible !== false,
      verificada: comentario.verificada === true,
      fecha: comentario.createdAt,
    })));
  } catch (error) {
    return next(error);
  }
};

const COMENTARIO_NO_ENCONTRADO = 'Comentario no encontrado.';

// 1.15 · Errores con el formato estándar por el manejador central (AppError), como el pedido y las cuentas
export const cambiarVisibilidadComentario = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw notFound(COMENTARIO_NO_ENCONTRADO);
  const comentario = await Comentario.findByIdAndUpdate(
    req.params.id,
    { visible: req.validado.visible },
    { returnDocument: 'after', runValidators: true }
  );
  if (!comentario) throw notFound(COMENTARIO_NO_ENCONTRADO);
  return res.json({ id: comentario._id, visible: comentario.visible });
};

export const eliminarComentario = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw notFound(COMENTARIO_NO_ENCONTRADO);
  const comentario = await Comentario.findByIdAndDelete(req.params.id);
  if (!comentario) throw notFound(COMENTARIO_NO_ENCONTRADO);
  return res.json({ message: 'Comentario eliminado.' });
};

export const listarMisComentarios = async (req, res, next) => {
  try {
    const reviews = await Comentario.find({ usuario: req.usuario.id })
      .sort({ createdAt: -1 })
      .lean();

    return res.json({ reviews });
  } catch (error) {
    return next(error);
  }
};

export const crearComentario = async (req, res, next) => {
  const parsed = comentarioSchema.safeParse(req.body);

  if (!parsed.success) {
    const details = detallesZod(parsed.error);
    throw new AppError(400, 'VALIDATION_ERROR', details[0]?.mensaje || 'Revisa la calificación y el comentario.', details);
  }

  try {
    // productoRef solo sirve para encontrar el producto; se guardan producto (ObjectId) y productoId (código visible)
    const datos = { ...parsed.data };
    delete datos.productoRef;
    if (datos.tipo === 'producto') {
      const producto = (await resolverProductos(Producto, [parsed.data]))(parsed.data);
      if (!producto) {
        throw new AppError(404, 'PRODUCTO_NO_ENCONTRADO', 'El producto seleccionado no existe en el menú.');
      }
      datos.producto = producto._id;
      datos.productoId = producto.codigo;
      const previa = await Comentario.findOne({ usuario: req.usuario.id, tipo: 'producto', producto: producto._id }).select('_id').lean();
      if (previa) throw resenaExistente(previa._id);
      if (!(await recibioPedido(req.usuario.id, producto._id))) {
        throw new AppError(403, 'RESENA_NO_VERIFICABLE', 'Solo puedes reseñar productos de pedidos que ya recibiste.');
      }
    } else if (!(await recibioPedido(req.usuario.id)) && !(await completoReserva(req.usuario.id))) {
      throw new AppError(403, 'RESENA_NO_VERIFICABLE', 'Podrás dejar una reseña cuando recibas un pedido o completes una reserva.');
    }

    const comentario = await Comentario.create({
      ...datos,
      verificada: true,
      usuario: req.usuario.id,
    });

    return res.status(201).json({ review: comentario });
  } catch (error) {
    // Dos envíos simultáneos de la misma reseña: el índice único deja pasar solo uno
    if (error?.code === 11000) {
      const previa = await Comentario.findOne({ usuario: req.usuario.id, producto: error.keyValue?.producto }).select('_id').lean();
      return next(resenaExistente(previa?._id));
    }
    return next(error);
  }
};

// PATCH /api/v1/cliente/comentarios/:id { calificacion, comentario } (0.12): editar la propia.
// No cambia el tipo, el producto ni la verificación; la moderación (visible) se conserva.
export const editarMiComentario = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw notFound(COMENTARIO_NO_ENCONTRADO);
  const datos = edicionSchema.parse(req.body);
  const comentario = await Comentario.findOneAndUpdate(
    { _id: req.params.id, usuario: req.usuario.id },
    { $set: datos },
    { returnDocument: 'after', runValidators: true },
  ).lean();
  if (!comentario) throw notFound(COMENTARIO_NO_ENCONTRADO);
  res.json({ review: comentario });
};

export const obtenerCalificacionesProductos = async (req, res, next) => {
  try {
    const productRatings = await Comentario.aggregate([
      { $match: { tipo: 'producto', productoId: { $exists: true }, visible: { $ne: false } } },
      {
        $group: {
          _id: '$productoId',
          average: { $avg: '$calificacion' },
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          productoId: '$_id',
          average: 1,
          count: 1,
        },
      },
      { $sort: { productoId: 1 } },
    ]);
    // productoRef: ObjectId del producto (el catálogo identifica los productos por él)
    const productos = await Producto.find({ codigo: { $in: productRatings.map((r) => r.productoId) } }).select('codigo').lean();
    const idPorCodigo = new Map(productos.map((p) => [p.codigo, String(p._id)]));

    return res.json({
      productRatings: productRatings.map((r) => ({ productoRef: idPorCodigo.get(r.productoId) || null, ...r })),
    });
  } catch (error) {
    return next(error);
  }
};