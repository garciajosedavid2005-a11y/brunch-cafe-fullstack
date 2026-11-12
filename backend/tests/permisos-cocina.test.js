import { describe, it, expect } from 'vitest'
import Rol from '../src/modulos/identidad/rol.model.js'
import Permiso from '../src/modulos/identidad/permiso.model.js'
import { CLAVES_ASIGNABLES, PERMISOS } from '../src/modulos/identidad/permisos.js'

// 2.1 · Permisos de cocina y barra (PLAN_FASE_2 §2, F2-2, F2-3, F2-5)
const FASE_2 = ['kds:ver', 'item:preparar', 'item:servir', 'pedido:preparar', 'producto:agotar', 'producto:reactivar']
const permisosDe = async (nombre) => (await Rol.findOne({ nombre }).lean()).permisos

describe('Permisos de cocina y barra (2.1)', () => {
    it('están en el catálogo con descripción, son asignables y se reflejan en la colección Permiso', async () => {
        for (const clave of FASE_2) {
            expect(CLAVES_ASIGNABLES).toContain(clave)
            expect(PERMISOS.find((p) => p.clave === clave).descripcion).toMatch(/\S{3}/)
        }
        const guardados = await Permiso.find({ clave: { $in: FASE_2 } }).lean()
        expect(guardados.map((p) => p.clave).sort()).toEqual([...FASE_2].sort())
        expect(guardados.every((p) => p.reservado === false)).toBe(true)
    })

    it('cocina y barista: ver el KDS, preparar ítems y pedidos, agotar y reactivar (F2-3, F2-5)', async () => {
        for (const nombre of ['cocina', 'barista']) {
            expect(await permisosDe(nombre)).toEqual(['pedido:ver', 'kds:ver', 'item:preparar', 'pedido:preparar', 'producto:agotar', 'producto:reactivar'])
        }
    })

    it('mesero: además, servir y agotar, pero no reactivar ni ver el KDS (F2-2, F2-5)', async () => {
        const mesero = await permisosDe('mesero')
        expect(mesero).toEqual(expect.arrayContaining(['item:servir', 'producto:agotar']))
        for (const clave of ['producto:reactivar', 'kds:ver', 'item:preparar', 'pedido:preparar']) expect(mesero).not.toContain(clave)
    })

    it('cajero y repartidor no reciben permisos de cocina', async () => {
        for (const nombre of ['cajero', 'repartidor']) {
            const permisos = await permisosDe(nombre)
            for (const clave of FASE_2) expect(permisos).not.toContain(clave)
        }
    })
})
