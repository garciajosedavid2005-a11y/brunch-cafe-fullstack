import { Router } from 'express'
import { requirePermission } from '../identidad/requirePermission.js'
import { idempotencia } from '../compartido/idempotencia.js'
import * as cuentas from './cuentas.service.js'
import * as lecturas from './salonStaff.service.js'

// 1.5 · /api/v1/staff/salon (PLAN_FASE_1 §1.5). La sesión la exige staff.routes.js (validateToken).
// Permiso en la ruta y otra vez en el servicio (defensa en profundidad). F1-17: cualquiera con el
// permiso opera cualquier cuenta. Los cuerpos los valida el servicio con esquemas estrictos (Zod):
// precios, estados o el mesero nunca se toman del cliente salvo donde el esquema lo declara.
// Idempotency-Key (opcional, 0.9) en abrir cuenta, agregar ítem y enviar ronda.
const router = Router()

// Express 5 pasa al manejador de errores lo que lance la promesa
const responder = (status, operacion) => async (req, res) => {
    res.status(status).json(await operacion(req))
}
const ok = (operacion) => responder(200, operacion)

// Lecturas
router.get('/mesas', requirePermission('mesa:ver'), ok((req) => lecturas.obtenerPlano({ zona: req.query.zona }, req.usuario)))
router.get('/catalogo', requirePermission('comanda:tomar'), ok((req) => lecturas.catalogoSalon(req.usuario)))
router.get('/meseros', requirePermission('cuenta:transferir', 'cuenta:abrir'), ok((req) => lecturas.listarMeseros(req.usuario)))
router.get('/cuentas/:id', requirePermission('cuenta:ver'), ok((req) => lecturas.detalleCuenta(req.params.id, req.usuario)))

// Mesas
router.post('/mesas/unir', requirePermission('mesa:unir'), ok((req) => cuentas.unirMesas(req.body, req.usuario)))
router.post('/mesas/:id/abrir', requirePermission('cuenta:abrir'), idempotencia,
    responder(201, (req) => cuentas.abrirCuenta({ ...req.body, mesaId: req.params.id }, req.usuario)))
router.post('/mesas/:id/mover', requirePermission('mesa:operar'), ok((req) => cuentas.moverCuenta(req.params.id, req.body, req.usuario)))
router.post('/mesas/:id/separar', requirePermission('mesa:unir'), ok((req) => cuentas.separarMesa(req.params.id, req.body, req.usuario)))
// Cada transición exige el suyo: por_limpiar → libre (mesa:operar), libre ↔ bloqueada (mesa:bloquear)
router.post('/mesas/:id/estado', requirePermission('mesa:operar', 'mesa:bloquear'),
    ok((req) => cuentas.cambiarEstadoMesa(req.params.id, req.body, req.usuario)))

// Ítems de la ronda en borrador y anulación de enviados
router.post('/cuentas/:id/items', requirePermission('comanda:tomar'), idempotencia,
    responder(201, (req) => cuentas.agregarItem(req.params.id, req.body, req.usuario)))
router.patch('/cuentas/:id/items/:itemId', requirePermission('comanda:tomar'),
    ok((req) => cuentas.modificarItem(req.params.id, req.params.itemId, req.body, req.usuario)))
router.delete('/cuentas/:id/items/:itemId', requirePermission('comanda:tomar'),
    ok((req) => cuentas.quitarItem(req.params.id, req.params.itemId, req.body, req.usuario)))
router.post('/cuentas/:id/items/:itemId/anular', requirePermission('item:anular'),
    ok((req) => cuentas.anularItem(req.params.id, req.params.itemId, req.body, req.usuario)))

// Rondas y cuenta
router.post('/cuentas/:id/rondas/:n/enviar', requirePermission('comanda:enviar'), idempotencia,
    ok((req) => cuentas.enviarRonda(req.params.id, { ...req.body, numeroRonda: Number(req.params.n) }, req.usuario)))
router.post('/cuentas/:id/solicitar', requirePermission('cuenta:solicitar'), ok((req) => cuentas.solicitarCuenta(req.params.id, req.body, req.usuario)))
router.post('/cuentas/:id/cancelar', requirePermission('cuenta:abrir'), ok((req) => cuentas.cancelarCuenta(req.params.id, req.body, req.usuario)))
router.post('/cuentas/:id/transferir', requirePermission('cuenta:transferir'), ok((req) => cuentas.transferirCuenta(req.params.id, req.body, req.usuario)))
router.post('/cuentas/:id/cerrar-sin-cobro', requirePermission('cuenta:cerrar_sin_cobro'),
    ok((req) => cuentas.cerrarSinCobro(req.params.id, req.body, req.usuario)))

export default router
