import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth.js';
import User from '../models/User.js';
import Order from '../models/Order.js';
import Reservation from '../models/Reservation.js';
import Review from '../models/Review.js';

const router = Router();
router.use(requireAuth);

const profileSchema = z.object({
  nombre: z.string().trim().min(1).max(60),
  apellido: z.string().trim().min(1).max(60),
  email: z.string().email().max(254).transform((value) => value.trim().toLowerCase()),
  telefono: z.string().trim().min(7).max(30),
});

const reservationSchema = z.object({
  nombre: z.string().trim().min(3).max(120),
  correo: z.string().email().max(254).transform((value) => value.trim().toLowerCase()),
  motivo: z.string().trim().min(3).max(120),
  personas: z.coerce.number().int().min(1).max(20),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }),
  hora: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  observaciones: z.string().trim().max(200).default(''),
});

const reviewSchema = z.discriminatedUnion('tipo', [
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

const availableReservationTimes = (date) => {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  const lastHour = day === 0 || day === 6 ? 11 : 12;
  return Array.from({ length: lastHour - 7 }, (_, index) =>
    `${String(index + 8).padStart(2, '0')}:00`
  );
};

const reservationDateTime = (date, time) => new Date(`${date}T${time}:00-05:00`);

router.get('/profile', async (req, res) => {
  const user = await User.findById(req.user.id).select('nombre apellido email telefono');
  if (!user) return res.status(404).json({ message: 'No se encontró el perfil.' });
  return res.json({ profile: user });
});

router.patch('/profile', async (req, res) => {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Revisa los datos del perfil.', errors: parsed.error.flatten() });
  }

  const duplicate = await User.findOne({
    email: parsed.data.email,
    _id: { $ne: req.user.id },
  });
  if (duplicate) return res.status(409).json({ message: 'Ese correo ya está asociado a otra cuenta.' });

  const profile = await User.findByIdAndUpdate(req.user.id, parsed.data, {
    new: true,
    runValidators: true,
    select: 'nombre apellido email telefono',
  });
  if (!profile) return res.status(404).json({ message: 'No se encontró el perfil.' });
  return res.json({ profile });
});

router.get('/orders', async (req, res) => {
  const orders = await Order.find({ user: req.user.id }).sort({ createdAt: -1 }).lean();
  return res.json({ orders });
});

router.get('/orders/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ message: 'No se encontró el pedido.' });
  }
  const order = await Order.findOne({ _id: req.params.id, user: req.user.id }).lean();
  if (!order) return res.status(404).json({ message: 'No se encontró el pedido.' });
  return res.json({ order });
});

router.get('/reservations', async (req, res) => {
  const reservations = await Reservation.find({ user: req.user.id })
    .populate('user', 'nombre apellido email')
    .sort({ fecha: -1, hora: -1 })
    .lean();
  return res.json({ reservations });
});

router.post('/reservations', async (req, res) => {
  const parsed = reservationSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Revisa los datos de la reserva.', errors: parsed.error.flatten() });
  }

  const startsAt = reservationDateTime(parsed.data.fecha, parsed.data.hora);
  if (Number.isNaN(startsAt.getTime()) || startsAt <= new Date()) {
    return res.status(400).json({ message: 'La fecha y hora de la reserva deben ser futuras.' });
  }
  if (!availableReservationTimes(parsed.data.fecha).includes(parsed.data.hora)) {
    return res.status(400).json({ message: 'La hora debe respetar el horario del café: lunes a viernes de 8:00 a 12:00 y fines de semana de 8:00 a 11:00.' });
  }

  const reservation = await Reservation.create({
    ...parsed.data,
    fecha: new Date(`${parsed.data.fecha}T12:00:00Z`),
    user: req.user.id,
  });
  const populatedReservation = await Reservation.findById(reservation.id)
    .populate('user', 'nombre apellido email')
    .lean();
  return res.status(201).json({ reservation: populatedReservation });
});

router.patch('/reservations/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ message: 'No se encontró la reserva.' });
  }
  const parsed = reservationSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Revisa los datos de la reserva.', errors: parsed.error.flatten() });
  }

  const startsAt = reservationDateTime(parsed.data.fecha, parsed.data.hora);
  if (Number.isNaN(startsAt.getTime()) || startsAt <= new Date()) {
    return res.status(400).json({ message: 'La fecha y hora de la reserva deben ser futuras.' });
  }
  if (!availableReservationTimes(parsed.data.fecha).includes(parsed.data.hora)) {
    return res.status(400).json({ message: 'La hora debe respetar el horario del café: lunes a viernes de 8:00 a 12:00 y fines de semana de 8:00 a 11:00.' });
  }

  const reservation = await Reservation.findOneAndUpdate(
    { _id: req.params.id, user: req.user.id, status: { $ne: 'cancelled' } },
    { $set: { ...parsed.data, fecha: new Date(`${parsed.data.fecha}T12:00:00Z`), status: 'pending' } },
    { new: true, runValidators: true }
  )
    .populate('user', 'nombre apellido email')
    .lean();
  if (!reservation) {
    return res.status(404).json({ message: 'No se encontró una reserva activa que puedas editar.' });
  }
  return res.json({ reservation });
});

router.patch('/reservations/:id/cancel', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ message: 'No se encontró la reserva.' });
  }
  const reservation = await Reservation.findOne({ _id: req.params.id, user: req.user.id });
  if (!reservation) return res.status(404).json({ message: 'No se encontró la reserva.' });
  if (reservation.status === 'cancelled') {
    return res.status(409).json({ message: 'Esta reserva ya fue cancelada.' });
  }

  const startsAt = reservationDateTime(reservation.fecha.toISOString().slice(0, 10), reservation.hora);
  if (startsAt <= new Date()) {
    return res.status(409).json({ message: 'No es posible cancelar una reserva que ya inició.' });
  }

  const cancelledReservation = await Reservation.findOneAndUpdate(
    { _id: reservation.id, user: req.user.id, status: reservation.status },
    { $set: { status: 'cancelled' } },
    { new: true }
  )
    .populate('user', 'nombre apellido email')
    .lean();
  if (!cancelledReservation) {
    return res.status(409).json({ message: 'La reserva cambió de estado. Actualiza la lista e inténtalo de nuevo.' });
  }
  return res.json({ reservation: cancelledReservation });
});

router.get('/reviews', async (req, res) => {
  const reviews = await Review.find({ user: req.user.id }).sort({ createdAt: -1 }).lean();
  return res.json({ reviews });
});

router.post('/reviews', async (req, res) => {
  const parsed = reviewSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Revisa la calificación y el comentario.', errors: parsed.error.flatten() });
  }
  const review = await Review.create({ ...parsed.data, user: req.user.id });
  return res.status(201).json({ review });
});

export default router;
