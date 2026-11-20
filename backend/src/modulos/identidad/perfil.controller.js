import { obtenerPerfil, actualizarPerfil, cambiarContrasena } from './perfil.service.js'
import { perfilSchema, contrasenaSchema, direccionSchema, cambioDireccionSchema } from './perfil.schema.js'
import { listarDirecciones, agregarDireccion, editarDireccion, borrarDireccion, marcarPrincipal } from './direcciones.service.js'
import { validar } from '../salon/cuentas.schema.js'
import { abrirSesion } from './duracionSesion.js'

// Forma v1: { perfil: { id, nombre, apellido, correo, telefono, rol, createdAt } }
const formato = (u) => ({
    id: String(u._id),
    nombre: u.nombre,
    apellido: u.apellido,
    correo: u.correo,
    telefono: u.telefono || '',
    rol: u.rol ? { nombre: u.rol.nombre, etiqueta: u.rol.etiqueta || u.rol.nombre } : null,
    // 6.4 · Fecha como «AAAA-MM-DD» (día del calendario, sin zona), alergias, preferencias y consentimiento
    fechaNacimiento: u.fechaNacimiento ? new Date(u.fechaNacimiento).toISOString().slice(0, 10) : '',
    alergias: u.alergias || '',
    preferencias: u.preferencias || '',
    consentimiento: u.consentimiento ? { version: u.consentimiento.version, aceptadoEn: u.consentimiento.aceptadoEn } : null,
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

// 6.4 (F6-g) · Libreta de direcciones (cada respuesta trae la lista completa, la principal primero)
export const verMisDirecciones = async (req, res) => res.json(await listarDirecciones(req.usuario.id))
export const agregarMiDireccion = async (req, res) => res.status(201).json(await agregarDireccion(req.usuario.id, validar(direccionSchema, req.body)))
export const editarMiDireccion = async (req, res) => res.json(await editarDireccion(req.usuario.id, req.params.id, validar(cambioDireccionSchema, req.body)))
export const borrarMiDireccion = async (req, res) => res.json(await borrarDireccion(req.usuario.id, req.params.id))
export const principalMiDireccion = async (req, res) => res.json(await marcarPrincipal(req.usuario.id, req.params.id))
