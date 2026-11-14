// Migración 3.7: opción por defecto de los grupos de opción única ya guardados (3.7.1).
//
// Solo AGREGA la marca `porDefecto: true` a una opción de dos grupos: Leche → Entera y Tamaño → Normal
// (decisión de Brayan). Mismo criterio que las anteriores (estado exacto esperado, escritura condicional
// y marca):
//   - up: solo si el grupo existe, sigue siendo de opción única (máximo 1), tiene esa opción y ninguna
//     está ya por defecto (el admin no eligió otra), marca la opción y guarda en `_migracion37` cuál
//     marcó. Sube __v para que una edición abierta en Admin entre en conflicto en vez de pisarla.
//     Idempotente.
//   - down: quita solo la marca que puso up (y la propia `_migracion37`).
// No toca ningún otro grupo ni campo.
export const MARCA = '_migracion37'

// Copia fija: si el seed cambia después, esta migración sigue haciendo exactamente lo mismo
export const POR_DEFECTO = [
    { grupo: 'Leche', opcion: 'Entera' },
    { grupo: 'Tamaño', opcion: 'Normal' },
]

const COLACION = { locale: 'es', strength: 1 }
const clave = (texto) => String(texto).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
const grupos = (db) => db.collection('grupos_modificadores')

const planUp = async (db, { grupo: nombre, opcion: nombreOpcion }) => {
    const base = { grupo: nombre, opcion: nombreOpcion }
    const grupo = await grupos(db).findOne({ nombre }, { collation: COLACION })
    if (!grupo) return { ...base, accion: 'sin-grupo' }
    if (grupo[MARCA]) return { ...base, _id: grupo._id, accion: 'ya-aplicada' }
    if (grupo.max !== 1) return { ...base, _id: grupo._id, accion: 'no-unica' }
    const opciones = grupo.opciones || []
    if (opciones.some((o) => o.porDefecto === true)) return { ...base, _id: grupo._id, accion: 'ya-tiene' }
    const opcion = opciones.find((o) => clave(o.nombre) === clave(nombreOpcion))
    if (!opcion) return { ...base, _id: grupo._id, accion: 'sin-opcion' }
    return { ...base, _id: grupo._id, opcionId: opcion._id, accion: 'asignar' }
}

export const up = async (db, { dryRun = false } = {}) => {
    const resultado = []
    for (const objetivo of POR_DEFECTO) {
        const { _id, opcionId, ...plan } = await planUp(db, objetivo)
        let aplicado = false
        if (plan.accion === 'asignar' && !dryRun) {
            const r = await grupos(db).updateOne(
                { _id, [MARCA]: { $exists: false }, max: 1, 'opciones.porDefecto': { $ne: true }, 'opciones._id': opcionId },
                { $set: { 'opciones.$[o].porDefecto': true, [MARCA]: { opcion: opcionId } }, $inc: { __v: 1 } },
                { arrayFilters: [{ 'o._id': opcionId }] },
            )
            aplicado = r.modifiedCount === 1
            if (!aplicado) plan.accion = 'cambio-concurrente'
        }
        resultado.push({ ...plan, aplicado })
    }
    return { grupos: resultado }
}

// Por la marca, no por el nombre: si el admin renombró el grupo después de up, down lo sigue encontrando
export const down = async (db, { dryRun = false } = {}) => {
    const resultado = []
    for (const grupo of await grupos(db).find({ [MARCA]: { $exists: true } }).toArray()) {
        const opcion = (grupo.opciones || []).find((o) => String(o._id) === String(grupo[MARCA].opcion))?.nombre ?? '(opción quitada)'
        const opcionId = grupo[MARCA].opcion
        let aplicado = false
        if (!dryRun) {
            const r = await grupos(db).updateOne(
                { _id: grupo._id, [MARCA]: { $exists: true } },
                { $unset: { 'opciones.$[o].porDefecto': 1, [MARCA]: 1 }, $inc: { __v: 1 } },
                { arrayFilters: [{ 'o._id': opcionId }] },
            )
            aplicado = r.modifiedCount === 1
        }
        resultado.push({ grupo: grupo.nombre, opcion, aplicado, quitar: true })
    }
    return { grupos: resultado }
}
