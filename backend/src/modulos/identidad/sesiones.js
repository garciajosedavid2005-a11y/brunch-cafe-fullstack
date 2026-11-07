import Usuario from './usuario.model.js'

// Caché en memoria de la sesión resuelta desde BD (usuario + rol + permisos).
// TTL de 30 s; se invalida al instante cuando cambia un usuario o un rol.
// Válida para una sola instancia del backend.
export const TTL_SESION_MS = 30_000

const cache = new Map() // id usuario → { sesion, expira }
// Generaciones (1.1b): una lectura de la BD que empezó antes de una invalidación no se guarda en
// la caché al terminar (si no, devolvería la versión de sesión vieja hasta 30 s tras un logout)
const generaciones = new Map() // id usuario → n.º de invalidaciones
let generacionGlobal = 0 // invalidaciones por rol o de toda la caché
const generacionDe = (id) => `${generacionGlobal}:${generaciones.get(id) || 0}`

const resolverDesdeBD = async (id) => {
    const usuario = await Usuario.findById(id)
        .select('nombre apellido correo telefono activo rol tokenVersion')
        .populate('rol', 'nombre etiqueta permisos')
        .lean()
    if (!usuario) return null
    return {
        id: String(usuario._id),
        nombre: usuario.nombre,
        apellido: usuario.apellido,
        correo: usuario.correo,
        activo: usuario.activo !== false, // documentos antiguos sin el campo = activos
        tokenVersion: usuario.tokenVersion || 0,
        rolId: usuario.rol ? String(usuario.rol._id) : null,
        rol: usuario.rol?.nombre || null,
        permisos: usuario.rol?.permisos || [],
    }
}

/** Devuelve la sesión del usuario (o null si ya no existe). */
export const obtenerSesion = async (id) => {
    const ahora = Date.now()
    const enCache = cache.get(String(id))
    if (enCache && enCache.expira > ahora) return enCache.sesion

    const generacion = generacionDe(String(id))
    const sesion = await resolverDesdeBD(id)
    if (generacionDe(String(id)) !== generacion) return sesion // se invalidó mientras se leía
    if (sesion) cache.set(String(id), { sesion, expira: ahora + TTL_SESION_MS })
    else cache.delete(String(id))
    return sesion
}

export const invalidarSesionUsuario = (id) => {
    cache.delete(String(id))
    generaciones.set(String(id), (generaciones.get(String(id)) || 0) + 1)
}

export const invalidarSesionesDeRol = (rolId) => {
    generacionGlobal += 1 // también las lecturas en curso de usuarios de ese rol
    for (const [id, { sesion }] of cache) {
        if (sesion.rolId === String(rolId)) cache.delete(id)
    }
}

export const limpiarCacheSesiones = () => {
    generacionGlobal += 1
    cache.clear()
}
