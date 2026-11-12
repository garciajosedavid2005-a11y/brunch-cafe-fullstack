import { describe, it, expect, vi } from 'vitest'
import mongoose from 'mongoose'
import { up, down, MARCA, PERMISOS_FASE_2 } from '../src/migraciones/m21-permisos-cocina.js'
import { CLAVES_ASIGNABLES } from '../src/modulos/identidad/permisos.js'

// 2.1 · Migración: permisos de cocina y barra (Fase 2) en BDs existentes
const db = () => mongoose.connection.db
const roles = () => db().collection('rols')
const permisosDe = async (nombre) => (await roles().findOne({ nombre })).permisos
const porRol = (resultado) => Object.fromEntries(resultado.roles.map((r) => [r.nombre, r]))
// Una BD anterior a 2.1: los roles sin ninguna de las claves nuevas
const comoAntes = async () => {
    for (const nombre of Object.keys(PERMISOS_FASE_2)) {
        await roles().updateOne({ nombre }, { $pull: { permisos: { $in: PERMISOS_FASE_2[nombre] } }, $unset: { [MARCA]: 1 } })
    }
}

describe('Migración 2.1 (permisos de cocina y barra en BDs existentes)', () => {
    it('la copia fija es la de 2.1 (F2-2, F2-3, F2-5) y sus claves son asignables', () => {
        // Literal a propósito: si el catálogo cambia después, se escribe otra migración, no se toca esta
        expect(PERMISOS_FASE_2).toEqual({
            mesero: ['item:servir', 'producto:agotar'],
            cocina: ['kds:ver', 'item:preparar', 'pedido:preparar', 'producto:agotar', 'producto:reactivar'],
            barista: ['kds:ver', 'item:preparar', 'pedido:preparar', 'producto:agotar', 'producto:reactivar'],
        })
        for (const clave of Object.values(PERMISOS_FASE_2).flat()) expect(CLAVES_ASIGNABLES).toContain(clave)
    })

    it('--dry-run informa sin escribir', async () => {
        await comoAntes()
        const antes = await permisosDe('cocina')
        const r = porRol(await up(db(), { dryRun: true }))
        expect(r.cocina).toMatchObject({ accion: 'agregar', agregar: PERMISOS_FASE_2.cocina, aplicado: false })
        expect(r.mesero).toMatchObject({ accion: 'agregar', agregar: PERMISOS_FASE_2.mesero, aplicado: false })
        expect(await permisosDe('cocina')).toEqual(antes)
    })

    it('up agrega las claves (conservando lo demás que personalizó el admin), es idempotente y down deja todo como estaba', async () => {
        await comoAntes()
        await roles().updateOne({ nombre: 'cocina' }, { $set: { permisos: ['reserva:ver'] } })
        const antes = { mesero: await permisosDe('mesero'), cocina: ['reserva:ver'], barista: await permisosDe('barista') }

        const aplicado = porRol(await up(db()))
        for (const nombre of Object.keys(PERMISOS_FASE_2)) {
            expect(aplicado[nombre].aplicado).toBe(true)
            expect(await permisosDe(nombre)).toEqual([...antes[nombre], ...PERMISOS_FASE_2[nombre]])
        }

        const otraVez = porRol(await up(db()))
        expect(otraVez.cocina.accion).toBe('ya-aplicada')
        expect(await permisosDe('cocina')).toEqual(['reserva:ver', ...PERMISOS_FASE_2.cocina])

        const plan = porRol(await down(db(), { dryRun: true }))
        expect(plan.barista).toMatchObject({ quitar: PERMISOS_FASE_2.barista, aplicado: false })
        expect(await permisosDe('barista')).toEqual([...antes.barista, ...PERMISOS_FASE_2.barista])

        await down(db())
        for (const nombre of Object.keys(PERMISOS_FASE_2)) {
            expect(await permisosDe(nombre)).toEqual(antes[nombre])
            expect((await roles().findOne({ nombre }))[MARCA]).toBeUndefined()
        }
    })

    it('un rol sembrado con 2.1 (todas las claves) no se toca; si el admin le quitó una a propósito, no se repone', async () => {
        await comoAntes()
        for (const nombre of Object.keys(PERMISOS_FASE_2)) {
            await roles().updateOne({ nombre }, { $push: { permisos: { $each: PERMISOS_FASE_2[nombre] } } })
        }
        await roles().updateOne({ nombre: 'mesero' }, { $pull: { permisos: 'producto:agotar' } }) // decisión del admin
        const r = porRol(await up(db()))
        expect(r.cocina).toMatchObject({ accion: 'sin-cambios', aplicado: false })
        expect(r.mesero).toMatchObject({ accion: 'personalizado', agregar: [], aplicado: false })
        expect(await permisosDe('mesero')).not.toContain('producto:agotar')
        expect((await roles().findOne({ nombre: 'mesero' }))[MARCA]).toBeUndefined()
    })

    it('up no escribe si el admin asignó una clave entre la lectura y la escritura (cambio-concurrente)', async () => {
        await comoAntes()
        const coleccion = roles()
        const original = coleccion.updateOne.bind(coleccion)
        const espia = vi.spyOn(Object.getPrototypeOf(coleccion), 'updateOne').mockImplementationOnce(async function (filtro, cambio) {
            await original({ nombre: 'mesero' }, { $push: { permisos: 'item:servir' } })
            return original(filtro, cambio)
        })
        const r = porRol(await up(db()))
        espia.mockRestore()
        expect(r.mesero).toMatchObject({ accion: 'cambio-concurrente', aplicado: false })
        expect((await roles().findOne({ nombre: 'mesero' }))[MARCA]).toBeUndefined()
        expect((await permisosDe('mesero')).filter((p) => p === 'item:servir')).toHaveLength(1)
    })

    it('down tras quitar el admin a mano una clave agregada: quita el resto y no falla', async () => {
        await comoAntes()
        const antes = await permisosDe('barista')
        await up(db())
        await roles().updateOne({ nombre: 'barista' }, { $pull: { permisos: 'kds:ver' } })
        await down(db())
        expect(await permisosDe('barista')).toEqual(antes)
    })

    it('un rol que no existe se informa y no falla', async () => {
        await roles().deleteOne({ nombre: 'barista' })
        const r = porRol(await up(db()))
        expect(r.barista.accion).toBe('sin-rol')
    })
})
