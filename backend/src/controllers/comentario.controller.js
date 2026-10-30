import Comentario from '../models/comentario.model.js'
import { manejarError } from '../libs/manejarError.js'

// ---------- Públicas ----------

// Solo expone nombre y apellido del autor, nunca correo ni otros datos
export const listarComentarios = async (req, res) => {
    try {
        const comentarios = await Comentario.find()
            .populate('usuario', 'nombre apellido')
            .sort({ createdAt: -1 })

        res.json(comentarios)
    } catch (error) {
        manejarError(res, error)
    }
}

// ---------- Cliente (la ruta debe llevar authorizeRole('cliente')) ----------

export const crearComentario = async (req, res) => {
    try {
        const { calificacion, descripcion } = req.body

        const comentario = await new Comentario({
            usuario: req.usuario.id,
            calificacion,
            descripcion
        }).save()

        await comentario.populate('usuario', 'nombre apellido')

        res.status(201).json(comentario)
    } catch (error) {
        manejarError(res, error)
    }
}

export const misComentarios = async (req, res) => {
    try {
        const comentarios = await Comentario.find({ usuario: req.usuario.id })
            .populate('usuario', 'nombre apellido')
            .sort({ createdAt: -1 })

        res.json(comentarios)
    } catch (error) {
        manejarError(res, error)
    }
}