import { describe, it, expect, vi } from 'vitest'
import mongoose from 'mongoose'
import { up, down, MARCA } from '../src/migraciones/m11-permisos-salon.js'

// 1.1 · Migración: permisos de salón para mesero y anfitrión en BDs existentes
const roles = () => mongoose.connection.db.collection('rols')
const permisosDe = async (nombre) => (await roles().findOne({ nombre })).permisos
const db = () => mongoose.connection.db

const MESERO_ANTES = ['pedido:ver', 'pedido:cambiar_estado', 'reserva:ver', 'reserva:crear']
const ANFITRION_ANTES = ['reserva:ver', 'reserva:cambiar_estado']
const MESERO_NUEVOS = ['mesa:ver', 'mesa:operar', 'cuenta:abrir', 'cuenta:ver', 'comanda:tomar', 'comanda:enviar', 'cuenta:solicitar']
const ANFITRION_NUEVOS = ['mesa:ver', 'mesa:operar', 'mesa:bloquear', 'mesa:unir', 'cuenta:abrir', 'cuenta:transferir']

// El setup siembra los roles con los permisos de 1.1; aquí se simula una BD anterior
const dejar = (nombre, permisos) => roles().updateOne({ nombre }, { $set: { permisos }, $unset: { [MARCA]: 1 } })
const comoAntes = async () => {
    await dejar('mesero', MESERO_ANTES)
    await dejar('anfitrion', ANFITRION_ANTES)
}
const porRol = (resultado) => Object.fromEntries(resultado.roles.map((r) => [r.nombre, r]))

describe('Migración 1.1 (permisos de salón en BDs existentes)', () => {
    it('--dry-run informa sin escribir', async () => {
        await comoAntes()
        const r = porRol(await up(db(), { dryRun: true }))
        expect(r.mesero).toMatchObject({ accion: 'agregar', agregar: MESERO_NUEVOS, aplicado: false })
        expect(r.anfitrion).toMatchObject({ accion: 'agregar', agregar: ANFITRION_NUEVOS, aplicado: false })
        expect(await permisosDe('mesero')).toEqual(MESERO_ANTES)
        expect(await permisosDe('anfitrion')).toEqual(ANFITRION_ANTES)
    })

    it('up agrega los permisos, es idempotente y down deja los roles como estaban', async () => {
        await comoAntes()
        const aplicado = porRol(await up(db()))
        expect(aplicado.mesero.aplicado).toBe(true)
        expect(aplicado.anfitrion.aplicado).toBe(true)
        expect(await permisosDe('mesero')).toEqual([...MESERO_ANTES, ...MESERO_NUEVOS])
        expect(await permisosDe('anfitrion')).toEqual([...ANFITRION_ANTES, ...ANFITRION_NUEVOS])

        const otraVez = porRol(await up(db()))
        expect(otraVez.mesero.accion).toBe('ya-aplicada')
        expect(await permisosDe('mesero')).toEqual([...MESERO_ANTES, ...MESERO_NUEVOS])

        const plan = porRol(await down(db(), { dryRun: true }))
        expect(plan.mesero).toMatchObject({ quitar: MESERO_NUEVOS, aplicado: false })
        expect(await permisosDe('mesero')).toEqual([...MESERO_ANTES, ...MESERO_NUEVOS])

        await down(db())
        expect(await permisosDe('mesero')).toEqual(MESERO_ANTES)
        expect(await permisosDe('anfitrion')).toEqual(ANFITRION_ANTES)
        expect((await roles().findOne({ nombre: 'mesero' }))[MARCA]).toBeUndefined()
    })

    it('no toca un rol que el admin personalizó', async () => {
        await comoAntes()
        await dejar('anfitrion', ['reserva:ver'])
        const r = porRol(await up(db()))
        expect(r.anfitrion).toMatchObject({ accion: 'personalizado', aplicado: false })
        expect(await permisosDe('anfitrion')).toEqual(['reserva:ver'])
        expect(r.mesero.aplicado).toBe(true)
    })

    it('un mesero sin la migración 0.15 se informa (hay que aplicar 0.15 primero)', async () => {
        await comoAntes()
        await dejar('mesero', ['pedido:ver', 'pedido:cambiar_estado'])
        const r = porRol(await up(db()))
        expect(r.mesero).toMatchObject({ accion: 'falta-0.15', aplicado: false })
        expect(await permisosDe('mesero')).toEqual(['pedido:ver', 'pedido:cambiar_estado'])
    })

    it('en una BD nueva (ya con los permisos) no hace nada, y down solo quita lo que puso up', async () => {
        const r = porRol(await up(db()))
        expect(r.mesero.accion).toBe('sin-cambios')
        expect(r.anfitrion.accion).toBe('sin-cambios')
        await down(db())
        expect(await permisosDe('mesero')).toEqual([...MESERO_ANTES, ...MESERO_NUEVOS])
    })

    it('si un permiso agregado por up se quitó a mano, down no falla y quita solo los demás', async () => {
        await comoAntes()
        await up(db())
        await roles().updateOne({ nombre: 'mesero' }, { $pull: { permisos: 'cuenta:ver' } })
        await down(db())
        expect(await permisosDe('mesero')).toEqual(MESERO_ANTES)
    })
})

describe('Migración 1.1: casos límite', () => {
    it('sin el rol anfitrión lo informa y sigue con el mesero', async () => {
        await comoAntes()
        await roles().deleteOne({ nombre: 'anfitrion' })
        const r = porRol(await up(db()))
        expect(r.anfitrion).toMatchObject({ accion: 'sin-rol', aplicado: false })
        expect(r.mesero.aplicado).toBe(true)
        expect(porRol(await down(db())).anfitrion).toMatchObject({ aplicado: false, quitar: [] })
    })

    it('un rol con los permisos anteriores más uno de salón asignado a mano cuenta como personalizado', async () => {
        await comoAntes()
        await dejar('anfitrion', [...ANFITRION_ANTES, 'mesa:ver'])
        expect(porRol(await up(db())).anfitrion).toMatchObject({ accion: 'personalizado', aplicado: false })
        expect(await permisosDe('anfitrion')).toEqual([...ANFITRION_ANTES, 'mesa:ver'])
    })

    it('up no escribe si el admin cambió el rol entre la lectura y la escritura (cambio-concurrente)', async () => {
        await comoAntes()
        const coleccion = roles()
        const original = coleccion.updateOne.bind(coleccion)
        const espia = vi.spyOn(Object.getPrototypeOf(coleccion), 'updateOne').mockImplementationOnce(async function (filtro, cambio) {
            await original({ nombre: 'mesero' }, { $set: { permisos: ['pedido:ver'] } })
            return original(filtro, cambio)
        })
        const r = porRol(await up(db()))
        espia.mockRestore()
        expect(r.mesero).toMatchObject({ accion: 'cambio-concurrente', aplicado: false })
        expect(await permisosDe('mesero')).toEqual(['pedido:ver'])
        expect((await roles().findOne({ nombre: 'mesero' }))[MARCA]).toBeUndefined()
    })

    it('down informa no aplicado si el rol desapareció entre la lectura y la escritura', async () => {
        await comoAntes()
        await up(db())
        const coleccion = roles()
        const original = coleccion.updateOne.bind(coleccion)
        const espia = vi.spyOn(Object.getPrototypeOf(coleccion), 'updateOne').mockImplementationOnce(async function (filtro, cambio) {
            await coleccion.deleteOne({ nombre: 'mesero' })
            return original(filtro, cambio)
        })
        const r = porRol(await down(db()))
        espia.mockRestore()
        expect(r.mesero.aplicado).toBe(false)
    })
})
