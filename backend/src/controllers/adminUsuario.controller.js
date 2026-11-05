import mongoose from 'mongoose'
import Usuario from '../models/usuario.model.js'
import Rol from '../models/rol.model.js'
import { AppError, badRequest, notFound } from '../libs/errors.js'
import { ROL_ADMIN } from '../libs/permisos.js'
import { invalidarSesionUsuario } from '../libs/sesiones.js'

const formato = (usuario) => ({
    id: usuario._id,
    nombre: usuario.nombre,
    apellido: usuario.apellido,
    correo: usuario.correo,
    telefono: usuario.telefono || '',
    activo: usuario.activo !== false,
    rol: usuario.rol
        ? { id: usuario.rol._id, codigo: usuario.rol.nombre, nombre: usuario.rol.etiqueta || usuario.rol.nombre }
        : null,
    createdAt: usuario.createdAt,
})

export const listarUsuarios = async (req, res) => {
    const usuarios = await Usuario.find()
        .select('-contraseña')
        .populate('rol', 'nombre etiqueta')
        .sort({ createdAt: -1 })
        .lean()
    res.json(usuarios.map(formato))
}

// Otros administradores activos distintos de `excluirId`
const contarOtrosAdminsActivos = async (rolAdminId, excluirId) =>
    Usuario.countDocuments({ rol: rolAdminId, activo: { $ne: false }, _id: { $ne: excluirId } })

/**
 * PATCH /api/admin/usuarios/:id  { activo?, rolId? }
 * Protecciones:
 *  - Un admin no puede desactivarse ni quitarse el rol admin a sí mismo.
 *  - No se puede dejar el sistema sin ningún admin activo.
 * Cualquier cambio invalida al instante la sesión en caché del usuario.
 */
export const actualizarUsuario = async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) throw notFound('Usuario no encontrado')
    const { activo, rolId } = req.validado

    const usuario = await Usuario.findById(req.params.id).populate('rol', 'nombre etiqueta')
    if (!usuario) throw notFound('Usuario no encontrado')

    let rolNuevo = null
    if (rolId !== undefined) {
        rolNuevo = await Rol.findById(rolId)
        if (!rolNuevo) throw badRequest('El rol seleccionado no existe')
    }

    const esAdminHoy = usuario.rol?.nombre === ROL_ADMIN && usuario.activo !== false
    const seguiraSiendoAdmin = (rolNuevo ? rolNuevo.nombre === ROL_ADMIN : usuario.rol?.nombre === ROL_ADMIN)
        && (activo === undefined ? usuario.activo !== false : activo)
    const pierdeAdmin = esAdminHoy && !seguiraSiendoAdmin

    if (pierdeAdmin && String(usuario._id) === String(req.usuario.id)) {
        throw new AppError(409, 'AUTO_BLOQUEO', 'No puedes desactivarte ni quitarte el rol de administrador a ti mismo.')
    }
    if (pierdeAdmin && (await contarOtrosAdminsActivos(usuario.rol._id, usuario._id)) === 0) {
        throw new AppError(409, 'ULTIMO_ADMIN', 'Debe quedar al menos un administrador activo.')
    }

    if (activo !== undefined) usuario.activo = activo
    if (rolNuevo) usuario.rol = rolNuevo._id
    await usuario.save()
    invalidarSesionUsuario(usuario._id)

    await usuario.populate('rol', 'nombre etiqueta')
    res.json(formato(usuario.toObject()))
}
