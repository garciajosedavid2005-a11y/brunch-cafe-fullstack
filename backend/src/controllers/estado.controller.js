import Estado from '../modulos/compartido/estado.model.js'
import Pedido from '../modulos/pedidos/pedido.model.js'
import Reserva from '../models/reserva.model.js'
import { AppError, badRequest, conflict, notFound } from '../modulos/compartido/errors.js'
import { TIPOS_ESTADO, esEstadoFinal, definicionEstado } from '../modulos/compartido/estados.js'

const COMPARACION = { locale: 'es', strength: 1 }

// Lo que el estado no tenga guardado se toma del catálogo de su código
// (antes era un amarillo fijo: hasta "Cancelada" salía amarilla)
const formato = (estado, usosAsociados = 0) => {
    const catalogo = definicionEstado(estado.tipo, estado.codigo) || {}
    return {
    id: estado._id,
    codigo: estado.codigo,
    tipo: estado.tipo,
    nombre: estado.nombre,
    etiqueta: estado.nombre,
    descripcion: estado.descripcion || '',
    color: estado.color || catalogo.color || '#5f5f5f',
    bg: estado.bg || catalogo.bg || '#f0f0f0',
    badgeType: estado.badgeType || catalogo.badgeType || 'neutral',
    esFinal: esEstadoFinal(estado.tipo, estado.codigo),
    orden: estado.orden || 0,
    usosAsociados,
    }
}

// Cuenta cuántos pedidos y reservas usan cada estado
const contarUsos = async () => {
    const [enPedidos, enReservas] = await Promise.all([
        Pedido.aggregate([{ $group: { _id: '$estado', total: { $sum: 1 } } }]),
        Reserva.aggregate([{ $group: { _id: '$estado', total: { $sum: 1 } } }]),
    ])
    const usos = new Map()
    for (const fila of [...enPedidos, ...enReservas]) {
        usos.set(String(fila._id), (usos.get(String(fila._id)) || 0) + fila.total)
    }
    return usos
}

// GET /api/estados  ó  GET /api/estados?tipo=reserva   (ordenados según el flujo)
export const listarEstados = async (req, res) => {
    const filtro = {}
    if (req.query.tipo !== undefined) {
        if (!TIPOS_ESTADO.includes(req.query.tipo)) throw badRequest('El tipo debe ser "pedido" o "reserva"')
        filtro.tipo = req.query.tipo
    }
    const [estados, usos] = await Promise.all([
        Estado.find(filtro).sort({ tipo: 1, orden: 1 }),
        contarUsos(),
    ])
    res.json(estados.map((e) => formato(e, usos.get(String(e._id)) || 0)))
}

// PUT /api/estados/:id  — solo presentación: nombre (etiqueta), descripción y colores
export const actualizarEstado = async (req, res) => {
    const estado = await Estado.findById(req.params.id)
    if (!estado) throw notFound('Estado no encontrado')

    const { nombre, descripcion, color, bg, badgeType } = req.validado
    if (nombre !== undefined) {
        const existe = await Estado.findOne({ nombre, tipo: estado.tipo, _id: { $ne: estado._id } }).collation(COMPARACION)
        if (existe) throw conflict(`Ya existe el estado '${nombre}' de tipo ${estado.tipo}`)
    }
    for (const [campo, valor] of Object.entries({ nombre, descripcion, color, bg, badgeType })) {
        if (valor !== undefined) estado[campo] = valor
    }
    await estado.save()

    const usos = await contarUsos()
    res.json(formato(estado, usos.get(String(estado._id)) || 0))
}

// Los estados son fijos (los define src/modulos/compartido/estados.js): no se crean ni se borran
export const estadosFijos = () => {
    throw new AppError(405, 'ESTADOS_FIJOS', 'Los estados son fijos: solo puedes editar su etiqueta, descripción y colores.')
}
