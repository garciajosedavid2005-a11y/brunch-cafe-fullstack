import { Router } from 'express'
import { requirePermission } from '../identidad/requirePermission.js'
import { idempotencia } from '../compartido/idempotencia.js'
import { cambiarEstadoItem, todoListo } from './cocina.service.js'

// 2.2 · /api/v1/staff (ya autenticado): estado de un ítem (preparar o servir, según el destino; la máquina
// del ítem exige el permiso exacto) y «Todo listo» de una ronda en una estación
const router = Router()

// Idempotency-Key opcional, como en el salón: el reintento de una tablet con mala red no da 409
router.post('/items/:itemId/estado', requirePermission('item:preparar', 'item:servir'), idempotencia, async (req, res) => {
    res.json(await cambiarEstadoItem(req.params.itemId, req.body, req.usuario))
})

router.post('/cocina/rondas/:comandaId/todo-listo', requirePermission('item:preparar'), idempotencia, async (req, res) => {
    res.json(await todoListo(req.params.comandaId, req.body, req.usuario))
})

export default router
