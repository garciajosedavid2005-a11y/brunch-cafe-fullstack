import { Router } from 'express';
import Review from '../models/Review.js';

const router = Router();

router.get('/', async (req, res) => {
  const reviews = await Review.find()
    .populate('user', 'nombre apellido')
    .sort({ createdAt: -1 })
    .limit(60)
    .lean();

  return res.json({
    reviews: reviews.map((review) => ({
      _id: review._id,
      nombre: [review.user?.nombre, review.user?.apellido].filter(Boolean).join(' ') || 'Cliente',
      tipo: review.tipo,
      productoId: review.productoId,
      calificacion: review.calificacion,
      comentario: review.comentario,
      createdAt: review.createdAt,
    })),
  });
});

router.get('/product-ratings', async (req, res) => {
  const productRatings = await Review.aggregate([
    { $match: { tipo: 'producto', productoId: { $exists: true } } },
    {
      $group: {
        _id: '$productoId',
        average: { $avg: '$calificacion' },
        count: { $sum: 1 },
      },
    },
    { $project: { _id: 0, productoId: '$_id', average: 1, count: 1 } },
    { $sort: { productoId: 1 } },
  ]);
  return res.json({ productRatings });
});

export default router;
