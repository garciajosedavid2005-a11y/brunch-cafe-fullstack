// Los estados ya no se crean aquí: los siembra src/seeds/estados.js al arrancar (0.7)
import MetodoPago from '../models/metodoPago.model.js'

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
