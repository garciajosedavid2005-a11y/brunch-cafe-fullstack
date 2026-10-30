import { Router } from 'express';
import { register, login, logout } from '../controllers/auth.controller.js';
import { validateSchema } from '../middlewares/validator.middleware.js';
import { registroSchema, loginSchema } from '../schema/auth.schema.js';
import { validateToken } from '../middlewares/validateToken.js';
import Usuario from '../models/usuario.model.js';

const router = Router();

router.post('/registro', validateSchema(registroSchema), register);
router.post('/login', validateSchema(loginSchema), login);
router.post('/logout', logout);
router.get('/me', validateToken, async (req, res, next) => {
  try {
    const usuario = await Usuario.findById(req.usuario.id)
      .select('-contraseña')
      .populate('rol');
    if (!usuario) return res.status(404).json({ message: 'Usuario no encontrado.' });

    return res.json({
      user: {
        id: usuario.id,
        nombre: usuario.nombre,
        apellido: usuario.apellido,
        email: usuario.correo,
        telefono: usuario.telefono,
        role: usuario.rol?.nombre,
      },
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
