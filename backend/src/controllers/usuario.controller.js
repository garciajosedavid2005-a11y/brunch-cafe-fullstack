import Usuario from '../models/usuario.model.js'

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
        const { nombre, apellido, telefono } = req.body

        const usuarioActualizado = await Usuario.findByIdAndUpdate(
            req.usuario.id,
            { nombre, apellido, telefono },
            { new: true }
        ).select('-contraseña').populate('rol')

        if (!usuarioActualizado) return res.status(404).json({ message: "Usuario no encontrado" })

        res.json(usuarioActualizado)
    } catch (error) {
        console.log(error)
        res.status(500).json({ message: error.message })
    }
}