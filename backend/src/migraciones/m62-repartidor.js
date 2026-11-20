// Migración 6.2 (F6-2): repartidor asignado a cada domicilio. Solo AGREGA:
//   - permisos: `pedido:asignar_repartidor` al cajero y `pedido:entregar` al repartidor, en roles ya creados (el
//     seed solo los da al crear el rol). Por rol, solo si no tiene ninguna de sus claves; guarda en `_migracion62` lo
//     que agregó. Si ya las tiene, no lo toca. Idempotente.
//   - índice `pedidos.repartidor_estado` ({ repartidor: 1, estado: 1 }) si no existe (el modelo usa el mismo nombre,
//     así que si el servidor ya lo creó, no hay nada que hacer).
// down quita los permisos que marcó up y el índice por su nombre (como las migraciones 4 y 5): si lo había creado el
// servidor al arrancar, down lo quita igual y el modelo lo vuelve a crear al arrancar de nuevo. No toca pedidos.
export const MARCA = '_migracion62'
// Copia fija: si el catálogo cambia después, esta migración sigue haciendo lo mismo
export const PERMISOS_FASE_62 = {
    cajero: ['pedido:asignar_repartidor'],
    repartidor: ['pedido:entregar'],
}
export const INDICE = { nombre: 'repartidor_estado', clave: { repartidor: 1, estado: 1 } }
const roles = (db) => db.collection('rols')
const tieneIndice = async (db) => {
    const existe = (await db.listCollections({ name: 'pedidos' }).toArray()).length > 0
    return existe && (await db.collection('pedidos').indexes()).some((i) => i.name === INDICE.nombre)
}

export const up = async (db, { dryRun = false } = {}) => {
    const resultado = []
    for (const [nombre, nuevas] of Object.entries(PERMISOS_FASE_62)) {
        const rol = await roles(db).findOne({ nombre })
        let accion = 'agregar'
        if (!rol) accion = 'sin-rol'
        else if (rol[MARCA]) accion = 'ya-aplicada'
        else if (nuevas.some((p) => (rol.permisos || []).includes(p))) accion = 'sin-cambios'
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
    const crearIndice = !(await tieneIndice(db))
    if (crearIndice && !dryRun) await db.collection('pedidos').createIndex(INDICE.clave, { name: INDICE.nombre })
    return { roles: resultado, indice: { crear: crearIndice, aplicado: crearIndice && !dryRun } }
}

export const down = async (db, { dryRun = false } = {}) => {
    const resultado = []
    for (const nombre of Object.keys(PERMISOS_FASE_62)) {
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
    const quitarIndice = await tieneIndice(db)
    if (quitarIndice && !dryRun) await db.collection('pedidos').dropIndex(INDICE.nombre)
    return { roles: resultado, indice: { quitar: quitarIndice, aplicado: quitarIndice && !dryRun } }
}
