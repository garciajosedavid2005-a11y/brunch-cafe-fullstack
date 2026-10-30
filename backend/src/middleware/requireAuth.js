import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export const requireAuth = (req, res, next) => {
  const token = req.cookies.token;
  if (!token) {
    return res.status(401).json({ message: 'Debes iniciar sesión para continuar.' });
  }

  try {
    const payload = jwt.verify(token, config.JWT_SECRET);
    req.user = { id: payload.sub, role: payload.role };
    return next();
  } catch {
    return res.status(401).json({ message: 'Tu sesión venció. Inicia sesión nuevamente.' });
  }
};
