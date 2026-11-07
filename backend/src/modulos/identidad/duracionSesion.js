import { config } from '../../config.js'
import { COMODIN, ROL_CLIENTE } from './permisos.js'
import { duracionEnMs, ponerCookieSesion } from './cookies.js'
import { tokenDeSesion } from './jwt.js'

// Duración de la sesión según el rol (1.1 · F1-10):
//   - personal sin "*" (mesero, anfitrión, cocina o un rol creado por el admin): 12 h, para el turno en tablet
//   - cliente y admin ("*"): 2 h
// Se decide con el rol actual leído de la BD, no con el que tenía al iniciar sesión:
// autenticar() vuelve a comprobarla en cada petición (un mesero que pasa a cliente o a admin
// no conserva las 12 h).

/** @param {{ rol?: string|null, permisos?: string[] }} sesion  rol = nombre del rol */
export const esSesionDePersonal = ({ rol, permisos = [] } = {}) =>
    Boolean(rol) && rol !== ROL_CLIENTE && !permisos.includes(COMODIN)

export const duracionSesion = (sesion) =>
    esSesionDePersonal(sesion) ? config.JWT_EXPIRES_IN_STAFF : config.JWT_EXPIRES_IN

export const duracionSesionMs = (sesion) => duracionEnMs(duracionSesion(sesion))

/** Emite el token y pone la cookie con la duración que corresponde al rol. */
export const abrirSesion = async (res, usuario, rol) => {
    const duracion = duracionSesion({ rol: rol?.nombre, permisos: rol?.permisos })
    ponerCookieSesion(res, await tokenDeSesion(usuario, duracion), duracion)
}
