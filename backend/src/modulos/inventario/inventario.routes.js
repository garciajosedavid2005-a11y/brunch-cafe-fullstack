import { Router } from 'express'
import { validateToken } from '../identidad/validateToken.js'
import { requirePermission } from '../identidad/requirePermission.js'
import { PERMISOS_PANTALLA_INVENTARIO } from '../identidad/permisos.js'
import { listarInsumos, crearInsumo, editarInsumo, movimientosDeInsumo } from './insumos.service.js'

// Fase 5 · /api/v1/inventario: la misma API para Admin › Inventario y la pestaña «Inventario» de /staff (F5-b).
// Cada ruta exige su permiso y el servicio lo vuelve a comprobar.
const router = Router()
router.use(validateToken, requirePermission(...PERMISOS_PANTALLA_INVENTARIO))

router.get('/insumos', async (req, res) => res.json(await listarInsumos(req.usuario)))
router.post('/insumos', requirePermission('inventario:gestionar'), async (req, res) => res.status(201).json(await crearInsumo(req.body, req.usuario)))
router.put('/insumos/:id', requirePermission('inventario:gestionar'), async (req, res) => res.json(await editarInsumo(req.params.id, req.body, req.usuario)))
router.get('/insumos/:id/movimientos', async (req, res) => res.json(await movimientosDeInsumo(req.params.id, req.usuario)))

export default router
