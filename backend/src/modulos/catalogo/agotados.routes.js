import { Router } from 'express'
import { requirePermission } from '../identidad/requirePermission.js'
import { listarAgotables, cambiarDisponibilidadProducto, cambiarDisponibilidadOpcion, PERMISOS_AGOTADOS } from './agotados.service.js'

// 2.7 · /api/v1/staff/agotados (ya autenticado): agotar y reactivar desde la operación (F2-5). La ruta deja
// pasar a quien tenga cualquiera de los dos permisos; el servicio exige el exacto según `disponible`.
// Sin Idempotency-Key: repetir la misma petición no cambia nada (`cambiado: false`, sin otro Evento).
const router = Router()

router.get('/', requirePermission(...PERMISOS_AGOTADOS), async (req, res) => {
    res.json(await listarAgotables(req.usuario))
})

router.post('/productos/:id', requirePermission(...PERMISOS_AGOTADOS), async (req, res) => {
    res.json(await cambiarDisponibilidadProducto(req.params.id, req.body, req.usuario))
})

router.post('/grupos/:grupoId/opciones/:opcionId', requirePermission(...PERMISOS_AGOTADOS), async (req, res) => {
    res.json(await cambiarDisponibilidadOpcion(req.params.grupoId, req.params.opcionId, req.body, req.usuario))
})

export default router
