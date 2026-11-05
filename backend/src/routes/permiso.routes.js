import { Router } from 'express'
import { listarPermisos } from '../controllers/rol.controller.js'
import { autenticar } from '../middlewares/validateToken.js'
import { requirePermission } from '../middlewares/requirePermission.js'

const router = Router()

router.get('/', autenticar, requirePermission('rol:gestionar'), listarPermisos)

export default router
