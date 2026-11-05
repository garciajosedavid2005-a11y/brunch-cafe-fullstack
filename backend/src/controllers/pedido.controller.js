import Pedido from '../models/pedido.model.js'
import DetallePedido from '../models/detallePedido.model.js'
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
        telefono: pedido.usuario?.telefono || '',
        direccion: pedido.direccion || '',
        barrio: pedido.barrio || '',
        hora: pedido.horaEntrega || '',
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

export const listarPedidos = async (req, res) => {
    const pedidos = await poblar(Pedido.find()).sort({ createdAt: -1 }).lean()
    res.json(await serializar(pedidos, req.usuario.permisos))
}

// PATCH /api/pedidos/:id/estado  { codigo | estado, motivo? }
// Cada transición exige su permiso (ver src/libs/estados.js); cancelar pide motivo.
export const cambiarEstadoPedido = async (req, res) => {
    const pedido = await Pedido.findById(req.params.id).populate('estado', 'codigo')
    if (!pedido) throw notFound('Pedido no encontrado')

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
