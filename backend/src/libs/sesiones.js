import Usuario from '../models/usuario.model.js'

// Caché en memoria de la sesión resuelta desde BD (usuario + rol + permisos).
// TTL de 30 s; se invalida al instante cuando cambia un usuario o un rol.
// Válida para una sola instancia del backend.
export const TTL_SESION_MS = 30_000

const cache = new Map() // id usuario → { sesion, expira }

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

    const sesion = await resolverDesdeBD(id)
    if (sesion) cache.set(String(id), { sesion, expira: ahora + TTL_SESION_MS })
    else cache.delete(String(id))
    return sesion
}

export const invalidarSesionUsuario = (id) => {
    cache.delete(String(id))
}

export const invalidarSesionesDeRol = (rolId) => {
    for (const [id, { sesion }] of cache) {
        if (sesion.rolId === String(rolId)) cache.delete(id)
    }
}

export const limpiarCacheSesiones = () => cache.clear()
