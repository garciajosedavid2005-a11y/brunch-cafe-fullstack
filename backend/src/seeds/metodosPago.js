// Métodos de pago iniciales. Se siembran con `npm run seed:base` (antes se
// creaban en cada petición, lo que hacía reaparecer los que el admin borraba).
import MetodoPago from '../modulos/pedidos/metodoPago.model.js'

export const METODOS_PAGO = [
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

// Descripción que traían las BD antiguas para contra entrega (se reemplaza por la actual)
const DESCRIPCION_ANTIGUA = 'Pago al recibir el pedido'

/**
 * Crea los métodos que falten (por código o por nombre, sin distinguir tildes ni
 * mayúsculas). De los existentes solo completa una descripción vacía o la antigua;
 * no toca nada más. Idempotente.
 */
export const sembrarMetodosPago = async () => {
    const resumen = { creados: 0, existentes: 0 }
    for (const datos of METODOS_PAGO) {
        const metodo = await MetodoPago.findOne({ $or: [{ codigo: datos.codigo }, { nombre: datos.nombre }] })
            .collation({ locale: 'es', strength: 1 })
        if (!metodo) {
            await MetodoPago.create(datos)
            resumen.creados += 1
            continue
        }
        resumen.existentes += 1
        if (!metodo.descripcion || (datos.codigo === 'contra-entrega' && metodo.descripcion === DESCRIPCION_ANTIGUA)) {
            metodo.descripcion = datos.descripcion
            await metodo.save()
        }
    }
    return resumen
}
