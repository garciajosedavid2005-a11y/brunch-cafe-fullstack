import { Router } from 'express'
import { register, login, logout } from '../controllers/auth.controller.js'
import { validateSchema } from '../middlewares/validator.middleware.js'
import { registroSchema, loginSchema } from '../schema/auth.schema.js'
import { validateToken } from '../middlewares/validateToken.js'
import { crearLimiteLogin, crearLimiteRegistro } from '../middlewares/rateLimit.js'
import Usuario from '../models/usuario.model.js'

const router = Router()

router.post('/registro', crearLimiteRegistro(), validateSchema(registroSchema), register)
router.post('/login', crearLimiteLogin(), validateSchema(loginSchema), login)
router.post('/logout', logout)
router.get('/me', validateToken, async (req, res) => {
  const usuario = await Usuario.findById(req.usuario.id)
    .select('-contraseña')
    .populate('rol')
  if (!usuario) return res.status(404).json({ message: 'Usuario no encontrado.' })

  return res.json({
    user: {
      id: usuario.id,
      nombre: usuario.nombre,
      apellido: usuario.apellido,
      email: usuario.correo,
      telefono: usuario.telefono,
      role: usuario.rol?.nombre,
      permisos: req.usuario.permisos,
    },
  })
})

export default router
