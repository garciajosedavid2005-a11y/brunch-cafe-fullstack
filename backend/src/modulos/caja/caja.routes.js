import { Router } from 'express'
import { requirePermission } from '../identidad/requirePermission.js'
import { idempotencia } from '../compartido/idempotencia.js'
import { cobrarCuenta } from '../salon/cuentas.service.js'
import { avisarSalon } from '../salon/salonStaff.routes.js'
import { listarPorCobrar, listarDeHoy, obtenerComprobante } from './caja.service.js'
import { turnoActual, historialTurnos, abrirTurno, cerrarTurno } from './turno.service.js'
import { publicar } from '../tiempoReal/bus.js'

// Fase 3 · /api/v1/staff/caja (ya autenticado): cuentas por cobrar, cobro y comprobantes, con
// cuenta:cobrar en la ruta y otra vez en el servicio. Cobrar admite Idempotency-Key (reintento seguro).
const router = Router()

// 3b.1 · Turno de caja (antes del permiso general de cobro: abrir y cerrar tienen los suyos). El servicio
// vuelve a comprobar el permiso. Abrir y cerrar avisan en vivo por el canal «caja».
const avisarTurno = (resultado) => publicar(['caja'], { tipo: 'turno', ids: { turnoId: resultado.turno?.id } })
router.get('/turno', requirePermission('cuenta:cobrar', 'caja:abrir', 'caja:cerrar'), async (req, res) => {
    res.json(await turnoActual(req.usuario))
})
router.get('/turnos', requirePermission('caja:cerrar'), async (req, res) => {
    res.json(await historialTurnos(req.usuario))
})
// Idempotency-Key opcional: un reintento tras perder la respuesta recibe el mismo resultado (no un 409)
router.post('/turno/abrir', requirePermission('caja:abrir'), idempotencia, async (req, res) => {
    const resultado = await abrirTurno(req.body, req.usuario)
    res.status(201).json(resultado)
    avisarTurno(resultado)
})
router.post('/turno/cerrar', requirePermission('caja:cerrar'), idempotencia, async (req, res) => {
    const resultado = await cerrarTurno(req.body, req.usuario)
    res.json(resultado)
    avisarTurno(resultado)
})

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
