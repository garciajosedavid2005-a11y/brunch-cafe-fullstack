import { obtenerPerfil, actualizarPerfil, cambiarContrasena } from './perfil.service.js'
import { perfilSchema, contrasenaSchema } from './perfil.schema.js'
import { abrirSesion } from './duracionSesion.js'

// Forma v1: { perfil: { id, nombre, apellido, correo, telefono, rol, createdAt } }
const formato = (u) => ({
    id: String(u._id),
    nombre: u.nombre,
    apellido: u.apellido,
    correo: u.correo,
    telefono: u.telefono || '',
    rol: u.rol ? { nombre: u.rol.nombre, etiqueta: u.rol.etiqueta || u.rol.nombre } : null,
    createdAt: u.createdAt,
})

export const verMiPerfil = async (req, res) => {
    res.json({ perfil: formato(await obtenerPerfil(req.usuario.id)) })
}

export const editarMiPerfil = async (req, res) => {
    res.json({ perfil: formato(await actualizarPerfil(req.usuario.id, perfilSchema.parse(req.body))) })
}

export const cambiarMiContrasena = async (req, res) => {
    const usuario = await cambiarContrasena(req.usuario.id, contrasenaSchema.parse(req.body))
    // Esta sesión sigue abierta, con la duración del rol actual (req.usuario viene de la BD)
    await abrirSesion(res, usuario, { nombre: req.usuario.rol, permisos: req.usuario.permisos })
    res.json({ message: 'Contraseña actualizada correctamente.' })
}
