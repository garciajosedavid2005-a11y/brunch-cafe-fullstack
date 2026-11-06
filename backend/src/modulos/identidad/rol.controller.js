import Rol from './rol.model.js'
import Usuario from './usuario.model.js'
import Permiso from './permiso.model.js'
import { AppError, conflict, notFound } from '../compartido/errors.js'
import { slug, sinUndefined } from '../compartido/utils.js'
import { ROL_ADMIN, ROL_CLIENTE } from './permisos.js'
import { invalidarSesionesDeRol } from './sesiones.js'

// Roles base del sistema (además de los marcados con esSistema)
const ROLES_SISTEMA = [ROL_ADMIN, ROL_CLIENTE]

const esProtegido = (rol) => Boolean(rol.esSistema) || ROLES_SISTEMA.includes(rol.nombre)

// En la base de datos "nombre" es el identificador ("admin") y "etiqueta" el nombre
// para mostrar ("Administrador"). El dashboard los llama "codigo" y "nombre".
const formato = (rol, usuariosAsignados = 0) => ({
    id: rol._id,
    codigo: rol.nombre,
    nombre: rol.etiqueta || rol.nombre,
    descripcion: rol.descripcion || '',
    usuariosAsignados,
    esSistema: esProtegido(rol),
    permisos: rol.permisos || [],
    // El rol admin no se edita; el rol cliente no puede tener permisos de staff
    editable: rol.nombre !== ROL_ADMIN,
    permisosEditables: ![ROL_ADMIN, ROL_CLIENTE].includes(rol.nombre),
    eliminable: !esProtegido(rol) && usuariosAsignados === 0,
})

export const listarPermisos = async (req, res) => {
    const permisos = await Permiso.find().sort({ modulo: 1, clave: 1 }).lean()
    res.json(permisos.map(({ clave, modulo, descripcion, reservado }) => ({ clave, modulo, descripcion, reservado })))
}

export const listarRoles = async (req, res) => {
    const [roles, conteos] = await Promise.all([
        Rol.find().sort({ createdAt: 1 }),
        Usuario.aggregate([{ $group: { _id: '$rol', total: { $sum: 1 } } }]),
    ])
    const porRol = new Map(conteos.map((c) => [String(c._id), c.total]))
    res.json(roles.map((r) => formato(r, porRol.get(String(r._id)) || 0)))
}

export const crearRol = async (req, res) => {
    const { nombre, codigo, descripcion, permisos } = req.validado

    const identificador = slug(codigo || nombre, '_')
    if (!identificador) throw new AppError(400, 'BAD_REQUEST', 'El nombre debe contener letras o números')

    const existe = await Rol.exists({ nombre: identificador })
    if (existe) throw conflict(`Ya existe un rol con el identificador '${identificador}'`)

    const rol = await Rol.create({ nombre: identificador, etiqueta: nombre, descripcion, permisos })
    res.status(201).json(formato(rol))
}

export const actualizarRol = async (req, res) => {
    const rol = await Rol.findById(req.params.id)
    if (!rol) throw notFound('Rol no encontrado')

    if (rol.nombre === ROL_ADMIN) {
        throw new AppError(403, 'ROL_PROTEGIDO', 'El rol administrador no se puede editar.')
    }
    const { nombre, descripcion, permisos } = req.validado
    if (rol.nombre === ROL_CLIENTE && permisos !== undefined && permisos.length > 0) {
        throw new AppError(403, 'ROL_PROTEGIDO', 'El rol cliente no puede tener permisos de staff.')
    }

    // El identificador (rol.nombre) nunca cambia
    rol.set(sinUndefined({ etiqueta: nombre, descripcion, permisos: rol.nombre === ROL_CLIENTE ? undefined : permisos }))
    await rol.save()
    invalidarSesionesDeRol(rol._id)

    const total = await Usuario.countDocuments({ rol: rol._id })
    res.json(formato(rol, total))
}

export const eliminarRol = async (req, res) => {
    const rol = await Rol.findById(req.params.id)
    if (!rol) throw notFound('Rol no encontrado')

    if (esProtegido(rol)) {
        throw new AppError(403, 'ROL_PROTEGIDO', 'Los roles de sistema no se pueden eliminar.')
    }
    const asignados = await Usuario.countDocuments({ rol: rol._id })
    if (asignados > 0) {
        const texto = asignados === 1 ? '1 usuario asignado' : `${asignados} usuarios asignados`
        throw new AppError(409, 'ROL_CON_USUARIOS', `No se puede eliminar: tiene ${texto}.`, { usuariosAsignados: asignados })
    }

    await rol.deleteOne()
    invalidarSesionesDeRol(rol._id)
    res.json({ message: 'Rol eliminado' })
}
