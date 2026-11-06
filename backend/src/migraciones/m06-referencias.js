// Migración 0.6: referencias a productos por ObjectId.
//
// up (no destructiva)
//   - detallepedidos y comentarios (tipo producto) que solo tienen el código
//     numérico `productoId` reciben `producto` = _id del Producto con ese código.
//   - Conserva `productoId` y marca cada documento tocado con `_migracion06`.
//   - Si algún código no corresponde a ningún producto, no adivina: no escribe
//     nada y lo lista.
//   - No toca la colección heredada `reviews` (se decide en 0.12).
// down
//   - Quita `producto` y `_migracion06` solo de los documentos que marcó up.
export const MARCA = '_migracion06'

const COLECCIONES = {
    detallepedidos: { filtro: {}, nombre: (d) => d.nombreProducto },
    comentarios: { filtro: { tipo: 'producto' }, nombre: () => undefined },
}

const planColeccion = async (db, coleccion, idPorCodigo) => {
    const { filtro, nombre } = COLECCIONES[coleccion]
    const docs = await db.collection(coleccion)
        .find({ ...filtro }, { projection: { producto: 1, productoId: 1, nombreProducto: 1 } })
        .toArray()
    const plan = { completar: 0, yaTenian: 0, sinCodigo: 0, sinProducto: [], operaciones: [] }
    const huérfanos = new Map()
    for (const doc of docs) {
        if (doc.producto) {
            plan.yaTenian += 1
            continue
        }
        if (!Number.isInteger(doc.productoId)) {
            plan.sinCodigo += 1
            continue
        }
        const producto = idPorCodigo.get(doc.productoId)
        if (!producto) {
            const previo = huérfanos.get(doc.productoId) || { productoId: doc.productoId, documentos: 0, nombre: nombre(doc) }
            previo.documentos += 1
            huérfanos.set(doc.productoId, previo)
            continue
        }
        plan.completar += 1
        plan.operaciones.push({
            updateOne: {
                filter: { _id: doc._id, producto: { $exists: false } },
                update: { $set: { producto, [MARCA]: { en: new Date(), productoId: doc.productoId } } },
            },
        })
    }
    plan.sinProducto = [...huérfanos.values()].sort((a, b) => a.productoId - b.productoId)
    return plan
}

/** Simula (dryRun) o aplica up. Devuelve el plan por colección. */
export const up = async (db, { dryRun = false } = {}) => {
    const productos = await db.collection('productos').find({}, { projection: { codigo: 1 } }).toArray()
    const idPorCodigo = new Map(productos.filter((p) => Number.isInteger(p.codigo)).map((p) => [p.codigo, p._id]))
    const resultado = { aplicado: false }
    for (const coleccion of Object.keys(COLECCIONES)) {
        resultado[coleccion] = await planColeccion(db, coleccion, idPorCodigo)
    }
    resultado.puedeAplicar = Object.keys(COLECCIONES).every((c) => resultado[c].sinProducto.length === 0)
    if (!dryRun && resultado.puedeAplicar) {
        for (const coleccion of Object.keys(COLECCIONES)) {
            const { operaciones } = resultado[coleccion]
            if (operaciones.length) await db.collection(coleccion).bulkWrite(operaciones)
        }
        resultado.aplicado = true
    }
    for (const coleccion of Object.keys(COLECCIONES)) delete resultado[coleccion].operaciones
    return resultado
}

/** Quita solo lo que puso up (documentos con la marca). */
export const down = async (db, { dryRun = false } = {}) => {
    const resultado = { aplicado: false, puedeAplicar: true }
    for (const coleccion of Object.keys(COLECCIONES)) {
        const filtro = { [MARCA]: { $exists: true } }
        resultado[coleccion] = dryRun
            ? await db.collection(coleccion).countDocuments(filtro)
            : (await db.collection(coleccion).updateMany(filtro, { $unset: { producto: '', [MARCA]: '' } })).modifiedCount
    }
    resultado.aplicado = !dryRun
    return resultado
}
