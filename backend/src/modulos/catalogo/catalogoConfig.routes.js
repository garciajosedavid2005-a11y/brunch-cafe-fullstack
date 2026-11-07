import { Router } from 'express'
import { validateToken } from '../identidad/validateToken.js'
import { requirePermission } from '../identidad/requirePermission.js'
import { validateSchema } from '../compartido/validator.middleware.js'
import { crearEstacionSchema, actualizarEstacionSchema, crearGrupoSchema, actualizarGrupoSchema } from './catalogoConfig.schema.js'
import * as c from './catalogoConfig.controller.js'

// 1.3 (decisión de permisos: mixto). Estaciones: salon:configurar («zonas, mesas y estaciones»,
// 1.1). Grupos de modificadores: catalogo:gestionar (contenido del menú, como productos y categorías).
const protegido = (permiso) => {
    const router = Router()
    router.use(validateToken, requirePermission(permiso))
    return router
}

// /api/v1/admin/estaciones. Listarlas también con catalogo:gestionar: quien edita categorías y
// productos necesita elegir su estación (solo lectura); crearlas, editarlas o borrarlas, no.
export const estacionesRouter = Router()
estacionesRouter.use(validateToken)
estacionesRouter.get('/', requirePermission('salon:configurar', 'catalogo:gestionar'), c.listarEstaciones)
estacionesRouter.use(requirePermission('salon:configurar'))
estacionesRouter.post('/', validateSchema(crearEstacionSchema), c.crearEstacion)
estacionesRouter.put('/:id', validateSchema(actualizarEstacionSchema), c.actualizarEstacion)
estacionesRouter.delete('/:id', c.eliminarEstacion)

// /api/v1/admin/grupos-modificadores
export const gruposRouter = protegido('catalogo:gestionar')
gruposRouter.get('/', c.listarGrupos)
gruposRouter.post('/', validateSchema(crearGrupoSchema), c.crearGrupo)
gruposRouter.put('/:id', validateSchema(actualizarGrupoSchema), c.actualizarGrupo)
gruposRouter.delete('/:id', c.eliminarGrupo)
