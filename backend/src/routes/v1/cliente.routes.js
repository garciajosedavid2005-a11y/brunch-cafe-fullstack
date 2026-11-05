import { Router } from 'express'
import { validateToken } from '../../middlewares/validateToken.js'
import { verMiPerfil, editarMiPerfil, cambiarMiContrasena } from '../../modulos/identidad/perfil.controller.js'
import * as reservas from '../../modulos/salon/reservas.controller.js'

// /api/v1/cliente: lo que hace el usuario de la sesión sobre sus propios datos
const router = Router()
router.use(validateToken)

router.get('/perfil', verMiPerfil)
router.patch('/perfil', editarMiPerfil)
router.put('/perfil/contrasena', cambiarMiContrasena)

router.get('/reservas', reservas.listar)
router.post('/reservas', reservas.crear)
router.patch('/reservas/:id', reservas.editar)
router.patch('/reservas/:id/cancelar', reservas.cancelar)

export default router
