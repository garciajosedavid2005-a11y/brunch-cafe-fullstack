import { describe, it, expect } from 'vitest'
import mongoose from 'mongoose'
import { up, down, MARCA, ESTACIONES_ROLES } from '../src/migraciones/m25b-estaciones-roles.js'

// 2.5b · Migración: estaciones del KDS en los roles existentes (cocina → Cocina, barista → Barra)
const db = () => mongoose.connection.db
const roles = () => db().collection('rols')
const estacionesDe = async (nombre) => (await roles().findOne({ nombre })).estaciones
const porRol = (resultado) => Object.fromEntries(resultado.roles.map((r) => [r.nombre, r]))
// Una BD anterior a 2.5b: los roles sin el campo
const comoAntes = async () => {
    await roles().updateMany({}, { $unset: { estaciones: 1, [MARCA]: 1 } })
}

describe('Migración 2.5b (estaciones de los roles)', () => {
    it('la copia fija es la de 2.5b', () => {
        // Literal a propósito: si el reparto cambia después, se escribe otra migración
        expect(ESTACIONES_ROLES).toEqual({ cocina: ['cocina'], barista: ['barra'] })
    })

    it('--dry-run informa sin escribir', async () => {
        await comoAntes()
        const r = porRol(await up(db(), { dryRun: true }))
        expect(r.cocina).toMatchObject({ accion: 'asignar', asignar: ['cocina'], aplicado: false })
        expect(r.barista).toMatchObject({ accion: 'asignar', asignar: ['barra'], aplicado: false })
        expect(await estacionesDe('cocina')).toBeUndefined()
    })

    it('up asigna, es idempotente y down deja los roles como estaban', async () => {
        await comoAntes()
        const r1 = porRol(await up(db()))
        expect(r1.cocina).toMatchObject({ accion: 'asignar', aplicado: true })
        expect(await estacionesDe('cocina')).toEqual(['cocina'])
        expect(await estacionesDe('barista')).toEqual(['barra'])
        const r2 = porRol(await up(db()))
        expect(r2.cocina).toMatchObject({ accion: 'ya-aplicada', aplicado: false })
        const d = porRol(await down(db()))
        expect(d.cocina).toMatchObject({ aplicado: true, quitar: ['cocina'] })
        expect(await estacionesDe('cocina')).toBeUndefined()
        expect((await roles().findOne({ nombre: 'cocina' }))[MARCA]).toBeUndefined()
    })

    it('un rol que ya tiene estaciones (el admin decidió, aunque sea ninguna) no se toca', async () => {
        await comoAntes()
        await roles().updateOne({ nombre: 'cocina' }, { $set: { estaciones: [] } })
        await roles().updateOne({ nombre: 'barista' }, { $set: { estaciones: ['barra'] } })
        const r = porRol(await up(db()))
        expect(r.cocina).toMatchObject({ accion: 'personalizado', aplicado: false })
        expect(r.barista).toMatchObject({ accion: 'sin-cambios', aplicado: false })
        expect(await estacionesDe('cocina')).toEqual([])
    })

    it('si la estación no existe en esta BD, no se asigna (lo informa)', async () => {
        await comoAntes()
        await db().collection('estaciones').updateOne({ codigo: 'barra' }, { $set: { codigo: 'barra_vieja' } })
        const r = porRol(await up(db()))
        expect(r.barista).toMatchObject({ accion: 'sin-estacion', aplicado: false })
        expect(await estacionesDe('barista')).toBeUndefined()
        await db().collection('estaciones').updateOne({ codigo: 'barra_vieja' }, { $set: { codigo: 'barra' } })
    })

    it('informa los otros roles con kds:ver sin estaciones (el admin las asigna en Admin › Roles)', async () => {
        await comoAntes()
        await roles().insertOne({ nombre: 'pasteleria', etiqueta: 'Pastelería', permisos: ['kds:ver'] })
        const { otrosSinEstaciones } = await up(db(), { dryRun: true })
        expect(otrosSinEstaciones).toEqual(['pasteleria'])
    })

    it('cambio concurrente: si el admin asigna entre la lectura y la escritura, no se pisa', async () => {
        await comoAntes()
        const r = porRol(await up(db(), {
            dryRun: false,
            antesDeEscribir: async (nombre) => {
                if (nombre === 'cocina') await roles().updateOne({ nombre: 'cocina' }, { $set: { estaciones: ['barra'] } })
            },
        }))
        expect(r.cocina).toMatchObject({ accion: 'cambio-concurrente', aplicado: false })
        expect(await estacionesDe('cocina')).toEqual(['barra'])
    })

    it('down no pisa lo que el admin cambió después de up (lo informa)', async () => {
        await comoAntes()
        await up(db())
        await roles().updateOne({ nombre: 'barista' }, { $set: { estaciones: ['barra', 'cocina'] } })
        const d = porRol(await down(db()))
        expect(d.barista).toMatchObject({ aplicado: false, accion: 'modificado-despues' })
        expect(await estacionesDe('barista')).toEqual(['barra', 'cocina'])
        expect(d.cocina).toMatchObject({ aplicado: true })
    })
    it('un campo escrito a mano como null cuenta como «nunca asignado» (schema-reviewer)', async () => {
        await comoAntes()
        await roles().updateOne({ nombre: 'cocina' }, { $set: { estaciones: null } })
        const r = porRol(await up(db()))
        expect(r.cocina).toMatchObject({ accion: 'asignar', aplicado: true })
        expect(await estacionesDe('cocina')).toEqual(['cocina'])
    })
})
