import { Router } from 'express'
import { validateToken } from '../identidad/validateToken.js'
import { requirePermission } from '../identidad/requirePermission.js'
import { reporteVentas, reporteOperacion } from './reportes.service.js'

// Fase 5 · /api/v1/admin/reportes?desde=AAAA-MM-DD&hasta=AAAA-MM-DD (fechas de Bogotá, ambas incluidas).
// Solo con reporte:ver (F5-9); el servicio lo vuelve a exigir. Solo lectura.
const router = Router()
router.use(validateToken, requirePermission('reporte:ver'))
router.get('/ventas', async (req, res) => res.json(await reporteVentas(req.usuario, req.query)))
router.get('/operacion', async (req, res) => res.json(await reporteOperacion(req.usuario, req.query)))

export default router
