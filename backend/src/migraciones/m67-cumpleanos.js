// Migración 6.7 (F6-6): crea los índices de la colección nueva `usos_cumpleanos`: un uso vigente por usuario y año, y
// un uso vigente por referencia (también la búsqueda para liberarlo). Solo agrega: crea los que faltan y se detiene si
// uno existe con otras opciones. down los quita solo si la colección está vacía (con usos, los únicos impiden aplicar el
// descuento dos veces); un cobro hecho a la vez que un down podría colarse entre el conteo y el borrado: se acepta
// (down es manual y se hace con el servidor detenido).
export const INDICES_CUMPLEANOS = [
    { clave: { usuario: 1, anio: 1 }, opciones: { unique: true, partialFilterExpression: { vigente: true }, name: 'un_uso_vigente_por_anio' } },
    { clave: { 'referencia.id': 1 }, opciones: { unique: true, partialFilterExpression: { vigente: true }, name: 'una_vez_por_referencia' } },
]
export const NOMBRES = INDICES_CUMPLEANOS.map((i) => i.opciones.name)

const usos = (db) => db.collection('usos_cumpleanos')
const existentes = async (db) => ((await db.listCollections({ name: 'usos_cumpleanos' }).toArray()).length
    ? (await usos(db).indexes()).map((i) => i.name) : [])

export const up = async (db, { dryRun = false } = {}) => {
    const hay = await existentes(db)
    // Uno con el mismo nombre pero otras opciones (sin único o sin el filtro parcial) no protege lo mismo: se detiene
    if (hay.length) {
        for (const existente of await usos(db).indexes()) {
            const esperado = INDICES_CUMPLEANOS.find((i) => i.opciones.name === existente.name)
            if (esperado && (!existente.unique || JSON.stringify(existente.partialFilterExpression) !== JSON.stringify(esperado.opciones.partialFilterExpression))) {
                throw new Error(`El índice ${existente.name} ya existe con otras opciones; revísalo antes de migrar.`)
            }
        }
    }
    const crear = NOMBRES.filter((n) => !hay.includes(n))
    if (!dryRun) for (const i of INDICES_CUMPLEANOS) if (crear.includes(i.opciones.name)) await usos(db).createIndex(i.clave, i.opciones)
    return { crear, aplicado: !dryRun && crear.length > 0 }
}

export const down = async (db, { dryRun = false } = {}) => {
    const hay = await existentes(db)
    const vacia = hay.length === 0 || (await usos(db).countDocuments()) === 0
    const quitar = vacia ? NOMBRES.filter((n) => hay.includes(n)) : []
    if (!dryRun) for (const n of quitar) await usos(db).dropIndex(n)
    return { quitar, aplicado: !dryRun && quitar.length > 0, bloqueo: vacia ? null : 'la colección tiene usos' }
}
