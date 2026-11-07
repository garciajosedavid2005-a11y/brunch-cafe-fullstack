import * as servicio from './salonConfig.service.js'

// 1.2 · Admin › Salón (permiso salon:configurar; ver salonConfig.routes.js).
// Express 5 lleva los errores (AppError) al manejador central con el formato estándar.
export const listarZonas = async (req, res) => res.json(await servicio.listarZonas())
export const crearZona = async (req, res) => res.status(201).json(await servicio.crearZona(req.validado))
export const actualizarZona = async (req, res) => res.json(await servicio.actualizarZona(req.params.id, req.validado))
export const eliminarZona = async (req, res) => {
    await servicio.eliminarZona(req.params.id)
    res.json({ message: 'Zona eliminada.' })
}

export const listarMesas = async (req, res) => {
    const zona = typeof req.query.zona === 'string' ? req.query.zona : undefined
    res.json(await servicio.listarMesas({ zona }))
}
export const crearMesa = async (req, res) => res.status(201).json(await servicio.crearMesa(req.validado))
export const actualizarMesa = async (req, res) => res.json(await servicio.actualizarMesa(req.params.id, req.validado))
export const eliminarMesa = async (req, res) => {
    await servicio.eliminarMesa(req.params.id)
    res.json({ message: 'Mesa eliminada.' })
}
