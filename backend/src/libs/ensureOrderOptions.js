import Estado from '../models/estado.model.js'
import MetodoPago from '../models/metodoPago.model.js'

const ORDER_STATES = [
    {
        nombre: 'Pendiente',
        tipo: 'pedido',
        descripcion: 'Pedido recibido y pendiente de confirmación.',
        color: '#b78103',
        bg: '#fff8e1',
        badgeType: 'warning',
    },
    {
        nombre: 'Confirmado',
        tipo: 'pedido',
        descripcion: 'El café confirmó y está preparando el pedido.',
        color: '#345b88',
        bg: '#eaf1fa',
        badgeType: 'info',
    },
    {
        nombre: 'Recibido',
        tipo: 'pedido',
        descripcion: 'El cliente recibió su pedido.',
        color: '#346d34',
        bg: '#e8f4e8',
        badgeType: 'success',
        esFinal: true,
    },
]

const PAYMENT_METHODS = [
    {
        nombre: 'Contra Entrega',
        descripcion: 'Paga en efectivo cuando recibas tu pedido.',
        codigo: 'contra-entrega',
        icono: 'Banknote',
    },
    {
        nombre: 'Tarjeta débito',
        descripcion: 'Paga al recibir con datáfono. No solicitamos datos de tarjeta en la web.',
        codigo: 'tarjeta-debito',
        icono: 'CreditCard',
    },
    {
        nombre: 'Tarjeta crédito',
        descripcion: 'Paga al recibir con datáfono. No solicitamos datos de tarjeta en la web.',
        codigo: 'tarjeta-credito',
        icono: 'CreditCard',
    },
]

export const ensureOrderStates = async () => Promise.all(
    ORDER_STATES.map(({ nombre, tipo, ...defaults }) =>
        Estado.findOneAndUpdate(
            { nombre, tipo },
            { $setOnInsert: { nombre, tipo, ...defaults } },
            { new: true, upsert: true, setDefaultsOnInsert: true }
        )
    )
)

export const ensureOrderPaymentMethods = async () => Promise.all(
    PAYMENT_METHODS.map(async (defaults) => {
        const method = await MetodoPago.findOne({
            $or: [{ codigo: defaults.codigo }, { nombre: defaults.nombre }],
        })
            .collation({ locale: 'es', strength: 1 })

        if (method) {
            if (
                !method.descripcion ||
                (defaults.codigo === 'contra-entrega' && method.descripcion === 'Pago al recibir el pedido')
            ) {
                method.descripcion = defaults.descripcion
                await method.save()
            }
            return method
        }

        return MetodoPago.create(defaults)
    })
)
