import { Router } from 'express'
import { validateToken } from '../identidad/validateToken.js'
import { requirePermission } from '../identidad/requirePermission.js'
import { validateSchema } from '../compartido/validator.middleware.js'
import { crearZonaSchema, actualizarZonaSchema, crearMesaSchema, actualizarMesaSchema } from './salonConfig.schema.js'
import * as c from './salonConfig.controller.js'

// /api/v1/admin/zonas y /api/v1/admin/mesas (1.2): todo exige sesión + salon:configurar
const protegido = () => {
    const router = Router()
    router.use(validateToken, requirePermission('salon:configurar'))
    return router
}

export const zonasRouter = protegido()
zonasRouter.get('/', c.listarZonas)
zonasRouter.post('/', validateSchema(crearZonaSchema), c.crearZona)
zonasRouter.put('/:id', validateSchema(actualizarZonaSchema), c.actualizarZona)
zonasRouter.delete('/:id', c.eliminarZona)

export const mesasRouter = protegido()
mesasRouter.get('/', c.listarMesas)
mesasRouter.post('/', validateSchema(crearMesaSchema), c.crearMesa)
mesasRouter.put('/:id', validateSchema(actualizarMesaSchema), c.actualizarMesa)
mesasRouter.delete('/:id', c.eliminarMesa)
