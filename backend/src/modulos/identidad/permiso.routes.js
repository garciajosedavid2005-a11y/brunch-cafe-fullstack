import { Router } from 'express'
import { listarPermisos } from './rol.controller.js'
import { autenticar } from './validateToken.js'
import { requirePermission } from './requirePermission.js'

const router = Router()

router.get('/', autenticar, requirePermission('rol:gestionar'), listarPermisos)

export default router
