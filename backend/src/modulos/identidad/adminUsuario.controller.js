import mongoose from 'mongoose'
import Usuario from './usuario.model.js'
import Rol from './rol.model.js'
import Contador from '../compartido/contador.model.js'
import { conTransaccion } from '../compartido/transacciones.js'
import { AppError, notFound } from '../compartido/errors.js'
import { ROL_ADMIN, puedeOtorgarRol } from './permisos.js'
import { invalidarSesionUsuario } from './sesiones.js'
import { crearUsuarioAdmin, reenviarEnlaceCreacion } from './altaUsuario.service.js'

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
    const usuarios = await Usuario.find()
        .select('-contraseña')
        .populate('rol', 'nombre etiqueta')
        .sort({ createdAt: -1 })
        .lean()
    res.json(usuarios.map(formato))
}

// Otros administradores activos distintos de `excluirId`
const contarOtrosAdminsActivos = async (rolAdminId, excluirId, session) =>
    Usuario.countDocuments({ rol: rolAdminId, activo: { $ne: false }, _id: { $ne: excluirId } }).session(session)

// Documento común que escriben todas las transacciones que quitan un admin: dos degradaciones
// simultáneas chocan aquí (WriteConflict), la segunda se reintenta y vuelve a contar (0.9).
const BLOQUEO_ADMINS = 'bloqueo-ultimo-admin'
const asegurarBloqueo = async () => {
    try {
        await Contador.updateOne({ _id: BLOQUEO_ADMINS }, { $setOnInsert: { seq: 0 } }, { upsert: true })
    } catch (error) {
        if (error?.code !== 11000) throw error // otro upsert simultáneo ya lo creó
    }
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
    if (!usuario) throw notFound('Usuario no encontrado')
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

    if (pierdeAdmin) await asegurarBloqueo()
    await conTransaccion(async (session) => {
        if (pierdeAdmin) {
            await Contador.updateOne({ _id: BLOQUEO_ADMINS }, { $inc: { seq: 1 } }, { session })
            if ((await contarOtrosAdminsActivos(rolAdminId, usuario._id, session)) === 0) {
                throw new AppError(409, 'ULTIMO_ADMIN', 'Debe quedar al menos un administrador activo.')
            }
        }
        await usuario.save({ session })
    })
    invalidarSesionUsuario(usuario._id)

    await usuario.populate('rol', 'nombre etiqueta')
    res.json(formato(usuario.toObject()))
}
