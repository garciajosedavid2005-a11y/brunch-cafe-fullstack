// Migración 2.1: permisos de cocina y barra (Fase 2) en BDs existentes.
//
// El seed solo asigna permisos al crear un rol de staff, así que los roles ya creados siguen sin
// las claves nuevas de la Fase 2 (F2-2, F2-3, F2-5).
// up (no destructiva, idempotente), con el criterio de «estado exacto esperado» de la 1.1:
//   - Solo si el rol no tiene NINGUNA de las claves de la Fase 2 (una BD anterior a 2.1): se las
//     agrega, conservando el resto de sus permisos, y guarda en `_migracion21` lo que agregó.
//   - Si ya las tiene todas (sembrado con 2.1 o asignadas a mano): no lo toca.
//   - Si tiene algunas: el admin ya decidió (p. ej. quitó `producto:agotar` al mesero a propósito);
//     no lo toca y lo informa.
//   - La escritura es condicional (sin la marca y aún sin ninguna de las claves): si el admin cambia
//     el rol entre la lectura y la escritura, no se toca (`cambio-concurrente`).
// down
//   - Quita solo las claves que agregó up y la marca (aunque el admin las haya conservado a
//     propósito después: --down --dry-run las lista antes).
export const MARCA = '_migracion21'

// Copia fija (no se importa del catálogo): si el catálogo cambia después, esta migración sigue
// haciendo exactamente lo mismo
export const PERMISOS_FASE_2 = {
    mesero: ['item:servir', 'producto:agotar'],
    cocina: ['kds:ver', 'item:preparar', 'pedido:preparar', 'producto:agotar', 'producto:reactivar'],
    barista: ['kds:ver', 'item:preparar', 'pedido:preparar', 'producto:agotar', 'producto:reactivar'],
}

const roles = (db) => db.collection('rols')

const planUp = async (db, nombre) => {
    const rol = await roles(db).findOne({ nombre })
    if (!rol) return { nombre, accion: 'sin-rol', permisos: [], agregar: [] }
    const permisos = rol.permisos || []
    const base = { nombre, _id: rol._id, permisos, agregar: [] }
    if (rol[MARCA]) return { ...base, accion: 'ya-aplicada' }
    const nuevas = PERMISOS_FASE_2[nombre]
    const tiene = nuevas.filter((p) => permisos.includes(p))
    if (tiene.length === nuevas.length) return { ...base, accion: 'sin-cambios' }
    if (tiene.length) return { ...base, accion: 'personalizado' }
    return { ...base, accion: 'agregar', agregar: nuevas }
}

export const up = async (db, { dryRun = false } = {}) => {
    const resultado = []
    for (const nombre of Object.keys(PERMISOS_FASE_2)) {
        const { _id, ...plan } = await planUp(db, nombre)
        let aplicado = false
        if (plan.accion === 'agregar' && !dryRun) {
            const r = await roles(db).updateOne(
                { _id, [MARCA]: { $exists: false }, permisos: { $nin: PERMISOS_FASE_2[nombre] } },
                { $addToSet: { permisos: { $each: plan.agregar } }, $set: { [MARCA]: plan.agregar } },
            )
            aplicado = r.modifiedCount === 1
            if (!aplicado) plan.accion = 'cambio-concurrente'
        }
        resultado.push({ ...plan, aplicado })
    }
    return { roles: resultado }
}

export const down = async (db, { dryRun = false } = {}) => {
    const resultado = []
    for (const nombre of Object.keys(PERMISOS_FASE_2)) {
        const rol = await roles(db).findOne({ nombre, [MARCA]: { $exists: true } })
        if (!rol) {
            resultado.push({ nombre, aplicado: false, quitar: [] })
            continue
        }
        const quitar = rol[MARCA]
        let aplicado = false
        if (!dryRun) {
            const r = await roles(db).updateOne(
                { _id: rol._id, [MARCA]: { $exists: true } },
                { $pull: { permisos: { $in: quitar } }, $unset: { [MARCA]: 1 } },
            )
            aplicado = r.modifiedCount === 1
        }
        resultado.push({ nombre, aplicado, quitar })
    }
    return { roles: resultado }
}
