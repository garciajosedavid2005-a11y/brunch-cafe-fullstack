// Migración 1.1: permisos de salón para mesero y anfitrión en BDs existentes.
//
// El seed solo asigna permisos al crear un rol de staff, así que las BDs anteriores a 1.1
// siguen con los de pedidos y reservas.
// up (no destructiva, idempotente)
//   - Solo si el rol tiene exactamente los permisos que dejaba el seed antes de 1.1: agrega
//     los de salón y guarda en `_migracion11` lo que agregó. La escritura es condicional
//     (si el admin cambió el rol entre la lectura y la escritura, no se toca).
//   - Si el admin lo personalizó, no lo toca (lo informa). Si al mesero le falta la
//     migración 0.15, lo informa: hay que aplicar 0.15 primero.
// down
//   - Quita solo los permisos que agregó up y la marca (aunque el admin los haya conservado a
//     propósito después: --down --dry-run los lista antes).
// Orden de reversión: primero migrate:1.1 --down y después migrate:0.15 --down.
export const MARCA = '_migracion11'

// Copia fija de los permisos de 1.1 (no se importa PERMISOS_SALON): si el catálogo cambia en
// ítems posteriores, esta migración sigue haciendo exactamente lo mismo
export const PERMISOS_SALON = {
    mesero: ['mesa:ver', 'mesa:operar', 'cuenta:abrir', 'cuenta:ver', 'comanda:tomar', 'comanda:enviar', 'cuenta:solicitar'],
    anfitrion: ['mesa:ver', 'mesa:operar', 'mesa:bloquear', 'mesa:unir', 'cuenta:abrir', 'cuenta:transferir'],
}

const ANTES = {
    mesero: ['pedido:ver', 'pedido:cambiar_estado', 'reserva:ver', 'reserva:crear'],
    anfitrion: ['reserva:ver', 'reserva:cambiar_estado'],
}
const MESERO_ANTES_DE_015 = ['pedido:ver', 'pedido:cambiar_estado']

const mismos = (a, b) => a.length === b.length && a.every((p) => b.includes(p))
const roles = (db) => db.collection('rols')

const planUp = async (db, nombre) => {
    const rol = await roles(db).findOne({ nombre })
    if (!rol) return { nombre, accion: 'sin-rol', permisos: [], agregar: [] }
    const permisos = rol.permisos || []
    const base = { nombre, _id: rol._id, permisos, agregar: [] }
    if (rol[MARCA]) return { ...base, accion: 'ya-aplicada' }
    const nuevos = PERMISOS_SALON[nombre]
    if (nuevos.every((p) => permisos.includes(p))) return { ...base, accion: 'sin-cambios' }
    if (nombre === 'mesero' && mismos(permisos, MESERO_ANTES_DE_015)) return { ...base, accion: 'falta-0.15' }
    if (!mismos(permisos, ANTES[nombre])) return { ...base, accion: 'personalizado' }
    return { ...base, accion: 'agregar', agregar: nuevos.filter((p) => !permisos.includes(p)) }
}

export const up = async (db, { dryRun = false } = {}) => {
    const resultado = []
    for (const nombre of Object.keys(PERMISOS_SALON)) {
        const { _id, ...plan } = await planUp(db, nombre)
        let aplicado = false
        if (plan.accion === 'agregar' && !dryRun) {
            const anteriores = ANTES[nombre]
            const r = await roles(db).updateOne(
                { _id, [MARCA]: { $exists: false }, permisos: { $all: anteriores, $size: anteriores.length } },
                { $push: { permisos: { $each: plan.agregar } }, $set: { [MARCA]: plan.agregar } },
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
    for (const nombre of Object.keys(PERMISOS_SALON)) {
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
