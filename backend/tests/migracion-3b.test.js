import { describe, it, expect } from 'vitest'
import mongoose from 'mongoose'
import { up, down, MARCA, PERMISOS_FASE_3B } from '../src/migraciones/m3b-permisos-caja.js'
import { CLAVES_ASIGNABLES, PERMISOS_CAJA } from '../src/modulos/identidad/permisos.js'

// 3b · Migración: permisos de la caja completa (turno, arqueo y cobro de domicilios) para cajero y repartidor
const db = () => mongoose.connection.db
const roles = () => db().collection('rols')
const permisosDe = async (nombre) => (await roles().findOne({ nombre })).permisos
const porRol = (resultado) => Object.fromEntries(resultado.roles.map((r) => [r.nombre, r]))
// Una BD anterior a 3b
const comoAntes = () => Promise.all(Object.entries(PERMISOS_FASE_3B).map(([nombre, claves]) =>
    roles().updateOne({ nombre }, { $pull: { permisos: { $in: claves } }, $unset: { [MARCA]: 1 } })))

describe('Migración 3b (permisos de la caja completa)', () => {
    it('agrega solo claves asignables, las mismas que siembra el catálogo (factura:anular no: solo el admin)', () => {
        expect(PERMISOS_FASE_3B).toEqual({ cajero: ['caja:abrir', 'caja:cerrar', 'pedido:cobrar'], repartidor: ['pedido:cobrar'] })
        for (const claves of Object.values(PERMISOS_FASE_3B)) for (const c of claves) expect(CLAVES_ASIGNABLES).toContain(c)
        for (const [rol, claves] of Object.entries(PERMISOS_FASE_3B)) for (const c of claves) expect(PERMISOS_CAJA[rol]).toContain(c)
        expect(Object.values(PERMISOS_FASE_3B).flat()).not.toContain('factura:anular')
    })

    it('--dry-run informa sin escribir', async () => {
        await comoAntes()
        const antes = await permisosDe('cajero')
        const r = porRol(await up(db(), { dryRun: true }))
        expect(r.cajero).toMatchObject({ accion: 'agregar', agregar: PERMISOS_FASE_3B.cajero, aplicado: false })
        expect(r.repartidor).toMatchObject({ accion: 'agregar', agregar: ['pedido:cobrar'], aplicado: false })
        expect(await permisosDe('cajero')).toEqual(antes)
    })

    it('up → down → up: agrega conservando lo demás, es idempotente, revierte solo lo suyo y no toca otros roles', async () => {
        await comoAntes()
        const otros = await roles().find({ nombre: { $nin: ['cajero', 'repartidor'] } }).sort({ nombre: 1 }).toArray()
        const antes = { cajero: await permisosDe('cajero'), repartidor: await permisosDe('repartidor') }

        const r1 = porRol(await up(db()))
        expect(r1.cajero.aplicado && r1.repartidor.aplicado).toBe(true)
        expect(await permisosDe('cajero')).toEqual([...antes.cajero, ...PERMISOS_FASE_3B.cajero])
        expect(porRol(await up(db())).cajero.accion).toBe('ya-aplicada')

        await down(db())
        expect(await permisosDe('cajero')).toEqual(antes.cajero)
        expect(await permisosDe('repartidor')).toEqual(antes.repartidor)
        expect((await roles().findOne({ nombre: 'cajero' }))[MARCA]).toBeUndefined()

        expect(porRol(await up(db())).cajero.aplicado).toBe(true)
        expect(await roles().find({ nombre: { $nin: ['cajero', 'repartidor'] } }).sort({ nombre: 1 }).toArray()).toEqual(otros)
    })

    it('si el rol ya tiene alguna de las claves (decisión del admin), no lo toca', async () => {
        await comoAntes()
        await roles().updateOne({ nombre: 'cajero' }, { $addToSet: { permisos: 'caja:abrir' } })
        expect(porRol(await up(db())).cajero).toMatchObject({ accion: 'personalizado', aplicado: false })
        expect(await permisosDe('cajero')).toContain('caja:abrir')
        expect(await permisosDe('cajero')).not.toContain('caja:cerrar')
    })
})
