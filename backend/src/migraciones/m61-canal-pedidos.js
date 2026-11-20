// Migración 6.1 (pendiente de 1.9, F6-4): rellena `canal: 'domicilio'` SOLO en los pedidos que no lo tienen
// (campo ausente o null). No toca ningún otro campo ni ningún pedido que ya tenga canal.
// Para que la reversión sea exacta, up anota cada pedido rellenado (y si el campo faltaba o era null) en la
// colección nueva `migracion_6_1_canal`; down deja esos pedidos como estaban y borra solo esa colección.
// Idempotente: un segundo up no encuentra pedidos sin canal; un segundo down no encuentra anotaciones.
export const COLECCION_REGISTRO = 'migracion_6_1_canal'
const SIN_CANAL = { $or: [{ canal: { $exists: false } }, { canal: null }] }

export const up = async (db, { dryRun = false } = {}) => {
    const pedidos = db.collection('pedidos')
    const pendientes = await pedidos.find(SIN_CANAL, { projection: { _id: 1, canal: 1 } }).toArray()
    if (dryRun || !pendientes.length) return { rellenar: pendientes.length, aplicado: false }
    const registro = db.collection(COLECCION_REGISTRO)
    // Primero la anotación (si algo falla a mitad, down sabe qué deshacer); upsert por id: repetir no duplica
    await registro.bulkWrite(pendientes.map((p) => ({
        updateOne: { filter: { _id: p._id }, update: { $set: { antes: 'canal' in p ? 'null' : 'ausente' } }, upsert: true },
    })))
    const r = await pedidos.updateMany({ _id: { $in: pendientes.map((p) => p._id) }, ...SIN_CANAL }, { $set: { canal: 'domicilio' } })
    return { rellenar: pendientes.length, aplicado: r.modifiedCount > 0 }
}

export const down = async (db, { dryRun = false } = {}) => {
    const registro = db.collection(COLECCION_REGISTRO)
    const anotados = await registro.find({}).toArray()
    if (dryRun || !anotados.length) return { revertir: anotados.length, aplicado: false }
    const pedidos = db.collection('pedidos')
    const ids = (antes) => anotados.filter((a) => a.antes === antes).map((a) => a._id)
    // Solo los que siguen con el valor que puso up
    await pedidos.updateMany({ _id: { $in: ids('ausente') }, canal: 'domicilio' }, { $unset: { canal: '' } })
    await pedidos.updateMany({ _id: { $in: ids('null') }, canal: 'domicilio' }, { $set: { canal: null } })
    await registro.drop()
    return { revertir: anotados.length, aplicado: true }
}
