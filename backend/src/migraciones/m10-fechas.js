// Migración 0.10: instantes en UTC.
//
// up (no destructiva)
//   - reservas sin `inicio`: inicio = fecha (día de calendario) + hora, en America/Bogota.
//   - pedidos sin `entregaEn` con horaEntrega: entregaEn = día de Bogotá de createdAt + horaEntrega.
//   - Conserva fecha, hora y horaEntrega; marca cada documento con `_migracion10`.
//   - Si una fecha u hora no es válida, no adivina: no escribe nada y la lista.
// down
//   - Quita inicio / entregaEn y la marca solo de los documentos que marcó up.
import { instanteLocal, fechaLocal, fechaCalendario, esHoraValida } from '../libs/fechas.js'

export const MARCA = '_migracion10'

const COLECCIONES = {
    reservas: {
        campo: 'inicio',
        proyeccion: { fecha: 1, hora: 1, inicio: 1 },
        // → { instante } | { sinDato: true } | { invalido }
        calcular: (doc) => {
            if (!(doc.fecha instanceof Date) || Number.isNaN(doc.fecha.getTime()) || !esHoraValida(doc.hora)) {
                return { invalido: { _id: doc._id, fecha: doc.fecha ?? null, hora: doc.hora ?? null } }
            }
            return { instante: instanteLocal(fechaCalendario(doc.fecha), doc.hora) }
        },
    },
    pedidos: {
        campo: 'entregaEn',
        proyeccion: { horaEntrega: 1, createdAt: 1, entregaEn: 1 },
        calcular: (doc) => {
            if (doc.horaEntrega === undefined || doc.horaEntrega === null || doc.horaEntrega === '') return { sinDato: true }
            if (!esHoraValida(doc.horaEntrega) || !(doc.createdAt instanceof Date)) {
                return { invalido: { _id: doc._id, horaEntrega: doc.horaEntrega, createdAt: doc.createdAt ?? null } }
            }
            return { instante: instanteLocal(fechaLocal(doc.createdAt), doc.horaEntrega) }
        },
    },
}

const planColeccion = async (db, nombre) => {
    const { campo, proyeccion, calcular } = COLECCIONES[nombre]
    const docs = await db.collection(nombre).find({}, { projection: proyeccion }).toArray()
    const plan = { completar: 0, yaTenian: 0, sinHora: 0, invalidos: [], operaciones: [] }
    for (const doc of docs) {
        if (doc[campo]) {
            plan.yaTenian += 1
            continue
        }
        const r = calcular(doc)
        if (r.sinDato) plan.sinHora += 1
        else if (r.invalido) plan.invalidos.push(r.invalido)
        else {
            plan.completar += 1
            plan.operaciones.push({
                updateOne: {
                    filter: { _id: doc._id, [campo]: { $exists: false } },
                    update: { $set: { [campo]: r.instante, [MARCA]: { en: new Date() } } },
                },
            })
        }
    }
    return plan
}

export const up = async (db, { dryRun = false } = {}) => {
    const resultado = { aplicado: false }
    for (const nombre of Object.keys(COLECCIONES)) resultado[nombre] = await planColeccion(db, nombre)
    resultado.puedeAplicar = Object.keys(COLECCIONES).every((n) => resultado[n].invalidos.length === 0)
    if (!dryRun && resultado.puedeAplicar) {
        for (const nombre of Object.keys(COLECCIONES)) {
            const { operaciones } = resultado[nombre]
            if (operaciones.length) await db.collection(nombre).bulkWrite(operaciones)
        }
        resultado.aplicado = true
    }
    for (const nombre of Object.keys(COLECCIONES)) delete resultado[nombre].operaciones
    return resultado
}

export const down = async (db, { dryRun = false } = {}) => {
    const resultado = { aplicado: false, puedeAplicar: true }
    for (const [nombre, { campo }] of Object.entries(COLECCIONES)) {
        const filtro = { [MARCA]: { $exists: true } }
        resultado[nombre] = dryRun
            ? await db.collection(nombre).countDocuments(filtro)
            : (await db.collection(nombre).updateMany(filtro, { $unset: { [campo]: '', [MARCA]: '' } })).modifiedCount
    }
    resultado.aplicado = !dryRun
    return resultado
}
