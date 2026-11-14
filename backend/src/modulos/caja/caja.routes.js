import { Router } from 'express'
import { requirePermission } from '../identidad/requirePermission.js'
import { idempotencia } from '../compartido/idempotencia.js'
import { cobrarCuenta } from '../salon/cuentas.service.js'
import { avisarSalon } from '../salon/salonStaff.routes.js'
import { listarPorCobrar, listarDeHoy, obtenerComprobante } from './caja.service.js'

// Fase 3 · /api/v1/staff/caja (ya autenticado): cuentas por cobrar, cobro y comprobantes, con
// cuenta:cobrar en la ruta y otra vez en el servicio. Cobrar admite Idempotency-Key (reintento seguro).
const router = Router()
router.use(requirePermission('cuenta:cobrar'))

router.get('/cuentas', async (req, res) => {
    res.json(await listarPorCobrar(req.usuario))
})

router.post('/cuentas/:id/cobrar', idempotencia, async (req, res) => {
    const resultado = await cobrarCuenta(req.params.id, req.body, req.usuario)
    res.status(201).json(resultado)
    avisarSalon(resultado.cuenta) // ya confirmada: plano, caja, la cuenta, su mesero y sus estaciones
})

router.get('/comprobantes', async (req, res) => {
    res.json(await listarDeHoy(req.usuario))
})

router.get('/comprobantes/:id', async (req, res) => {
    res.json(await obtenerComprobante(req.params.id, req.usuario))
})

export default router
