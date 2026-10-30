import { Router } from 'express';
import Review from '../models/Review.js';

const router = Router();

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
