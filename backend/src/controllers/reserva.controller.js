import Reserva from '../models/reserva.model.js'
import Estado from '../models/estado.model.js'

// Acciones del cliente 

export const crearReserva = async (req, res) => {
    try {
        const { cantidadPersonas, fecha, hora } = req.body

        const estadoPendiente = await Estado.findOne({ nombre: 'Pendiente', tipo: 'reserva' })
        if (!estadoPendiente) {
            return res.status(500).json({ message: "No existe el estado 'Pendiente' de tipo reserva, creelo primero" })
        }

        const nuevaReserva = new Reserva({
            usuario: req.usuario.id,
            estado: estadoPendiente._id,
            cantidadPersonas,
            fecha,
            hora
        })

        const reservaGuardada = await nuevaReserva.save()
        await reservaGuardada.populate('estado')

        res.json(reservaGuardada)
    } catch (error) {
        console.log(error)
        res.status(500).json({ message: error.message })
    }
}

export const misReservas = async (req, res) => {
    try {
        const reservas = await Reserva.find({ usuario: req.usuario.id })
            .populate('estado')
            .sort({ fecha: -1 })

        res.json(reservas)
    } catch (error) {
        console.log(error)
        res.status(500).json({ message: error.message })
    }
}

export const cancelarReserva = async (req, res) => {
    try {
        const reserva = await Reserva.findById(req.params.id)
        if (!reserva) return res.status(404).json({ message: "Reserva no encontrada" })

        if (reserva.usuario.toString() !== req.usuario.id) {
            return res.status(403).json({ message: "No puedes cancelar una reserva que no es tuya" })
        }

        const estadoCancelada = await Estado.findOne({ nombre: 'Cancelada', tipo: 'reserva' })
        if (!estadoCancelada) {
            return res.status(500).json({ message: "No existe el estado 'Cancelada' de tipo reserva, creelo primero" })
        }

        reserva.estado = estadoCancelada._id
        await reserva.save()
        await reserva.populate('estado')

        res.json(reserva)
    } catch (error) {
        console.log(error)
        res.status(500).json({ message: error.message })
    }
}

// Acciones del admin 

export const listarReservas = async (req, res) => {
    try {
        const reservas = await Reserva.find()
            .populate('usuario', '-contraseña')
            .populate('estado')
            .sort({ fecha: -1 })

        res.json(reservas)
    } catch (error) {
        console.log(error)
        res.status(500).json({ message: error.message })
    }
}

export const cambiarEstadoReserva = async (req, res) => {
    try {
        const { estado } = req.body // _id del nuevo Estado

        const estadoValido = await Estado.findOne({ _id: estado, tipo: 'reserva' })
        if (!estadoValido) {
            return res.status(400).json({ message: "El estado enviado no existe o no es de tipo reserva" })
        }

        const reservaActualizada = await Reserva.findByIdAndUpdate(
            req.params.id,
            { estado },
            { new: true }
        ).populate('usuario', '-contraseña').populate('estado')

        if (!reservaActualizada) return res.status(404).json({ message: "Reserva no encontrada" })

        res.json(reservaActualizada)
    } catch (error) {
        console.log(error)
        res.status(500).json({ message: error.message })
    }
}