import { Router } from 'express'
import { requirePermission } from '../identidad/requirePermission.js'
import { buscarClientes } from '../identidad/clienteStaff.js'
import { crearLimiteBusquedaClientes } from '../identidad/rateLimit.js'
import { logger } from '../compartido/logger.js'
import { validar, buscarClienteSchema } from './cuentas.schema.js'
import { idempotencia } from '../compartido/idempotencia.js'
import * as cuentas from './cuentas.service.js'
import * as lecturas from './salonStaff.service.js'
import { publicar } from '../tiempoReal/bus.js'
import mongoose from 'mongoose'
import Cuenta from './cuenta.model.js'

// 1.5 · /api/v1/staff/salon (PLAN_FASE_1 §1.5). La sesión la exige staff.routes.js (validateToken).
// Permiso en la ruta y otra vez en el servicio (defensa en profundidad). F1-17: cualquiera con el
// permiso opera cualquier cuenta. Los cuerpos los valida el servicio con esquemas estrictos (Zod):
// precios, estados o el mesero nunca se toman del cliente salvo donde el esquema lo declara.
// Idempotency-Key (opcional, 0.9) en abrir cuenta, agregar ítem y enviar ronda.
const router = Router()
const limiteBusquedaClientes = crearLimiteBusquedaClientes() // 6.5

// Express 5 pasa al manejador de errores lo que lance la promesa
const responder = (status, operacion) => async (req, res) => {
    res.status(status).json(await operacion(req))
}
const ok = (operacion) => responder(200, operacion)

// 2.4 · Avisos en tiempo real tras una operación que cambió datos (el servicio ya confirmó la
// transacción): el plano, la cuenta y las estaciones de sus ítems enviados releen. Solo ids.
// 2.6 · También el mesero de la cuenta (su aviso «Listo para servir» cambia al anular, cancelar, cerrar o
// transferir) y, en la transferencia, el anterior (`extra`).
// Fase 3 · También la caja (sus cuentas por cobrar cambian al pedir, reabrir, cerrar o cobrar la cuenta)
// 6.3 · Y la lista «Para llevar» (canal `para_llevar`)
export const avisarSalon = (resultado, extra = []) => {
    const cuentaId = resultado?.id && Array.isArray(resultado?.rondas) ? String(resultado.id) : null
    const estaciones = (resultado?.rondas || []).filter((r) => r.estado === 'enviada')
        .flatMap((r) => r.items || []).map((i) => i.estacion?.codigo).filter(Boolean)
    const mesero = cuentaId && resultado.mesero ? `mesero:${resultado.mesero}` : null
    publicar(['plano', 'caja', 'para_llevar', cuentaId && `cuenta:${cuentaId}`, mesero, ...extra, ...estaciones.map((c) => `estacion:${c}`)],
        { tipo: 'salon_cambio', ids: cuentaId ? { cuentaId } : {} })
}
const cambio = (status, operacion, canalesPrevios) => async (req, res) => {
    const extra = canalesPrevios ? await canalesPrevios(req) : []
    const resultado = await operacion(req)
    res.status(status).json(resultado)
    avisarSalon(resultado, extra)
}
// Mesero antes de transferir: solo un aviso (si la lectura queda vieja, el polling de respaldo lo corrige)
const meseroAnterior = async (req) => {
    if (!mongoose.isValidObjectId(req.params.id)) return []
    const cuenta = await Cuenta.findById(req.params.id).select('mesero').lean()
    return cuenta?.mesero ? [`mesero:${cuenta.mesero}`] : []
}

// Lecturas
router.get('/mesas', requirePermission('mesa:ver'), ok((req) => lecturas.obtenerPlano({ zona: req.query.zona }, req.usuario)))
router.get('/catalogo', requirePermission('comanda:tomar', 'cuenta:para_llevar'), ok((req) => lecturas.catalogoSalon(req.usuario)))
router.get('/meseros', requirePermission('cuenta:transferir', 'cuenta:abrir'), ok((req) => lecturas.listarMeseros(req.usuario)))
router.get('/cuentas/:id', requirePermission('cuenta:ver', 'cuenta:para_llevar'), ok((req) => lecturas.detalleCuenta(req.params.id, req.usuario)))

