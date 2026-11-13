import mongoose from 'mongoose'
import { entero, MAX_MODIFICADORES_POR_ITEM, MAX_NOTA_ITEM, modificadorElegidoSchema } from '../catalogo/modificadorElegido.schema.js'

// Las líneas son una copia inmutable del momento del pedido: solo se crean (insertMany valida y corre
// el pre('validate')); nada las actualiza después.

const detallePedidoSchema = new mongoose.Schema({
    pedido: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Pedido',
        required: true
    },
    // Referencia real al producto (0.6). Las líneas antiguas la reciben con migrate:0.6.
    producto: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Producto',
        required: true
    },
    // Código numérico del producto en el momento del pedido (se conserva)
    productoId: {
        type: Number,
        min: 1,
    },
    nombreProducto: {
        type: String,
        required: true
    },
    // Precio base del producto en el momento del pedido (sin recargos)
    precioProducto: {
        type: Number,
        required: true,
        min: 0,
        validate: entero('El precio')
    },
    // 1.12 · Opciones elegidas con su recargo (copia del momento, F1-14), nota y precio con recargos.
    // Sin migración: las líneas anteriores no los tienen y se leen como sin opciones, sin nota y
    // con precioUnitario = precioProducto.
    modificadores: {
        type: [modificadorElegidoSchema],
        default: [],
        validate: { validator: (v) => v.length <= MAX_MODIFICADORES_POR_ITEM, message: `Una línea admite hasta ${MAX_MODIFICADORES_POR_ITEM} opciones` }
    },
    nota: {
        type: String,
        trim: true,
        maxlength: MAX_NOTA_ITEM,
        default: ''
    },
    // 2.3 · Estación del momento del pedido (como los ítems de la comanda, F1-14): el KDS la usa y un
    // cambio del catálogo no mueve los pedidos en curso. Sin ella (pedidos anteriores) se lee del catálogo
    estacion: {
        type: new mongoose.Schema({
            id: { type: mongoose.Schema.Types.ObjectId, ref: 'Estacion', required: true },
            codigo: { type: String, required: true, trim: true, maxlength: 30 },
            nombre: { type: String, required: true, trim: true, maxlength: 40 },
        }, { _id: false }),
        default: null,
    },
    // Obligatorio en las líneas nuevas; las anteriores a 1.12 no se vuelven a validar
    precioUnitario: {
        type: Number,
        required: function () { return this.isNew },
        min: 0,
        validate: entero('El precio unitario')
    },
    cantidad: {
        type: Number,
        required: true,
        min: 1
    },
    subtotal: {
        type: Number,
        required: true,
        min: 0,
        validate: entero('El subtotal')
    }
}, {
    timestamps: true
})

// Las líneas de un pedido (Mis pedidos, panel del staff y detalle)
detallePedidoSchema.index({ pedido: 1 })

// 1.12 · Montos coherentes en las líneas nuevas: unitario = base + Σ recargos; subtotal = unitario × cantidad
detallePedidoSchema.pre('validate', function () {
    if (this.precioUnitario == null) return
    const recargos = (this.modificadores || []).reduce((suma, m) => suma + m.precioExtra, 0)
    if (this.precioUnitario !== this.precioProducto + recargos) {
        this.invalidate('precioUnitario', 'El precio unitario debe ser el precio base más los recargos')
    }
    if (this.subtotal !== this.precioUnitario * this.cantidad) {
        this.invalidate('subtotal', 'El subtotal debe ser el precio unitario por la cantidad')
    }
})

export default mongoose.model('DetallePedido', detallePedidoSchema)