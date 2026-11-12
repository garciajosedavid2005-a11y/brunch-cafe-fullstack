import Zona from '../modulos/salon/zona.model.js'
import Mesa from '../modulos/salon/mesa.model.js'
import { conTransaccion } from '../modulos/compartido/transacciones.js'

// 1.2 · Salón de ejemplo (F1-1): Interior y Terraza con mesas de 2 y 4 personas, marcado como
// ejemplo (`ejemplo: true`) para que el admin lo reemplace por los datos reales en Admin › Salón.
// Solo se siembra si todavía no hay ninguna zona: nunca pisa ni completa lo que el admin creó.
const EJEMPLO = [
    {
        zona: { nombre: 'Interior', orden: 1 },
        mesas: [
            { numero: 1, capacidad: 2, combinable: true },
            { numero: 2, capacidad: 2, combinable: true },
            { numero: 3, capacidad: 4, combinable: true },
            { numero: 4, capacidad: 4, combinable: false }, // fija (p. ej. un sofá): ejemplo de mesa que no se une
        ],
    },
    {
        zona: { nombre: 'Terraza', orden: 2 },
        mesas: [
            { numero: 5, capacidad: 2, combinable: true }, // revisión de 1.6: las de 2 puestos se juntan
            { numero: 6, capacidad: 4, combinable: true },
            { numero: 7, capacidad: 4, combinable: true },
        ],
    },
]

const NADA = { creado: false, zonas: 0, mesas: 0 }

export const sembrarSalonEjemplo = async () => {
    try {
        return await conTransaccion(async (session) => {
            // Dentro de la transacción: dos seeds a la vez chocan y el reintento ve las zonas
            if (await Zona.exists({}).session(session)) return NADA
            return crearEjemplo(session)
        })
    } catch (error) {
        if (error?.code === 11000) return NADA // el otro seed ganó la carrera
        throw error
    }
}

const crearEjemplo = async (session) => {
    let mesas = 0
    for (const { zona, mesas: lista } of EJEMPLO) {
        const [creada] = await Zona.create([{ ...zona, ejemplo: true }], { session })
        await Mesa.create(lista.map((m) => ({ ...m, zona: creada._id, ejemplo: true })), { session, ordered: true })
        mesas += lista.length
    }
    return { creado: true, zonas: EJEMPLO.length, mesas }
}
