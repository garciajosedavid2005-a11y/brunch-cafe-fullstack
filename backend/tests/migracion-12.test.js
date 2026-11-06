// 0.12 · Grupo 4 (aprobado): colecciones heredadas que la app no usa (users, orders,
// reservations, reviews). up las guarda en archivos EJSON y las elimina; down las restaura.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import mongoose from 'mongoose'
import { up, down, COLECCIONES_HEREDADAS } from '../src/migraciones/m12-colecciones-heredadas.js'

const db = () => mongoose.connection.db
const id = () => new mongoose.Types.ObjectId()
let dir

const sembrar = async () => {
    await db().collection('users').insertOne({ _id: id(), email: 'viejo@example.com', createdAt: new Date('2025-01-02T03:04:05Z') })
    await db().collection('reservations').insertMany([{ fecha: new Date('2025-02-01T12:00:00Z'), personas: 2 }, { fecha: new Date('2025-02-02T12:00:00Z'), personas: 4 }])
    await db().collection('reviews').insertOne({ user: id(), calificacion: 5, comentario: 'Reseña heredada' })
    // orders no existe: se omite sin error
}
const volcar = async (nombre) => db().collection(nombre).find().sort({ _id: 1 }).toArray()

beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'm12-')) })
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('Migración 0.12 (colecciones heredadas)', () => {
    it('son exactamente las cuatro acordadas y ninguna de la app', () => {
        expect(COLECCIONES_HEREDADAS).toEqual(['users', 'orders', 'reservations', 'reviews'])
        const enUso = mongoose.modelNames().map((n) => mongoose.model(n).collection.collectionName)
        expect(enUso.filter((c) => COLECCIONES_HEREDADAS.includes(c))).toEqual([])
    })

    it('--dry-run cuenta sin escribir ni borrar', async () => {
        await sembrar()
        const plan = await up(db(), { dryRun: true, dir })
        expect(plan).toMatchObject({ aplicado: false, conteos: { users: 1, orders: null, reservations: 2, reviews: 1 } })
        expect(readdirSync(dir)).toEqual([])
        expect(await db().collection('users').countDocuments()).toBe(1)
    })

    it('up respalda en EJSON y elimina; down restaura los mismos documentos', async () => {
        await sembrar()
        const antes = { users: await volcar('users'), reservations: await volcar('reservations'), reviews: await volcar('reviews') }

        const r = await up(db(), { dir })
        expect(r).toMatchObject({ aplicado: true, eliminadas: ['users', 'reservations', 'reviews'] })
        expect(readdirSync(dir).sort()).toEqual(['reservations.ejson', 'reviews.ejson', 'users.ejson'])
        const existentes = (await db().listCollections().toArray()).map((c) => c.name)
        expect(existentes.filter((c) => COLECCIONES_HEREDADAS.includes(c))).toEqual([])

        expect((await down(db(), { dir, dryRun: true })).restaurar).toEqual({ users: 1, reservations: 2, reviews: 1 })
        expect(await down(db(), { dir })).toMatchObject({ aplicado: true, restaurar: { users: 1, reservations: 2, reviews: 1 } })
        // Idénticos, con ObjectId y fechas (no como texto)
        expect(await volcar('users')).toEqual(antes.users)
        expect(await volcar('reservations')).toEqual(antes.reservations)
        expect(await volcar('reviews')).toEqual(antes.reviews)
        expect((await volcar('users'))[0].createdAt).toBeInstanceOf(Date)
    })

    it('down no pisa una colección que ya tiene datos', async () => {
        await sembrar()
        await up(db(), { dir })
        await db().collection('users').insertOne({ email: 'nuevo@example.com' })
        await expect(down(db(), { dir })).rejects.toThrow(/users ya tiene documentos/)
    })

    it('sin carpeta de respaldo no hace nada', async () => {
        await expect(up(db(), {})).rejects.toThrow(/respaldo/)
        await expect(down(db(), {})).rejects.toThrow(/respaldo/)
    })
})
