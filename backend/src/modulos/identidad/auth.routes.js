import { cuerpoError } from '../compartido/errors.js'
import { Router } from 'express'
import { register, login, logout, solicitarRecuperacion, restablecerContrasena } from './auth.controller.js'
import { validateSchema } from '../compartido/validator.middleware.js'
import {
  registroSchema,
  loginSchema,
  solicitarRecuperacionSchema,
  restablecerContrasenaSchema,
} from './auth.schema.js'
import { validateToken } from './validateToken.js'
import {
  crearLimiteLogin,
  crearLimitesRecuperacion,
  crearLimiteRegistro,
  crearLimitesRestablecimiento,
} from './rateLimit.js'
import Usuario from './usuario.model.js'
import { ROL_CLIENTE } from './permisos.js'

const router = Router()

router.post('/registro', crearLimiteRegistro(), validateSchema(registroSchema), register)
router.post('/login', crearLimiteLogin(), validateSchema(loginSchema), login)
router.post('/recuperar-contrasena', ...crearLimitesRecuperacion(), validateSchema(solicitarRecuperacionSchema), solicitarRecuperacion)
router.post('/restablecer-contrasena', ...crearLimitesRestablecimiento(), validateSchema(restablecerContrasenaSchema), restablecerContrasena)
router.post('/logout', logout)
router.get('/me', validateToken, async (req, res) => {
  const usuario = await Usuario.findById(req.usuario.id)
    .select('-contraseña')
    .populate('rol')
  if (!usuario) return res.status(404).json(cuerpoError('NOT_FOUND', 'Usuario no encontrado.'))

  return res.json({
    user: {
      id: usuario.id,
      nombre: usuario.nombre,
      apellido: usuario.apellido,
      email: usuario.correo,
      telefono: usuario.telefono,
      role: usuario.rol?.nombre,
      roleLabel: usuario.rol?.etiqueta || usuario.rol?.nombre,
      permisos: req.usuario.permisos,
      esPersonal: Boolean(usuario.rol) && usuario.rol.nombre !== ROL_CLIENTE,
    },
  })
})

export default router
