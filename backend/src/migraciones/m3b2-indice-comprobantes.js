// Migración 3b.2: índice único de comprobantes por cuenta y parte (división de cuenta, Fase 3b).
//
// Antes: { cuenta } único (un comprobante por cuenta). Ahora una cuenta dividida tiene un comprobante por
// parte: { cuenta, parte.numero } único (la cuenta entera es la parte null, así que sigue sin poder cobrarse
// dos veces). No toca ningún documento: solo índices.
//   - up: crea el índice nuevo y después quita el viejo (nunca queda sin protección). Idempotente.
//   - down: si alguna cuenta ya tiene varias partes no revierte (el índice viejo no podría crearse); si no,
//     vuelve a crear el viejo y quita el nuevo.
export const VIEJO = 'cuenta_1'
export const NUEVO = 'una_parte_por_cuenta'

const coleccion = (db) => db.collection('comprobantes')

const indices = async (db) => {
    try {
        return await coleccion(db).indexes()
    } catch (error) {
        if (error?.codeName === 'NamespaceNotFound' || error?.code === 26) return [] // aún no hay comprobantes
        throw error
    }
}

export const up = async (db, { dryRun = false } = {}) => {
    const actuales = await indices(db)
    const plan = {
        crear: !actuales.some((i) => i.name === NUEVO),
        quitar: actuales.some((i) => i.name === VIEJO),
    }
    if (!dryRun) {
        if (plan.crear) await coleccion(db).createIndex({ cuenta: 1, 'parte.numero': 1 }, { unique: true, name: NUEVO })
        if (plan.quitar) await coleccion(db).dropIndex(VIEJO)
    }
    return { ...plan, aplicado: !dryRun && (plan.crear || plan.quitar) }
}

export const down = async (db, { dryRun = false } = {}) => {
    const actuales = await indices(db)
    const [repetida] = await coleccion(db).aggregate([
        { $group: { _id: '$cuenta', n: { $sum: 1 } } }, { $match: { n: { $gt: 1 } } }, { $limit: 1 },
    ]).toArray()
    // También con una sola parte cobrada (la siguiente chocaría con el índice viejo)
    const conParte = await coleccion(db).findOne({ parte: { $ne: null } }, { projection: { _id: 1 } })
    if (repetida || conParte) return { crear: false, quitar: false, aplicado: false, bloqueo: 'hay cuentas cobradas por partes' }
    const plan = {
        crear: !actuales.some((i) => i.name === VIEJO),
        quitar: actuales.some((i) => i.name === NUEVO),
    }
    if (!dryRun) {
        if (plan.crear) await coleccion(db).createIndex({ cuenta: 1 }, { unique: true, name: VIEJO })
        if (plan.quitar) await coleccion(db).dropIndex(NUEVO)
    }
    return { ...plan, aplicado: !dryRun && (plan.crear || plan.quitar) }
}
