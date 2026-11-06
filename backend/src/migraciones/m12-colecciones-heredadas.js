// Migración 0.12: elimina las colecciones heredadas que la app ya no usa (anteriores a los
// modelos en español). Reversible: up guarda cada colección en <dir>/<nombre>.ejson (EJSON
// canónico: conserva ObjectId, fechas y números) antes de eliminarla; down la restaura.
// Complementa (no reemplaza) el mongodump previo.
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import mongoose from 'mongoose'

export const COLECCIONES_HEREDADAS = ['users', 'orders', 'reservations', 'reviews']
const { EJSON } = mongoose.mongo.BSON

const exigirDir = (dir) => {
    if (!dir) throw new Error('Falta la carpeta de respaldo (dir): no se elimina ni restaura nada sin ella.')
}
const existentes = async (db) => new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name))

/** Conteo por colección (null = no existe). */
const contar = async (db) => {
    const hay = await existentes(db)
    const conteos = {}
    for (const nombre of COLECCIONES_HEREDADAS) {
        conteos[nombre] = hay.has(nombre) ? await db.collection(nombre).countDocuments() : null
    }
    return conteos
}

export const up = async (db, { dryRun = false, dir } = {}) => {
    const conteos = await contar(db)
    if (dryRun) return { aplicado: false, conteos }
    exigirDir(dir)
    mkdirSync(dir, { recursive: true })
    const eliminadas = []
    for (const nombre of COLECCIONES_HEREDADAS) {
        if (conteos[nombre] === null) continue
        const docs = await db.collection(nombre).find().sort({ _id: 1 }).toArray()
        const archivo = join(dir, `${nombre}.ejson`)
        writeFileSync(archivo, EJSON.stringify(docs, { relaxed: false }))
        // Antes de eliminar, comprobar que el archivo se puede leer y tiene todo
        const leidos = EJSON.parse(readFileSync(archivo, 'utf8'), { relaxed: false })
        if (leidos.length !== docs.length) throw new Error(`El respaldo de ${nombre} no coincide (${leidos.length} de ${docs.length}); no se elimina.`)
        await db.collection(nombre).drop()
        eliminadas.push(nombre)
    }
    return { aplicado: true, conteos, eliminadas, dir }
}

export const down = async (db, { dryRun = false, dir } = {}) => {
    exigirDir(dir)
    const hay = await existentes(db)
    const restaurar = {}
    const porColeccion = {}
    for (const nombre of COLECCIONES_HEREDADAS) {
        const archivo = join(dir, `${nombre}.ejson`)
        if (!existsSync(archivo)) continue
        const docs = EJSON.parse(readFileSync(archivo, 'utf8'), { relaxed: false })
        if (hay.has(nombre) && (await db.collection(nombre).countDocuments()) > 0) {
            throw new Error(`La colección ${nombre} ya tiene documentos; no se restaura encima.`)
        }
        restaurar[nombre] = docs.length
        porColeccion[nombre] = docs
    }
    if (dryRun) return { aplicado: false, restaurar }
    for (const [nombre, docs] of Object.entries(porColeccion)) {
        if (docs.length) await db.collection(nombre).insertMany(docs)
        else await db.createCollection(nombre)
    }
    return { aplicado: true, restaurar }
}
