// Migración 6.3 (F6-3): cuentas para llevar. No modifica ni borra documentos:
//   - permisos: `cuenta:para_llevar` al mesero y al cajero, en roles ya creados (el seed solo lo da al crear el rol).
//     Por rol, solo si aún no lo tiene; guarda en `_migracion63` lo que agregó. Idempotente.
//   - índice de cuentas: el único «una mesa en una sola cuenta abierta» pasa a valer solo para el salón. Una cuenta
//     para llevar no tiene mesas y el arreglo vacío se indexa como un valor: con el índice anterior, dos para llevar
//     abiertas a la vez chocarían. up crea el nuevo (`mesa_en_una_cuenta_abierta_salon`, filtro con canal 'salon')
//     y DESPUÉS quita el anterior (`mesa_en_una_cuenta_abierta`), así nunca queda sin protección.
// down quita el permiso que marcó up y vuelve al índice anterior (lo crea y después quita el nuevo); si ya hay dos
// para llevar abiertas a la vez, no revierte nada (lo dice el resultado).
// Aplicar con el servidor detenido (al arrancar, el modelo crea el índice nuevo si falta). Volver al código anterior a
// 6.3 exige correr antes `--down`: ese código recrearía el índice viejo al arrancar.
export const MARCA = '_migracion63'
// Copia fija: si el catálogo cambia después, esta migración sigue haciendo lo mismo
export const PERMISOS_FASE_63 = {
    mesero: ['cuenta:para_llevar'],
    cajero: ['cuenta:para_llevar'],
}
const ABIERTAS = ['abierta', 'cuenta_pedida']
export const INDICE_VIEJO = { nombre: 'mesa_en_una_cuenta_abierta', filtro: { estado: { $in: ABIERTAS } } }
export const INDICE_NUEVO = { nombre: 'mesa_en_una_cuenta_abierta_salon', filtro: { estado: { $in: ABIERTAS }, canal: 'salon' } }
const CLAVE = { 'mesas.mesa': 1 }

const roles = (db) => db.collection('rols')
const cuentas = (db) => db.collection('cuentas')
const indices = async (db) => {
    const existe = (await db.listCollections({ name: 'cuentas' }).toArray()).length > 0
    return existe ? (await cuentas(db).indexes()).map((i) => i.name) : null
}
const crear = (db, { nombre, filtro }) => cuentas(db).createIndex(CLAVE, { unique: true, partialFilterExpression: filtro, name: nombre })

export const up = async (db, { dryRun = false } = {}) => {
    const resultado = []
    for (const [nombre, nuevas] of Object.entries(PERMISOS_FASE_63)) {
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
    const nombres = await indices(db)
    // El índice nuevo solo cubre canal 'salon': una cuenta abierta SIN canal quedaría sin protección. No se rellena
    // aquí (sería modificar datos): se detiene y lo dice
    const sinCanal = nombres ? await cuentas(db).countDocuments({ canal: { $exists: false }, estado: { $in: ABIERTAS } }) : 0
    if (sinCanal) return { roles: resultado, indice: { crear: false, quitar: false, aplicado: false, bloqueo: `${sinCanal} cuenta(s) abierta(s) sin canal` } }
    const plan = { crear: nombres !== null && !nombres.includes(INDICE_NUEVO.nombre), quitar: Boolean(nombres?.includes(INDICE_VIEJO.nombre)) }
    if (!dryRun) {
        if (plan.crear) await crear(db, INDICE_NUEVO)
        if (plan.quitar) await cuentas(db).dropIndex(INDICE_VIEJO.nombre)
    }
    return { roles: resultado, indice: { ...plan, aplicado: !dryRun && (plan.crear || plan.quitar) } }
}

export const down = async (db, { dryRun = false } = {}) => {
    // El índice anterior no admite dos para llevar abiertas a la vez (las dos «sin mesa»): en ese caso no se revierte
    // NADA (ni permisos ni índice), para no dejar la BD a medias
    const nombres = await indices(db)
    const abiertas = nombres ? await cuentas(db).countDocuments({ canal: 'para_llevar', estado: { $in: ABIERTAS } }) : 0
    if (abiertas > 1) {
        return {
            roles: Object.keys(PERMISOS_FASE_63).map((nombre) => ({ nombre, quitar: [], aplicado: false })),
            indice: { crear: false, quitar: false, aplicado: false, bloqueo: 'hay varias cuentas para llevar abiertas' },
        }
    }
    const resultado = []
    for (const nombre of Object.keys(PERMISOS_FASE_63)) {
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
    const plan = { crear: nombres !== null && !nombres.includes(INDICE_VIEJO.nombre), quitar: Boolean(nombres?.includes(INDICE_NUEVO.nombre)) }
    if (!dryRun) {
        if (plan.crear) await crear(db, INDICE_VIEJO)
        if (plan.quitar) await cuentas(db).dropIndex(INDICE_NUEVO.nombre)
    }
    return { roles: resultado, indice: { ...plan, aplicado: !dryRun && (plan.crear || plan.quitar) } }
}
