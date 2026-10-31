import { z } from 'zod';
import Comentario from '../models/comentario.model.js';

const comentarioSchema = z.discriminatedUnion('tipo', [
  z.object({
    tipo: z.literal('general'),
    calificacion: z.coerce.number().int().min(1).max(5),
    comentario: z.string().trim().min(10).max(300),
  }),
  z.object({
    tipo: z.literal('producto'),
    productoId: z.coerce.number().int().min(1).max(24),
    calificacion: z.coerce.number().int().min(1).max(5),
    comentario: z.string().trim().min(10).max(300),
  }),
]);

export const listarComentariosPublicos = async (req, res, next) => {
  try {
    const comentarios = await Comentario.find()
      .populate('usuario', 'nombre apellido')
      .sort({ createdAt: -1 })
      .limit(60)
      .lean();

    return res.json({
      reviews: comentarios.map((comentario) => ({
        _id: comentario._id,
        nombre:
          [comentario.usuario?.nombre, comentario.usuario?.apellido]
            .filter(Boolean)
            .join(' ') || 'Cliente',
        tipo: comentario.tipo,
        productoId: comentario.productoId,
        calificacion: comentario.calificacion,
        comentario: comentario.comentario,
        createdAt: comentario.createdAt,
      })),
    });
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
      { $match: { tipo: 'producto', productoId: { $exists: true } } },
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