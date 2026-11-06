import { describe, it, expect } from 'vitest'
import MetodoPago from '../src/modulos/pedidos/metodoPago.model.js'
import { sembrarBase } from '../src/seeds/base.js'
import { crearConSesion } from './helpers/usuarios.js'

describe('Métodos de pago: se siembran con seed:base, no en las peticiones', () => {
    it('listar (cliente y admin) no crea ni modifica métodos', async () => {
        await MetodoPago.deleteMany({})
        const { sesion: cliente } = await crearConSesion('cliente')
        const { sesion: admin } = await crearConSesion('admin')
        expect((await cliente.get('/api/v1/cliente/metodos-pago')).body).toEqual([])
        expect((await admin.get('/api/v1/admin/metodos-pago')).body).toEqual([])
        expect(await MetodoPago.countDocuments()).toBe(0)
    })

    it('un método borrado por el admin no reaparece al listar', async () => {
        await sembrarBase({})
        const { sesion: admin } = await crearConSesion('admin')
        await MetodoPago.deleteOne({ codigo: 'tarjeta-credito' })
        const lista = await admin.get('/api/v1/admin/metodos-pago')
        expect(lista.body.map((m) => m.codigo)).not.toContain('tarjeta-credito')
    })

    it('seed:base crea los tres métodos, es idempotente y no pisa descripciones editadas', async () => {
        await MetodoPago.deleteMany({})
        const primera = await sembrarBase({})
        expect(primera.metodosPago).toEqual({ creados: 3, existentes: 0 })
        await MetodoPago.updateOne({ codigo: 'contra-entrega' }, { $set: { descripcion: 'Efectivo al recibir' } })
        const segunda = await sembrarBase({})
        expect(segunda.metodosPago).toEqual({ creados: 0, existentes: 3 })
        expect(await MetodoPago.countDocuments()).toBe(3)
        expect((await MetodoPago.findOne({ codigo: 'contra-entrega' })).descripcion).toBe('Efectivo al recibir')
    })
})
