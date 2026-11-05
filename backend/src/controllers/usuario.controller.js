import Usuario from '../models/usuario.model.js'
import bcrypt from 'bcryptjs'
import { tokenDeSesion } from '../libs/jwt.js'
import { ponerCookieSesion } from '../libs/cookies.js'
import { invalidarSesionUsuario } from '../libs/sesiones.js'

export const verPerfil = async (req, res) => {
    try {
        const usuario = await Usuario.findById(req.usuario.id)
            .select('-contraseña')
            .populate('rol')

        if (!usuario) return res.status(404).json({ message: "Usuario no encontrado" })

        res.json(usuario)
    } catch (error) {
        console.log(error)
        res.status(500).json({ message: error.message })
    }
}

export const actualizarPerfil = async (req, res) => {
    try {
        const { nombre, apellido, correo, telefono } = req.body
        const existe = await Usuario.findOne({ correo, _id: { $ne: req.usuario.id } })
        if (existe) return res.status(409).json({ message: 'Ese correo ya está asociado a otra cuenta.' })

        const usuarioActualizado = await Usuario.findByIdAndUpdate(
            req.usuario.id,
            { nombre, apellido, correo, telefono },
            { returnDocument: 'after', runValidators: true }
        ).select('-contraseña').populate('rol')
        if (!usuarioActualizado) return res.status(404).json({ message: "Usuario no encontrado" })
        res.json(usuarioActualizado)
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({ message: 'Ese correo ya está asociado a otra cuenta.' })
        }
        console.log(error)
        res.status(500).json({ message: error.message })
    }
}

export const cambiarContrasena = async (req, res) => {
    const { actual, nueva } = req.body
    if (typeof actual !== 'string' || typeof nueva !== 'string' || nueva.length < 6) {
        return res.status(400).json({ message: 'Ingresa la contraseña actual y una nueva contraseña de al menos 6 caracteres.' })
    }

    try {
        const usuario = await Usuario.findById(req.usuario.id)
        if (!usuario) return res.status(404).json({ message: 'Usuario no encontrado' })
        const coincide = await bcrypt.compare(actual, usuario.contraseña)
        if (!coincide) return res.status(400).json({ message: 'La contraseña actual no es correcta.' })

        usuario.contraseña = await bcrypt.hash(nueva, 10)
        // Cierra las demás sesiones; esta recibe un token nuevo
        usuario.tokenVersion = (usuario.tokenVersion || 0) + 1
        await usuario.save()
        invalidarSesionUsuario(usuario._id)
        ponerCookieSesion(res, await tokenDeSesion(usuario))
        return res.json({ message: 'Contraseña actualizada correctamente.' })
    } catch (error) {
        console.log(error)
        return res.status(500).json({ message: 'No fue posible actualizar la contraseña.' })
    }
}