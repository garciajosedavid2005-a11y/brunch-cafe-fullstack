import Rol from '../models/rol.model.js'
import Usuario from '../models/usuario.model.js'
import { manejarError } from '../libs/manejarError.js'
import { slug, sinUndefined } from '../libs/utils.js'

// Estos dos roles los usa el sistema (login, permisos): no se pueden eliminar
const ROLES_SISTEMA = ['admin', 'cliente']

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
})

export const listarRoles = async (req, res) => {
    try {
        const [roles, conteos] = await Promise.all([
            Rol.find().sort({ createdAt: 1 }),
            Usuario.aggregate([{ $group: { _id: '$rol', total: { $sum: 1 } } }]),
        ])

        const porRol = new Map(conteos.map((c) => [String(c._id), c.total]))

        res.json(roles.map((r) => formato(r, porRol.get(String(r._id)) || 0)))
    } catch (error) {
        manejarError(res, error)
    }
}

export const crearRol = async (req, res) => {
    try {
        const { nombre, codigo, descripcion, permisos } = req.body

        const identificador = slug(codigo || nombre, '_')
        if (!identificador) {
            return res.status(400).json({ message: 'El nombre debe contener letras o números' })
        }

        const existe = await Rol.findOne({ nombre: identificador })
        if (existe) {
            return res.status(409).json({ message: `Ya existe un rol con el identificador '${identificador}'` })
        }

        const rol = await new Rol({
            nombre: identificador,
            etiqueta: nombre,
            descripcion,
            permisos,
        }).save()

        res.status(201).json(formato(rol))
    } catch (error) {
        manejarError(res, error)
    }
}

export const actualizarRol = async (req, res) => {
    try {
        const rol = await Rol.findById(req.params.id)
        if (!rol) return res.status(404).json({ message: 'Rol no encontrado' })

        const { nombre, descripcion, permisos } = req.body

        // El identificador (rol.nombre) nunca cambia: viaja en el token de los usuarios
        rol.set(sinUndefined({ etiqueta: nombre, descripcion, permisos }))
        await rol.save()

        const total = await Usuario.countDocuments({ rol: rol._id })

        res.json(formato(rol, total))
    } catch (error) {
        manejarError(res, error)
    }
}

export const eliminarRol = async (req, res) => {
    try {
        const rol = await Rol.findById(req.params.id)
        if (!rol) return res.status(404).json({ message: 'Rol no encontrado' })

        if (esProtegido(rol)) {
            return res.status(400).json({ message: 'Los roles de sistema no se pueden eliminar' })
        }

        const asignados = await Usuario.countDocuments({ rol: rol._id })
        if (asignados > 0) {
            return res.status(400).json({
                message: `No se puede eliminar: hay ${asignados} usuario(s) con este rol`,
            })
        }

        await rol.deleteOne()

        res.json({ message: 'Rol eliminado' })
    } catch (error) {
        manejarError(res, error)
    }
}