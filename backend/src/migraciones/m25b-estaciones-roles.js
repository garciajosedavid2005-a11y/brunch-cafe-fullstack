// Migración 2.5b: estaciones del KDS en los roles existentes (Brayan, 2026-11-13).
//
// Desde 2.5b el rol guarda las estaciones que ve y opera (`estaciones`, códigos). El seed las pone al
// crear el rol; los roles ya creados no tienen el campo y, sin él, no ven ninguna estación (cerrado por
// defecto). La colección de roles es pequeña: sin lotes ni bloqueos que estimar.
// up (no destructiva, idempotente):
//   - Solo si el rol NO tiene el campo `estaciones` (nunca asignado): le pone las de la copia fija que
//     existan en esta BD y guarda en `_migracion25b` lo que puso.
//   - Si ya tiene el campo (aunque sea vacío: el admin decidió), no lo toca (`personalizado` o
//     `sin-cambios`).
//   - Escritura condicional (aún sin el campo ni la marca): si el admin asigna entre la lectura y la
//     escritura, no se pisa (`cambio-concurrente`).
//   - Informa los demás roles con kds:ver sin estaciones (el admin las asigna en Admin › Roles).
// down:
//   - Quita el campo y la marca solo si las estaciones siguen siendo las que puso up; si el admin las
//     cambió después, no se tocan (`modificado-despues`).
export const MARCA = '_migracion25b'

// Copia fija (no se importa de permisos.js): si el reparto cambia después, va en otra migración
export const ESTACIONES_ROLES = { cocina: ['cocina'], barista: ['barra'] }

const roles = (db) => db.collection('rols')
const iguales = (a = [], b = []) => a.length === b.length && a.every((x, i) => x === b[i])

const planUp = async (db, nombre) => {
    const rol = await roles(db).findOne({ nombre })
    if (!rol) return { nombre, accion: 'sin-rol', asignar: [] }
    const base = { nombre, _id: rol._id, actuales: rol.estaciones ?? null, asignar: [] }
    if (rol[MARCA]) return { ...base, accion: 'ya-aplicada' }
    if (rol.estaciones != null) { // null (escrito a mano) cuenta como «nunca asignado»
        return { ...base, accion: iguales(rol.estaciones, ESTACIONES_ROLES[nombre]) ? 'sin-cambios' : 'personalizado' }
    }
    const previstas = ESTACIONES_ROLES[nombre]
    const existentes = new Set((await db.collection('estaciones').find({ codigo: { $in: previstas } }).project({ codigo: 1 }).toArray()).map((e) => e.codigo))
    const asignar = previstas.filter((c) => existentes.has(c))
    if (!asignar.length) return { ...base, accion: 'sin-estacion' }
    return { ...base, accion: 'asignar', asignar }
}

/** `antesDeEscribir` solo para tests (provoca el cambio concurrente). */
export const up = async (db, { dryRun = false, antesDeEscribir } = {}) => {
    const resultado = []
    for (const nombre of Object.keys(ESTACIONES_ROLES)) {
        const { _id, ...plan } = await planUp(db, nombre)
        let aplicado = false
        if (plan.accion === 'asignar' && !dryRun) {
            await antesDeEscribir?.(nombre)
            const r = await roles(db).updateOne(
                { _id, estaciones: null, [MARCA]: { $exists: false } }, // null: ausente o nulo
                { $set: { estaciones: plan.asignar, [MARCA]: plan.asignar } },
            )
            aplicado = r.modifiedCount === 1
            if (!aplicado) plan.accion = 'cambio-concurrente'
        }
        resultado.push({ ...plan, aplicado })
    }
    const otros = await roles(db).find({
        nombre: { $nin: Object.keys(ESTACIONES_ROLES) },
        permisos: 'kds:ver',
        $or: [{ estaciones: { $exists: false } }, { estaciones: { $size: 0 } }],
    }).project({ nombre: 1 }).toArray()
    return { roles: resultado, otrosSinEstaciones: otros.map((r) => r.nombre).sort() }
}

export const down = async (db, { dryRun = false } = {}) => {
    const resultado = []
    for (const nombre of Object.keys(ESTACIONES_ROLES)) {
        const rol = await roles(db).findOne({ nombre, [MARCA]: { $exists: true } })
        if (!rol) {
            resultado.push({ nombre, accion: 'nada', aplicado: false, quitar: [] })
            continue
        }
        const quitar = rol[MARCA]
        if (!iguales(rol.estaciones, quitar)) {
            resultado.push({ nombre, accion: 'modificado-despues', aplicado: false, quitar: [], actuales: rol.estaciones ?? null })
            continue
        }
        let aplicado = false
        if (!dryRun) {
            const r = await roles(db).updateOne(
                { _id: rol._id, [MARCA]: { $exists: true }, estaciones: quitar },
                { $unset: { estaciones: 1, [MARCA]: 1 } },
            )
            aplicado = r.modifiedCount === 1
        }
        resultado.push({ nombre, accion: 'quitar', aplicado, quitar })
    }
    return { roles: resultado }
}
