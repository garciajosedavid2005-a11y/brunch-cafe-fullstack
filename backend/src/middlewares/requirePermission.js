import { cuerpoError } from '../modulos/compartido/errors.js'
import { tienePermiso } from '../libs/permisos.js'

/**
 * Autorización por permisos. Con varias claves basta con tener una.
 * Debe ir después de `autenticar`. Sin sesión → 401; sin permiso → 403.
 *   router.get('/', autenticar, requirePermission('pedido:ver'), handler)
 */
export const requirePermission = (...claves) => (req, res, next) => {
    if (!req.usuario) {
        return res.status(401).json(cuerpoError('UNAUTHORIZED', 'No hay sesión activa. Inicia sesión.'))
    }
    if (!claves.some((clave) => tienePermiso(req.usuario.permisos, clave))) {
        return res.status(403).json(cuerpoError('FORBIDDEN', 'No tienes permiso para realizar esta acción.', { requiere: claves }))
    }
    next()
}
