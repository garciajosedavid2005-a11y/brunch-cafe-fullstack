import * as estaciones from './estaciones.service.js'
import * as grupos from './modificadores.service.js'

// 1.3 · Admin › Estaciones (salon:configurar) y Admin › Modificadores (catalogo:gestionar).
// Express 5 lleva los errores (AppError) al manejador central con el formato estándar.
export const listarEstaciones = async (req, res) => res.json(await estaciones.listarEstaciones())
export const crearEstacion = async (req, res) => res.status(201).json(await estaciones.crearEstacion(req.validado))
export const actualizarEstacion = async (req, res) => res.json(await estaciones.actualizarEstacion(req.params.id, req.validado))
export const eliminarEstacion = async (req, res) => {
    await estaciones.eliminarEstacion(req.params.id)
    res.json({ message: 'Estación eliminada.' })
}

export const listarGrupos = async (req, res) => res.json(await grupos.listarGrupos())
export const crearGrupo = async (req, res) => res.status(201).json(await grupos.crearGrupo(req.validado))
export const actualizarGrupo = async (req, res) => res.json(await grupos.actualizarGrupo(req.params.id, req.validado, req.usuario))
export const eliminarGrupo = async (req, res) => {
    await grupos.eliminarGrupo(req.params.id)
    res.json({ message: 'Grupo de modificadores eliminado.' })
}
