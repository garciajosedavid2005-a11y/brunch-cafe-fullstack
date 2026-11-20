// Migración 6.5 (F6-a): agrega `cliente:identificar` al mesero y al cajero en roles ya creados (el seed solo lo da al
// crear el rol). Por rol, solo si aún no lo tiene; guarda en `_migracion65` lo que agregó. Idempotente; no modifica ni
// borra nada más. down quita solo lo que marcó up (un rol que ya lo tenía lo conserva).
export const MARCA = '_migracion65'
// Copia fija: si el catálogo cambia después, esta migración sigue haciendo lo mismo
export const PERMISOS_FASE_65 = {
    mesero: ['cliente:identificar'],
    cajero: ['cliente:identificar'],
}

const roles = (db) => db.collection('rols')

export const up = async (db, { dryRun = false } = {}) => {
    const resultado = []
    for (const [nombre, nuevas] of Object.entries(PERMISOS_FASE_65)) {
        const rol = await roles(db).findOne({ nombre })
        let accion = 'agregar'
        if (!rol) accion = 'sin-rol'
        else if (rol[MARCA]) accion = 'ya-aplicada'
        else if (nuevas.every((p) => (rol.permisos || []).includes(p))) accion = 'sin-cambios'
        let aplicado = false
        if (accion === 'agregar' && !dryRun) {
            const r = await roles(db).updateOne(
                { _id: rol._id, [MARCA]: { $exists: false }, permisos: { $nin: nuevas } },
                { $addToSet: { permisos: { $each: nuevas } }, $set: { [MARCA]: nuevas } },
            )
            aplicado = r.modifiedCount === 1
            if (!aplicado) accion = 'cambio-concurrente'
        }
        resultado.push({ nombre, accion, agregar: accion === 'agregar' ? nuevas : [], aplicado })
    }
    return { roles: resultado }
}

export const down = async (db, { dryRun = false } = {}) => {
    const resultado = []
    for (const nombre of Object.keys(PERMISOS_FASE_65)) {
        const rol = await roles(db).findOne({ nombre, [MARCA]: { $exists: true } })
        if (!rol) {
            resultado.push({ nombre, quitar: [], aplicado: false })
            continue
        }
        let aplicado = false
        if (!dryRun) {
            const r = await roles(db).updateOne({ _id: rol._id, [MARCA]: { $exists: true } }, { $pull: { permisos: { $in: rol[MARCA] } }, $unset: { [MARCA]: 1 } })
            aplicado = r.modifiedCount === 1
        }
        resultado.push({ nombre, quitar: rol[MARCA], aplicado })
    }
    return { roles: resultado }
}
