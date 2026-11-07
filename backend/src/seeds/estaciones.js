import Estacion, { COLACION_NOMBRE } from '../modulos/catalogo/estacion.model.js'
import { slug } from '../modulos/compartido/utils.js'

// 1.3 · Estaciones iniciales (F1-3). Se siembran con `npm run seed:base` (y seed:menu las asegura):
// crea las que falten por código y no toca las existentes (nombre o «activa» editados en el admin).
export const ESTACIONES = [
    { codigo: 'cocina', nombre: 'Cocina' },
    { codigo: 'barra', nombre: 'Barra' },
]

/** F1-3: las categorías de bebidas van a Barra; el resto, a Cocina (sin mayúsculas ni tildes). */
export const codigoEstacionPorCategoria = (nombre) => (/(^|-)bebidas?(-|$)/.test(slug(nombre)) ? 'barra' : 'cocina')

export const sembrarEstaciones = async () => {
    const resumen = { creadas: 0, existentes: 0 }
    for (const { codigo, nombre } of ESTACIONES) {
        try {
            const r = await Estacion.updateOne({ codigo }, { $setOnInsert: { codigo, nombre, activa: true } }, { upsert: true })
            resumen[r.upsertedCount === 1 ? 'creadas' : 'existentes'] += 1
        } catch (error) {
            if (error?.code !== 11000) throw error
            // Dos seeds a la vez: la otra ejecución la creó. Si no existe, el nombre lo usa otra estación
            if (await Estacion.exists({ codigo })) {
                resumen.existentes += 1
                continue
            }
            const otra = await Estacion.findOne({ nombre }).collation(COLACION_NOMBRE).select('codigo').lean()
            throw new Error(`No se puede crear la estación «${nombre}»: ese nombre ya lo usa la estación con código «${otra?.codigo}». Renómbrala.`)
        }
    }
    return resumen
}
