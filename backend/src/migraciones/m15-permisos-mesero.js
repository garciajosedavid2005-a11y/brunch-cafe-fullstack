// Migración 0.15: permisos del mesero en BDs existentes (decisión de la integración de developers).
//
// La rama developers sumó reserva:ver y reserva:crear al mesero, pero el seed solo asigna
// permisos al crear el rol, así que las BDs anteriores siguen con los dos de pedidos.
// up (no destructiva)
//   - Solo si el rol tiene exactamente los permisos antiguos (pedido:ver, pedido:cambiar_estado):
//     agrega reserva:ver y reserva:crear y guarda en `_migracion15` lo que agregó.
//   - Si el admin lo personalizó, no lo toca (lo informa).
// down
//   - Quita solo los permisos que agregó up y la marca.
export const MARCA = '_migracion15'
const ANTIGUOS = ['pedido:ver', 'pedido:cambiar_estado']
const NUEVOS = ['reserva:ver', 'reserva:crear']

const mismos = (a, b) => a.length === b.length && a.every((p) => b.includes(p))

export const up = async (db, { dryRun = false } = {}) => {
    const rol = await db.collection('rols').findOne({ nombre: 'mesero' })
    if (!rol) return { aplicado: false, accion: 'sin-rol', permisos: [], agregar: [] }
    const permisos = rol.permisos || []
    const base = { permisos, agregar: [] }
    if (rol[MARCA]) return { ...base, aplicado: false, accion: 'ya-aplicada' }
    if (NUEVOS.every((p) => permisos.includes(p))) return { ...base, aplicado: false, accion: 'sin-cambios' }
    if (!mismos(permisos, ANTIGUOS)) return { ...base, aplicado: false, accion: 'personalizado' }

    const agregar = NUEVOS.filter((p) => !permisos.includes(p))
    if (!dryRun) {
        await db.collection('rols').updateOne(
            { _id: rol._id, permisos: { $all: ANTIGUOS, $size: ANTIGUOS.length } },
            { $push: { permisos: { $each: agregar } }, $set: { [MARCA]: agregar } },
        )
    }
    return { permisos, agregar, aplicado: !dryRun, accion: 'agregar' }
}

export const down = async (db, { dryRun = false } = {}) => {
    const rol = await db.collection('rols').findOne({ nombre: 'mesero', [MARCA]: { $exists: true } })
    if (!rol) return { aplicado: false, quitar: [] }
    const quitar = rol[MARCA]
    if (!dryRun) {
        await db.collection('rols').updateOne({ _id: rol._id }, { $pull: { permisos: { $in: quitar } }, $unset: { [MARCA]: 1 } })
    }
    return { aplicado: !dryRun, quitar }
}
