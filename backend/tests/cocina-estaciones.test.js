// 2.5 · Estaciones del KDS: GET /api/v1/staff/cocina/estaciones (kds:ver) para el filtro de estación de
// /kds. Solo las activas, por nombre, con los umbrales del temporizador (F2-4) y sin datos de configuración.
import { describe, it, expect, beforeEach } from 'vitest'
import { crearConSesion } from './helpers/usuarios.js'
import Estacion from '../src/modulos/catalogo/estacion.model.js'
import { listarEstacionesKds } from '../src/modulos/cocina/cola.service.js'

beforeEach(async () => {
    // Cocina y Barra vienen del setup (seed de estaciones)
    await Estacion.updateOne({ codigo: 'barra' }, { $set: { umbralAvisoMin: 4, umbralAlertaMin: 8 } })
    await Estacion.create({ codigo: 'horno', nombre: 'Horno', activa: false })
    // En minúscula: por bytes iría al final; con la colación en español va primero (revisor-backend)
    await Estacion.create({ codigo: 'ahumados', nombre: 'ahumados' })
})

describe('Estaciones del KDS (2.5)', () => {
    it('con kds:ver: las activas por nombre, con sus umbrales (o los de F2-4), y nada más', async () => {
        const { sesion } = await crearConSesion('cocina')
        const res = await sesion.get('/api/v1/staff/cocina/estaciones')
        expect(res.status).toBe(200)
        expect(res.body).toEqual([
            { codigo: 'ahumados', nombre: 'ahumados', umbralAvisoMin: 12, umbralAlertaMin: 20 },
            { codigo: 'barra', nombre: 'Barra', umbralAvisoMin: 4, umbralAlertaMin: 8 },
            { codigo: 'cocina', nombre: 'Cocina', umbralAvisoMin: 12, umbralAlertaMin: 20 },
        ])
    })

    it('sin kds:ver (mesero) → 403; sin sesión → 401', async () => {
        const { sesion } = await crearConSesion('mesero')
        const res = await sesion.get('/api/v1/staff/cocina/estaciones')
        expect(res.status).toBe(403)
        expect(res.body).toMatchObject({ error: { code: 'FORBIDDEN' } })
        const { api } = await import('./helpers/app.js')
        expect((await api().get('/api/v1/staff/cocina/estaciones')).status).toBe(401)
    })

    it('el servicio también exige kds:ver (aunque alguien lo llame sin pasar por la ruta)', async () => {
        await expect(listarEstacionesKds({ id: 'x', permisos: ['mesa:ver'] })).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' })
    })
})