// 6.3 (F6-3) · Para llevar: la lista y abrir una (el servicio pide el nombre o el teléfono). En las rutas de ítems,
// rondas, pedir la cuenta y cancelar, `cuenta:para_llevar` también entra: el servicio solo lo acepta en una para llevar
router.get('/para-llevar', requirePermission('cuenta:para_llevar', 'cuenta:ver'), ok((req) => lecturas.listarParaLlevar(req.usuario)))
router.post('/para-llevar', requirePermission('cuenta:para_llevar'), idempotencia, cambio(201, (req) => cuentas.abrirParaLlevar(req.body, req.usuario)))

// Mesas
router.post('/mesas/unir', requirePermission('mesa:unir'), cambio(200, (req) => cuentas.unirMesas(req.body, req.usuario)))
router.post('/mesas/:id/abrir', requirePermission('cuenta:abrir'), idempotencia,
    cambio(201, (req) => cuentas.abrirCuenta({ ...req.body, mesaId: req.params.id }, req.usuario)))
router.post('/mesas/:id/mover', requirePermission('mesa:operar'), cambio(200, (req) => cuentas.moverCuenta(req.params.id, req.body, req.usuario)))
router.post('/mesas/:id/separar', requirePermission('mesa:unir'), cambio(200, (req) => cuentas.separarMesa(req.params.id, req.body, req.usuario)))
// Cada transición exige el suyo: por_limpiar → libre (mesa:operar), libre ↔ bloqueada (mesa:bloquear)
router.post('/mesas/:id/estado', requirePermission('mesa:operar', 'mesa:bloquear'),
    cambio(200, (req) => cuentas.cambiarEstadoMesa(req.params.id, req.body, req.usuario)))

// Ítems de la ronda en borrador y anulación de enviados
router.post('/cuentas/:id/items', requirePermission('comanda:tomar', 'cuenta:para_llevar'), idempotencia,
    cambio(201, (req) => cuentas.agregarItem(req.params.id, req.body, req.usuario)))
router.patch('/cuentas/:id/items/:itemId', requirePermission('comanda:tomar', 'cuenta:para_llevar'),
    cambio(200, (req) => cuentas.modificarItem(req.params.id, req.params.itemId, req.body, req.usuario)))
router.delete('/cuentas/:id/items/:itemId', requirePermission('comanda:tomar', 'cuenta:para_llevar'),
    cambio(200, (req) => cuentas.quitarItem(req.params.id, req.params.itemId, req.body, req.usuario)))
router.post('/cuentas/:id/items/:itemId/anular', requirePermission('item:anular'),
    cambio(200, (req) => cuentas.anularItem(req.params.id, req.params.itemId, req.body, req.usuario)))

// Rondas y cuenta
router.post('/cuentas/:id/rondas/:n/enviar', requirePermission('comanda:enviar', 'cuenta:para_llevar'), idempotencia,
    cambio(200, (req) => cuentas.enviarRonda(req.params.id, { ...req.body, numeroRonda: Number(req.params.n) }, req.usuario)))
router.post('/cuentas/:id/solicitar', requirePermission('cuenta:solicitar', 'cuenta:para_llevar'), cambio(200, (req) => cuentas.solicitarCuenta(req.params.id, req.body, req.usuario)))
router.post('/cuentas/:id/cancelar', requirePermission('cuenta:abrir', 'cuenta:para_llevar'), cambio(200, (req) => cuentas.cancelarCuenta(req.params.id, req.body, req.usuario)))
// 6.5 · Identificar al cliente de la cuenta y buscarlo por correo o teléfono (cliente:identificar: mesero y cajero)
router.put('/cuentas/:id/cliente', requirePermission('cliente:identificar'), cambio(200, (req) => cuentas.identificarCliente(req.params.id, req.body, req.usuario)))
router.get('/clientes', requirePermission('cliente:identificar'), limiteBusquedaClientes, async (req, res) => {
    const resultado = await buscarClientes(validar(buscarClienteSchema, req.query).buscar)
    // Auditoría del acceso a datos personales: quién buscó y cuántos encontró (nunca el correo ni el teléfono buscados)
    logger.info({ evento: 'busqueda_cliente', usuario: req.usuario.id, encontrados: resultado.clientes.length }, 'búsqueda de cliente')
    res.set('Cache-Control', 'no-store').json(resultado)
})
router.post('/cuentas/:id/transferir', requirePermission('cuenta:transferir'), cambio(200, (req) => cuentas.transferirCuenta(req.params.id, req.body, req.usuario), meseroAnterior))
router.post('/cuentas/:id/cerrar-sin-cobro', requirePermission('cuenta:cerrar_sin_cobro'),
    cambio(200, (req) => cuentas.cerrarSinCobro(req.params.id, req.body, req.usuario)))

export default router
