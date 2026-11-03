import { z } from 'zod';
import Comentario from '../models/comentario.model.js';
import Producto from '../models/producto.model.js';
import mongoose from 'mongoose';

const comentarioSchema = z.discriminatedUnion('tipo', [
  z.object({
    tipo: z.literal('general'),
    calificacion: z.coerce.number().int().min(1).max(5),
    comentario: z.string().trim().min(10).max(300),
  }),
  z.object({
    tipo: z.literal('producto'),
    productoId: z.coerce.number().int().min(1),
    calificacion: z.coerce.number().int().min(1).max(5),
    comentario: z.string().trim().min(10).max(300),
  }),
]);

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
        producto: nombrePorCodigo.get(comentario.productoId) || '',
        calificacion: comentario.calificacion,
        comentario: comentario.comentario,
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
      fecha: comentario.createdAt,
    })));
  } catch (error) {
    return next(error);
  }
};

export const cambiarVisibilidadComentario = async (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ message: 'Comentario no encontrado.' });
  }
  try {
    const comentario = await Comentario.findByIdAndUpdate(
      req.params.id,
      { visible: req.body.visible },
      { new: true, runValidators: true }
    );
    if (!comentario) return res.status(404).json({ message: 'Comentario no encontrado.' });
    return res.json({ id: comentario._id, visible: comentario.visible });
  } catch (error) {
    return next(error);
  }
};

export const eliminarComentario = async (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ message: 'Comentario no encontrado.' });
  }
  try {
    const comentario = await Comentario.findByIdAndDelete(req.params.id);
    if (!comentario) return res.status(404).json({ message: 'Comentario no encontrado.' });
    return res.json({ message: 'Comentario eliminado.' });
  } catch (error) {
    return next(error);
  }
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
    return res.status(400).json({
      message: 'Revisa la calificación y el comentario.',
      errors: parsed.error.flatten(),
    });
  }

  try {
    if (parsed.data.tipo === 'producto') {
      const existe = await Producto.exists({ codigo: parsed.data.productoId });
      if (!existe) {
        return res.status(400).json({ message: 'El producto seleccionado no existe en el menú.' });
      }
    }

    const comentario = await Comentario.create({
      ...parsed.data,
      usuario: req.usuario.id,
    });

    return res.status(201).json({ review: comentario });
  } catch (error) {
    return next(error);
  }
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

    return res.json({ productRatings });
  } catch (error) {
    return next(error);
  }
};