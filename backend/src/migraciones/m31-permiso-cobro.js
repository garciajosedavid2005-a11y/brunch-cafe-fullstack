// Migración 3.1: permiso de cobro (Fase 3, F3-1) para el rol cajero en BDs existentes.
//
// El seed solo asigna permisos al crear un rol de staff, así que el cajero ya creado no tiene
// `cuenta:cobrar`. Mismo criterio que la 2.1 (estado exacto esperado, escritura condicional y marca):
//   - up: solo si el cajero no tiene la clave, se la agrega (conservando sus demás permisos) y guarda en
//     `_migracion31` lo que agregó; si ya la tiene, no lo toca. Idempotente.
//   - down: quita solo lo que agregó up y la marca.
// No toca ningún otro rol (el admin cobra por «*»).
export const MARCA = '_migracion31'

// Copia fija (no se importa del catálogo): si el catálogo cambia después, esta migración sigue
// haciendo exactamente lo mismo
export const PERMISOS_FASE_3 = {
    cajero: ['cuenta:cobrar'],
}

const roles = (db) => db.collection('rols')

const planUp = async (db, nombre) => {
    const rol = await roles(db).findOne({ nombre })
    if (!rol) return { nombre, accion: 'sin-rol', permisos: [], agregar: [] }
    const permisos = rol.permisos || []
    const base = { nombre, _id: rol._id, permisos, agregar: [] }
    if (rol[MARCA]) return { ...base, accion: 'ya-aplicada' }
    const nuevas = PERMISOS_FASE_3[nombre]
    const tiene = nuevas.filter((p) => permisos.includes(p))
    if (tiene.length === nuevas.length) return { ...base, accion: 'sin-cambios' }
    if (tiene.length) return { ...base, accion: 'personalizado' }
    return { ...base, accion: 'agregar', agregar: nuevas }
}

export const up = async (db, { dryRun = false } = {}) => {
    const resultado = []
    for (const nombre of Object.keys(PERMISOS_FASE_3)) {
        const { _id, ...plan } = await planUp(db, nombre)
        let aplicado = false
        if (plan.accion === 'agregar' && !dryRun) {
            const r = await roles(db).updateOne(
                { _id, [MARCA]: { $exists: false }, permisos: { $nin: PERMISOS_FASE_3[nombre] } },
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
    for (const nombre of Object.keys(PERMISOS_FASE_3)) {
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
