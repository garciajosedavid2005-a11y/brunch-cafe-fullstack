import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { config } from '../config.js';
import User from '../models/User.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();
const credentialsSchema = z.object({
  email: z.string().email().max(254).transform((value) => value.trim().toLowerCase()),
  password: z.string().min(8).max(128),
});
const registerSchema = credentialsSchema.extend({
  nombre: z.string().trim().min(1).max(60),
  apellido: z.string().trim().min(1).max(60),
  telefono: z.string().trim().min(7).max(30),
});

const cookieOptions = () => ({
  httpOnly: true,
  secure: config.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
});

const createToken = (user) =>
  jwt.sign({ role: user.role }, config.JWT_SECRET, {
    subject: user.id,
    expiresIn: config.JWT_EXPIRES_IN,
  });

const publicUser = (user) => ({
  id: user.id,
  nombre: user.nombre,
  apellido: user.apellido,
  email: user.email,
  telefono: user.telefono,
  role: user.role,
});

router.post('/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Revisa los datos del formulario.', errors: parsed.error.flatten() });
  }

  const { nombre, apellido, email, telefono, password } = parsed.data;
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return res.status(409).json({ message: 'Ya existe una cuenta con ese correo.' });
  }

  const hashedPassword = await bcrypt.hash(password, 12);
  const user = await User.create({ nombre, apellido, email, telefono, password: hashedPassword });
  res.cookie('token', createToken(user), cookieOptions());
  return res.status(201).json({ user: publicUser(user) });
});

router.post('/login', async (req, res) => {
  const parsed = credentialsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Correo o contraseña inválidos.' });
  }

  const user = await User.findOne({ email: parsed.data.email }).select('+password');
  if (!user || !(await bcrypt.compare(parsed.data.password, user.password))) {
    return res.status(401).json({ message: 'Correo o contraseña incorrectos.' });
  }

  res.cookie('token', createToken(user), cookieOptions());
  return res.json({ user: publicUser(user) });
});

router.post('/logout', (req, res) => {
  res.clearCookie('token', cookieOptions());
  return res.status(204).end();
});

router.get('/me', requireAuth, async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) {
    res.clearCookie('token', cookieOptions());
    return res.status(401).json({ message: 'La cuenta de esta sesión ya no existe.' });
  }
  return res.json({ user: publicUser(user) });
});

export default router;
