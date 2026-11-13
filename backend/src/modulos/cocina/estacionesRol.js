// 2.5b · Estaciones por rol: cada acción y lectura del KDS sobre una estación exige que sea del rol del
// usuario (el comodín, todas). Va en el servicio, no solo en la ruta: el canal SSE y los servicios que se
// llaman desde otros módulos también la cumplen.
import { AppError } from '../compartido/errors.js'
import { operaEstacion } from '../identidad/permisos.js'

/**
 * 403 ESTACION_NO_ASIGNADA si la estación no es del rol del usuario. `revelar: false` cuando el código
 * sale de un dato ajeno (el ítem): la respuesta no dice en qué estación está (security-reviewer).
 */
export const exigirEstacion = (sesion, codigo, { revelar = true } = {}) => {
    if (!operaEstacion(sesion, codigo)) {
        throw new AppError(403, 'ESTACION_NO_ASIGNADA', 'Esta estación no está asignada a tu rol.', revelar ? { estacion: codigo || null } : undefined)
    }
}
