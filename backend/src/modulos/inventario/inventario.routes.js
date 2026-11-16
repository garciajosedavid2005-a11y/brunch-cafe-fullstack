import { Router } from 'express'
import { validateToken } from '../identidad/validateToken.js'
import { requirePermission } from '../identidad/requirePermission.js'
import { PERMISOS_PANTALLA_INVENTARIO } from '../identidad/permisos.js'
import { listarInsumos, crearInsumo, editarInsumo, movimientosDeInsumo } from './insumos.service.js'
import { listarRecetas, guardarRecetaProducto, guardarRecetaOpcion } from './recetas.service.js'
import { registrarMovimientoManual } from './ajustes.service.js'
import { idempotencia } from '../compartido/idempotencia.js'
import { listarAlertas, descartarLote } from './alertas.service.js'
import { listarProveedores, crearProveedor, editarProveedor, listarOrdenes, crearOrden, cancelarOrden, recibirOrden } from './compras.service.js'

// Fase 5 · /api/v1/inventario: la misma API para Admin › Inventario y la pestaña «Inventario» de /staff (F5-b).
// Cada ruta exige su permiso y el servicio lo vuelve a comprobar.
const router = Router()
router.use(validateToken, requirePermission(...PERMISOS_PANTALLA_INVENTARIO))

router.get('/insumos', async (req, res) => res.json(await listarInsumos(req.usuario)))
router.post('/insumos', requirePermission('inventario:gestionar'), async (req, res) => res.status(201).json(await crearInsumo(req.body, req.usuario)))
router.put('/insumos/:id', requirePermission('inventario:gestionar'), async (req, res) => res.json(await editarInsumo(req.params.id, req.body, req.usuario)))
router.get('/insumos/:id/movimientos', async (req, res) => res.json(await movimientosDeInsumo(req.params.id, req.usuario)))

// 5.2 · Recetas de productos y de opciones de modificadores
router.get('/recetas', async (req, res) => res.json(await listarRecetas(req.usuario)))
router.put('/recetas/productos/:productoId', requirePermission('inventario:gestionar'), async (req, res) => {
    res.json(await guardarRecetaProducto(req.params.productoId, req.body, req.usuario))
})
router.put('/recetas/grupos/:grupoId/opciones/:opcionId', requirePermission('inventario:gestionar'), async (req, res) => {
    res.json(await guardarRecetaOpcion(req.params.grupoId, req.params.opcionId, req.body, req.usuario))
})

// 5.3 · Movimientos manuales con motivo (Idempotency-Key opcional: un reintento no ajusta dos veces)
router.post('/movimientos', requirePermission('inventario:ajustar'), idempotencia, async (req, res) => {
    res.status(201).json(await registrarMovimientoManual(req.body, req.usuario))
})

// 5.4 · Proveedores y órdenes de compra (compra:gestionar) y recepción (compra:recibir)
router.get('/proveedores', async (req, res) => res.json(await listarProveedores(req.usuario)))
router.post('/proveedores', requirePermission('compra:gestionar'), async (req, res) => res.status(201).json(await crearProveedor(req.body, req.usuario)))
router.put('/proveedores/:id', requirePermission('compra:gestionar'), async (req, res) => res.json(await editarProveedor(req.params.id, req.body, req.usuario)))
router.get('/ordenes', async (req, res) => res.json(await listarOrdenes(req.usuario)))
router.post('/ordenes', requirePermission('compra:gestionar'), idempotencia, async (req, res) => res.status(201).json(await crearOrden(req.body, req.usuario)))
router.post('/ordenes/:id/cancelar', requirePermission('compra:gestionar'), async (req, res) => res.json(await cancelarOrden(req.params.id, req.body, req.usuario)))
router.post('/ordenes/:id/recepciones', requirePermission('compra:recibir'), idempotencia, async (req, res) => {
    res.status(201).json(await recibirOrden(req.params.id, req.body, req.usuario))
})

// 5.5 · Alertas de stock bajo y vencimiento próximo; descartar lo que queda de un lote vencido
router.get('/alertas', async (req, res) => res.json(await listarAlertas(req.usuario)))
router.post('/lotes/:id/descartar', requirePermission('inventario:ajustar'), idempotencia, async (req, res) => {
    res.json(await descartarLote(req.params.id, req.body, req.usuario))
})

export default router
