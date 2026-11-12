import { Router } from 'express'
import { requirePermission } from '../identidad/requirePermission.js'
import { listarCuentasAbiertas } from './salonStaff.service.js'

// 1.9 · GET /api/v1/staff/cuentas-abiertas (F1-11): salón (cuenta:ver) y domicilio (pedido:ver), solo
// lectura. Basta con uno de los dos permisos para entrar; el servicio devuelve solo la parte de cada uno.
const router = Router()

router.get('/', requirePermission('cuenta:ver', 'pedido:ver'), async (req, res) => {
    res.json(await listarCuentasAbiertas(req.usuario))
})

export default router
