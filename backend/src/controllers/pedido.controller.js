import mongoose from 'mongoose'
import Pedido from '../models/pedido.model.js'
import DetallePedido from '../models/detallePedido.model.js'
import Evento from '../models/evento.model.js'
import Estado from '../models/estado.model.js'
import { filtrosPedidosSchema } from '../schema/pedido.schema.js'
import { instanteLocal } from '../libs/fechas.js'
import { notFound } from '../libs/errors.js'
import { esEstadoFinal } from '../libs/estados.js'
import { cambiarEstado, codigoDestino, estadosDelTipo, opcionesDeCambio } from '../services/estados.service.js'

const POBLAR = [
    ['usuario', 'nombre apellido correo telefono'],
    ['estado', 'nombre codigo'],
    ['metodoPago', 'nombre'],
]

const formato = (pedido, detalles, { permisos, estados }) => {
    const codigo = pedido.estado?.codigo || ''
    return {
        id: pedido._id,
        codigo: `PED-${pedido._id.toString().slice(-6).toUpperCase()}`,
        cliente: pedido.nombreEntrega || [pedido.usuario?.nombre, pedido.usuario?.apellido].filter(Boolean).join(' ') || 'Cliente',
        correo: pedido.usuario?.correo || '',
        // El del pedido; los anteriores a 0.8 no lo tienen y se muestra el del perfil
        telefono: pedido.telefono || pedido.usuario?.telefono || '',
        direccion: pedido.direccion || '',
        barrio: pedido.barrio || '',
        hora: pedido.horaEntrega || '',
        entregaEn: pedido.entregaEn || null, // instante UTC (0.10)
        fecha: pedido.createdAt,
        estado: pedido.estado?.nombre || '',
        estadoId: pedido.estado?._id || pedido.estado,
        estadoCodigo: codigo,
        esFinal: esEstadoFinal('pedido', codigo),
        // Cambios que el usuario actual puede hacer desde aquí
        transiciones: opcionesDeCambio('pedido', codigo, { permisos, contexto: pedido }, estados),
        total: pedido.total,
        metodoPago: pedido.metodoPago?.nombre || '',
        notas: pedido.indicaciones || '',
        items: detalles.map((detalle) => ({
            nombre: detalle.nombreProducto,
            cantidad: detalle.cantidad,
            precio: detalle.precioProducto,
            subtotal: detalle.subtotal,
        })),
    }
}

const serializar = async (pedidos, permisos) => {
    const estados = await estadosDelTipo('pedido')
    const detalles = await DetallePedido.find({ pedido: { $in: pedidos.map(({ _id }) => _id) } }).lean()
    const porPedido = new Map()
    for (const detalle of detalles) {
        const key = String(detalle.pedido)
        porPedido.set(key, [...(porPedido.get(key) || []), detalle])
    }
    return pedidos.map((pedido) => formato(pedido, porPedido.get(String(pedido._id)) || [], { permisos, estados }))
}

const poblar = (consulta) => POBLAR.reduce((q, [ruta, campos]) => q.populate(ruta, campos), consulta)

// Día siguiente de una fecha de calendario "YYYY-MM-DD"
const diaSiguiente = (fecha) => {
    const d = new Date(`${fecha}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + 1)
    return d.toISOString().slice(0, 10)
}

// GET /api/v1/staff/pedidos?estado=pendiente,confirmado&fecha=AAAA-MM-DD&limite=50 (0.13)
// Sin parámetros: todos, más recientes primero (como antes). X-Total-Count = total sin límite.
export const listarPedidos = async (req, res) => {
    const { estado, fecha, limite } = filtrosPedidosSchema.parse(req.query)
    const filtro = {}
    if (estado) {
        const estados = await Estado.find({ tipo: 'pedido', codigo: { $in: estado } }).select('_id').lean()
        filtro.estado = { $in: estados.map(({ _id }) => _id) }
    }
    if (fecha) {
        // Día de America/Bogota según la hora en que se hizo el pedido
        filtro.createdAt = { $gte: instanteLocal(fecha, '00:00'), $lt: instanteLocal(diaSiguiente(fecha), '00:00') }
    }
    const consulta = poblar(Pedido.find(filtro)).sort({ createdAt: -1, _id: -1 })
    if (limite) consulta.limit(limite)
    const [pedidos, total] = await Promise.all([consulta.lean(), Pedido.countDocuments(filtro)])
    res.set('X-Total-Count', String(total))
    res.json(await serializar(pedidos, req.usuario.permisos))
}

const buscarPedido = async (id) => {
    if (!mongoose.isValidObjectId(id)) throw notFound('Pedido no encontrado')
    const pedido = await Pedido.findById(id).populate('estado', 'codigo')
    if (!pedido) throw notFound('Pedido no encontrado')
    return pedido
}

// GET /api/v1/staff/pedidos/:id: el pedido y su historial de cambios (Evento) (0.13)
export const verPedido = async (req, res) => {
    const pedido = await buscarPedido(req.params.id)
    const [[respuesta], eventos] = await Promise.all([
        serializar([await poblar(Pedido.findById(pedido._id)).lean()], req.usuario.permisos),
        Evento.find({ entidad: 'pedido', entidadId: pedido._id })
            .sort({ createdAt: 1, _id: 1 })
            .populate('usuario', 'nombre apellido')
            .lean(),
    ])
    res.json({
        ...respuesta,
        historial: eventos.map((evento) => ({
            de: evento.de,
            a: evento.a,
            motivo: evento.motivo || '',
            actor: evento.actor,
            usuario: evento.usuario ? [evento.usuario.nombre, evento.usuario.apellido].filter(Boolean).join(' ') : '',
            fecha: evento.createdAt,
        })),
    })
}

// PATCH /api/v1/staff/pedidos/:id/cancelar { motivo } (0.13): exige pedido:cancelar y motivo;
// la máquina de estados decide desde qué estados se puede (pendiente o confirmado)
export const cancelarPedido = async (req, res) => {
    const pedido = await buscarPedido(req.params.id)
    const actualizado = await cambiarEstado({
        tipo: 'pedido', Modelo: Pedido, documento: pedido, a: 'cancelado',
        sesion: req.usuario, motivo: req.validado.motivo, contexto: pedido,
    })
    const [respuesta] = await serializar([await poblar(Pedido.findById(actualizado._id)).lean()], req.usuario.permisos)
    res.json(respuesta)
}

// PATCH /api/pedidos/:id/estado  { codigo | estado, motivo? }
// Cada transición exige su permiso (ver src/libs/estados.js); cancelar pide motivo.
export const cambiarEstadoPedido = async (req, res) => {
    const pedido = await buscarPedido(req.params.id)

    const a = await codigoDestino('pedido', req.validado)
    const actualizado = await cambiarEstado({
        tipo: 'pedido',
        Modelo: Pedido,
        documento: pedido,
        a,
        sesion: req.usuario,
        motivo: req.validado.motivo,
        contexto: pedido,
    })
    const [respuesta] = await serializar([await poblar(Pedido.findById(actualizado._id)).lean()], req.usuario.permisos)
    res.json(respuesta)
}
