// Migración 6.6 (F6-a, F6-5): agrega `puntos:canjear` al cajero en roles ya creados (el seed solo lo da al crear el
// rol) y crea los índices de la colección nueva `movimientos_puntos`. Solo agrega: por rol, si aún no lo tiene (marca
// `_migracion66`); los índices, si faltan. down quita el permiso que marcó up y los índices que creó.
export const MARCA = '_migracion66'
// Copia fija: si el catálogo cambia después, esta migración sigue haciendo lo mismo
export const PERMISOS_FASE_66 = {
    cajero: ['puntos:canjear'],
}

const roles = (db) => db.collection('rols')
export const INDICES_PUNTOS = [
    { clave: { tipo: 1, 'referencia.id': 1 }, opciones: { unique: true, name: 'una_vez_por_referencia' } },
    { clave: { usuario: 1, createdAt: -1 }, opciones: { name: 'usuario_1_createdAt_-1' } },
]
const movimientos = (db) => db.collection('movimientos_puntos')
const nombresIndices = async (db) => {
    const existe = (await db.listCollections({ name: 'movimientos_puntos' }).toArray()).length > 0
    return existe ? (await movimientos(db).indexes()).map((i) => i.name) : []
}

export const up = async (db, { dryRun = false } = {}) => {
    const resultado = []
    for (const [nombre, nuevas] of Object.entries(PERMISOS_FASE_66)) {
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
    const existentes = await nombresIndices(db)
    const crear = INDICES_PUNTOS.filter((i) => !existentes.includes(i.opciones.name)).map((i) => i.opciones.name)
    if (!dryRun) for (const i of INDICES_PUNTOS) if (crear.includes(i.opciones.name)) await movimientos(db).createIndex(i.clave, i.opciones)
    return { roles: resultado, indices: { crear, aplicado: !dryRun && crear.length > 0 } }
}

export const down = async (db, { dryRun = false } = {}) => {
    const resultado = []
    for (const nombre of Object.keys(PERMISOS_FASE_66)) {
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
    // Los índices se quitan solo si la colección está vacía (con movimientos, el único protege los saldos)
    const existentes = await nombresIndices(db)
    const vacia = existentes.length === 0 || (await movimientos(db).countDocuments()) === 0
    const quitar = vacia ? INDICES_PUNTOS.map((i) => i.opciones.name).filter((n) => existentes.includes(n)) : []
    if (!dryRun) for (const n of quitar) await movimientos(db).dropIndex(n)
    return { roles: resultado, indices: { quitar, aplicado: !dryRun && quitar.length > 0, bloqueo: vacia ? null : 'la colección tiene movimientos' } }
}
