import Usuario from '../models/usuario.model.js'
import Rol from '../models/rol.model.js'
import bcrypt from 'bcryptjs'
import { generarToken } from '../libs/jwt.js'

export const register = async (req, res) => {
    try {
        const { nombre, apellido, correo, contraseña, telefono } = req.body

        const existe = await Usuario.findOne({ correo })
        if (existe) return res.status(400).json({ message: "Ya existe un usuario con ese correo" })

        const rolCliente = await Rol.findOne({ nombre: 'cliente' })
        if (!rolCliente) return res.status(500).json({ message: "No existe el rol 'cliente' en la base de datos, crealo primero" })

        const contraseñaHash = await bcrypt.hash(contraseña, 10)

        const nuevoUsuario = new Usuario({
            nombre,
            apellido,
            correo,
            contraseña: contraseñaHash,
            telefono,
            rol: rolCliente._id
        })

        const usuarioGuardado = await nuevoUsuario.save()
        const token = await generarToken({ id: usuarioGuardado._id, rol: rolCliente.nombre })

        res.cookie("token", token)
        res.json({
            id: usuarioGuardado._id,
            nombre: usuarioGuardado.nombre,
            apellido: usuarioGuardado.apellido,
            correo: usuarioGuardado.correo,
            telefono: usuarioGuardado.telefono,
            rol: rolCliente.nombre,
            createdAt: usuarioGuardado.createdAt,
            updatedAt: usuarioGuardado.updatedAt,
        })

    } catch (error) {
        console.log(error)
        res.status(500).json({ message: error.message })
    }
}

export const login = async (req, res) => {
    try {
        const { correo, contraseña } = req.body

        const usuarioEncontrado = await Usuario.findOne({ correo }).populate('rol')
        if (!usuarioEncontrado) return res.status(400).json({ message: "Usuario no encontrado" })

        const coincide = await bcrypt.compare(contraseña, usuarioEncontrado.contraseña)
        if (!coincide) return res.status(400).json({ message: "Contraseña incorrecta" })

        const token = await generarToken({ id: usuarioEncontrado._id, rol: usuarioEncontrado.rol.nombre })

        res.cookie("token", token)
        res.json({
            id: usuarioEncontrado._id,
            nombre: usuarioEncontrado.nombre,
            apellido: usuarioEncontrado.apellido,
            correo: usuarioEncontrado.correo,
            telefono: usuarioEncontrado.telefono,
            rol: usuarioEncontrado.rol.nombre,
            createdAt: usuarioEncontrado.createdAt,
            updatedAt: usuarioEncontrado.updatedAt,
        })

    } catch (error) {
        console.log(error)
        res.status(500).json({ message: error.message })
    }
}

export const logout = (req, res) => {
    res.cookie("token", "", {
        expires: new Date(0),
    })
    return res.sendStatus(200)
}