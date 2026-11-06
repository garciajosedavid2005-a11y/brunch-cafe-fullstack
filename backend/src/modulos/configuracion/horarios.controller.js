import { ZONA_HORARIA } from '../../libs/fechas.js'
import * as servicio from './horarios.service.js'

// GET /api/v1/horarios (público): lo usan los formularios de pedido y reserva
export const verHorarios = async (req, res) => {
    res.json({ horarios: await servicio.obtenerHorarios(), zonaHoraria: ZONA_HORARIA })
}

// GET /api/v1/admin/horarios
export const verHorariosAdmin = async (req, res) => {
    res.json(await servicio.obtenerHorariosAdmin())
}

// PUT /api/v1/admin/horarios (requiere validateSchema(horariosSchema))
export const editarHorarios = async (req, res) => {
    res.json(await servicio.actualizarHorarios(req.validado, req.usuario))
}
