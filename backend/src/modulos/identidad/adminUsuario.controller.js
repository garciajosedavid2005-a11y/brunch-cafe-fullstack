import mongoose from 'mongoose'
import Usuario from './usuario.model.js'
import Rol from './rol.model.js'
import { conTransaccion } from '../compartido/transacciones.js'
import { AppError, notFound } from '../compartido/errors.js'
import { ROL_ADMIN, ROL_CLIENTE, puedeOtorgarRol } from './permisos.js'
import { invalidarSesionUsuario } from './sesiones.js'
import { crearUsuarioAdmin, reenviarEnlaceCreacion } from './altaUsuario.service.js'
import { asegurarBloqueoAdmins, comprobarQuedaOtroAdmin } from './ultimoAdmin.js'
import { eliminarUsuario as bajaUsuario } from './bajaUsuario.service.js'

const formato = (usuario) => ({
    id: usuario._id,
    nombre: usuario.nombre,
    apellido: usuario.apellido,
    correo: usuario.correo,
    telefono: usuario.telefono || '',
    activo: usuario.activo !== false,
    // 1.5b · Aún no creó su contraseña (cuenta creada por el admin): la lista ofrece «Reenviar enlace»
    accesoPendiente: usuario.contraseñaPendiente === true,
    rol: usuario.rol
        ? { id: usuario.rol._id, codigo: usuario.rol.nombre, nombre: usuario.rol.etiqueta || usuario.rol.nombre }
        : null,
    createdAt: usuario.createdAt,
    // 3.8 · Solo las cuentas del personal se pueden eliminar (el botón depende de esto)
    eliminable: Boolean(usuario.rol) && usuario.rol.nombre !== ROL_CLIENTE,
})

/** POST /api/v1/admin/usuarios { nombre, apellido, correo, telefono?, rolId } → 201 (1.5b). */
export const crearUsuario = async (req, res) => {
    const { usuario, entrega } = await crearUsuarioAdmin(req.validado, req.usuario)
    res.status(201).json({ ...formato(usuario), entrega })
}

/** POST /api/v1/admin/usuarios/:id/reenviar-enlace (ajuste tras 1.5b). */
export const reenviarEnlace = async (req, res) => {
    const { usuario, entrega } = await reenviarEnlaceCreacion(req.params.id, req.usuario) // con el rol poblado
    res.json({ ...formato(usuario), entrega })
}

export const listarUsuarios = async (req, res) => {
    // 3.8 · Las cuentas archivadas no aparecen
    const usuarios = await Usuario.find({ eliminado: { $ne: true } })
        .select('-contraseña')
        .populate('rol', 'nombre etiqueta')
        .sort({ createdAt: -1 })
        .lean()
    res.json(usuarios.map(formato))
}

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

    const usuario = await Usuario.findById(req.params.id).populate('rol', 'nombre etiqueta permisos')
    if (!usuario || usuario.eliminado === true) throw notFound('Usuario no encontrado')
    // 1.5b · Solo se edita a quien no tiene más permisos que uno (un gestor sin * no desactiva ni
    // degrada a un admin)
    if (!puedeOtorgarRol(req.usuario.permisos || [], usuario.rol?.permisos || [])) {
        throw new AppError(403, 'FORBIDDEN', 'No puedes modificar una cuenta que tiene permisos que tú no tienes.')
    }

    let rolNuevo = null
    if (rolId !== undefined) {
        rolNuevo = await Rol.findById(rolId)
        if (!rolNuevo) throw new AppError(400, 'ROL_NO_VALIDO', 'El rol seleccionado no existe.')
        // 1.5b · Nadie asigna un rol con permisos que no tiene (igual que al crear)
        if (!puedeOtorgarRol(req.usuario.permisos || [], rolNuevo.permisos || [])) {
            throw new AppError(403, 'FORBIDDEN', 'No puedes asignar un rol que tiene permisos que tú no tienes.')
        }
    }

    const esAdminHoy = usuario.rol?.nombre === ROL_ADMIN && usuario.activo !== false
    const seguiraSiendoAdmin = (rolNuevo ? rolNuevo.nombre === ROL_ADMIN : usuario.rol?.nombre === ROL_ADMIN)
        && (activo === undefined ? usuario.activo !== false : activo)
    const pierdeAdmin = esAdminHoy && !seguiraSiendoAdmin
    const rolAdminId = usuario.rol?._id

    if (pierdeAdmin && String(usuario._id) === String(req.usuario.id)) {
        throw new AppError(409, 'AUTO_BLOQUEO', 'No puedes desactivarte ni quitarte el rol de administrador a ti mismo.')
    }

    if (activo === false && usuario.activo !== false) {
        usuario.tokenVersion = (usuario.tokenVersion || 0) + 1
    }
    if (activo !== undefined) usuario.activo = activo
    if (rolNuevo) usuario.rol = rolNuevo._id

    if (pierdeAdmin) await asegurarBloqueoAdmins()
    await conTransaccion(async (session) => {
        // 3.8 · Si se archivó mientras tanto, no se reactiva (el save escribe el mismo documento: choca y se reintenta)
        if (!(await Usuario.exists({ _id: usuario._id, eliminado: { $ne: true } }).session(session))) throw notFound('Usuario no encontrado')
        if (pierdeAdmin) await comprobarQuedaOtroAdmin(rolAdminId, usuario._id, session)
        await usuario.save({ session })
    })
    invalidarSesionUsuario(usuario._id)

    await usuario.populate('rol', 'nombre etiqueta')
    res.json(formato(usuario.toObject()))
}

/** DELETE /api/v1/admin/usuarios/:id (3.8): borrado real sin historial; archivado con historial. */
export const eliminarUsuario = async (req, res) => {
    res.json(await bajaUsuario(req.params.id, req.usuario))
}
