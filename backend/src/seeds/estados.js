// Seed idempotente del catálogo de estados (lo ejecuta el servidor al arrancar).
// - Crea los estados que falten (con la etiqueta y colores por defecto).
// - Fuerza `esFinal` y `orden` desde el catálogo; no pisa etiqueta, descripción
//   ni colores que el admin haya editado.
import Estado from '../modulos/compartido/estado.model.js'
import { CATALOGO_ESTADOS, TIPOS_ESTADO, ordenDe } from '../modulos/compartido/estados.js'

export class MigracionPendienteError extends Error {
    constructor(cantidad) {
        super(`Hay ${cantidad} estado(s) sin "codigo" (datos anteriores a 0.7). Ejecuta primero: npm run migrate:0.7 -- --dry-run y luego npm run migrate:0.7`)
        this.name = 'MigracionPendienteError'
    }
}

export const sembrarEstados = async () => {
    const sinCodigo = await Estado.countDocuments({ codigo: { $exists: false } })
    if (sinCodigo > 0) throw new MigracionPendienteError(sinCodigo)

    const operaciones = TIPOS_ESTADO.flatMap((tipo) =>
        CATALOGO_ESTADOS[tipo].map(({ codigo, esFinal, ...presentacion }) => ({
            updateOne: {
                filter: { tipo, codigo },
                update: {
                    $set: { esFinal, orden: ordenDe(tipo, codigo) },
                    $setOnInsert: { tipo, codigo, ...presentacion },
                },
                upsert: true,
            },
        }))
    )
    await Estado.bulkWrite(operaciones, { ordered: true })
    return TIPOS_ESTADO.map((tipo) => `${tipo}: ${CATALOGO_ESTADOS[tipo].length}`)
}
