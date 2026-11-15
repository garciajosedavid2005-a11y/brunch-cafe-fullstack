// 4.4 · Lista de espera (PLAN_FASE_4, F4-4, F4-h): clientes sin reserva (nombre, personas y teléfono); «Sentar» abre
// la cuenta en una mesa libre (que no esté reservada); «Retirar» los quita de la lista. Solo la lista de hoy.
// Reloj de las pruebas: jueves 2026-11-05 07:30 en Bogotá (setup.js).
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { crearConSesion } from './helpers/usuarios.js'
import { crearReserva } from './helpers/datos.js'
import Zona from '../src/modulos/salon/zona.model.js'
import Mesa from '../src/modulos/salon/mesa.model.js'
import Cuenta from '../src/modulos/salon/cuenta.model.js'
import Espera from '../src/modulos/salon/espera.model.js'
import Evento from '../src/modulos/compartido/evento.model.js'
import { listarEspera } from '../src/modulos/salon/espera.service.js'

const BASE = '/api/v1/staff/espera'
let mesero, cliente, cajero, mesa1, mesa2

beforeEach(async () => {
    ;({ sesion: mesero } = await crearConSesion('mesero'))
    ;({ sesion: cliente } = await crearConSesion('cliente'))
    ;({ sesion: cajero } = await crearConSesion('cajero'))
    const zona = await Zona.create({ nombre: 'Interior', orden: 1 })
    mesa1 = await Mesa.create({ numero: 1, zona: zona._id, capacidad: 4 })
    mesa2 = await Mesa.create({ numero: 2, zona: zona._id, capacidad: 2 })
})

const agregar = (datos = {}, sesion = mesero) => sesion.post(BASE).send({ nombre: 'Pedro Gómez', personas: 3, telefono: '3105556677', ...datos })

describe('4.4 · Agregar y listar', () => {
    it('el mesero agrega a alguien: queda «esperando», con quién lo agregó, y sale en la lista de hoy en orden de llegada', async () => {
        const a = await agregar()
        expect(a.status, JSON.stringify(a.body)).toBe(201)
        expect(a.body).toMatchObject({ nombre: 'Pedro Gómez', personas: 3, telefono: '3105556677', estado: 'esperando' })
        await agregar({ nombre: 'Lina Ruiz', personas: 2 })
        const lista = await mesero.get(BASE)
        expect(lista.status).toBe(200)
        expect(lista.body.espera.map((e) => e.nombre)).toEqual(['Pedro Gómez', 'Lina Ruiz'])
        expect(lista.body.espera[0]).toMatchObject({ minutosEsperando: 0 })
        expect(await Evento.countDocuments({ entidad: 'espera', tipo: 'espera_agregada' })).toBe(2)
    })

    it('valida nombre, personas (1 a 20) y teléfono; solo campos declarados; sin permiso → 403', async () => {
        expect((await agregar({ nombre: 'P' })).status).toBe(400)
        expect((await agregar({ personas: 0 })).status).toBe(400)
        expect((await agregar({ personas: 21 })).status).toBe(400)
        expect((await agregar({ telefono: 'abc' })).status).toBe(400)
        expect((await agregar({ estado: 'sentada' })).status).toBe(400)
        expect((await agregar({}, cliente)).status).toBe(403)
        expect((await cajero.get(BASE)).status).toBe(403)
    })

    it('la lista solo trae lo de hoy (lo de ayer no)', async () => {
        await agregar()
        // Al día siguiente (la sesión de staff ya venció: se consulta el servicio directamente)
        vi.setSystemTime(new Date('2026-11-06T13:00:00Z'))
        expect((await listarEspera({ permisos: ['reserva:ver'] })).espera).toHaveLength(0)
    })
})

describe('4.4 · Sentar y retirar', () => {
    it('«Sentar» abre la cuenta en la mesa elegida (comensales = personas) y la quita de la espera', async () => {
        const { body: e } = await agregar()
        const r = await mesero.post(`${BASE}/${e.id}/sentar`).send({ mesaId: String(mesa1._id) })
        expect(r.status, JSON.stringify(r.body)).toBe(201)
        expect(r.body.cuenta).toMatchObject({ comensales: 3, estado: 'abierta' })
        expect(r.body.espera).toMatchObject({ estado: 'sentada', mesa: { numero: 1 } })
        expect((await Mesa.findById(mesa1._id)).estado).toBe('ocupada')
        const guardada = await Espera.findById(e.id).lean()
        expect(String(guardada.cuenta)).toBe(r.body.cuenta.id)
        // Ya sentada: no se vuelve a sentar ni se retira
        const otra = await mesero.post(`${BASE}/${e.id}/sentar`).send({ mesaId: String(mesa2._id) })
        expect(otra.status).toBe(409)
        expect(otra.body.error.code).toBe('ESPERA_NO_ACTIVA')
        expect((await mesero.patch(`${BASE}/${e.id}/retirar`).send({})).body.error.code).toBe('ESPERA_NO_ACTIVA')
    })

    it('no se sienta en una mesa ocupada ni en una reservada (todo o nada)', async () => {
        const { body: e } = await agregar({ personas: 2 })
        // La mesa 2 tiene una reserva de las 8:00 (bloque desde las 7:45); a las 7:50 está reservada
        vi.setSystemTime(new Date('2026-11-05T12:00:00Z'))
        const reserva = await crearReserva(cliente, { fecha: '2026-11-05', hora: '08:00', personas: 2 })
        await mesero.patch(`/api/v1/staff/reservas/${reserva}/mesa`).send({ mesaId: String(mesa2._id) })
        vi.setSystemTime(new Date('2026-11-05T12:50:00Z'))
        const r = await mesero.post(`${BASE}/${e.id}/sentar`).send({ mesaId: String(mesa2._id) })
        expect(r.status).toBe(409)
        expect(r.body.error.code).toBe('MESA_RESERVADA')
        expect((await Espera.findById(e.id).lean()).estado).toBe('esperando')
        expect(await Cuenta.countDocuments()).toBe(0)
    })

    it('«Retirar» la quita de la lista; mesa o espera inexistente y permisos', async () => {
        const { body: e } = await agregar()
        expect((await mesero.post(`${BASE}/${e.id}/sentar`).send({ mesaId: '0123456789abcdef01234567' })).status).toBe(404)
        expect((await mesero.post(`${BASE}/0123456789abcdef01234567/sentar`).send({ mesaId: String(mesa1._id) })).status).toBe(404)
        expect((await mesero.post(`${BASE}/${e.id}/sentar`).send({})).status).toBe(400)
        expect((await cliente.patch(`${BASE}/${e.id}/retirar`).send({})).status).toBe(403)
        const r = await mesero.patch(`${BASE}/${e.id}/retirar`).send({})
        expect(r.status).toBe(200)
        expect(r.body).toMatchObject({ estado: 'retirada' })
        expect((await mesero.get(BASE)).body.espera.find((x) => x.id === e.id)).toMatchObject({ estado: 'retirada' })
        expect(await Evento.countDocuments({ entidad: 'espera', entidadId: e.id, tipo: 'espera_retirada' })).toBe(1)
    })

    it('dos «Sentar» a la vez de la misma persona: una sola cuenta', async () => {
        const { body: e } = await agregar()
        const res = await Promise.all([
            mesero.post(`${BASE}/${e.id}/sentar`).send({ mesaId: String(mesa1._id) }),
            mesero.post(`${BASE}/${e.id}/sentar`).send({ mesaId: String(mesa2._id) }),
        ])
        expect(res.map((r) => r.status).sort()).toEqual([201, 409])
        expect(await Cuenta.countDocuments()).toBe(1)
    })

    it('mesa ocupada → 409 MESA_NO_DISPONIBLE; una espera de ayer no se sienta (404); misma Idempotency-Key → una sola cuenta', async () => {
        const { body: e } = await agregar()
        await mesero.post(`/api/v1/staff/salon/mesas/${mesa1._id}/abrir`).send({ comensales: 2 })
        const ocupada = await mesero.post(`${BASE}/${e.id}/sentar`).send({ mesaId: String(mesa1._id) })
        expect(ocupada.status).toBe(409)
        expect(ocupada.body.error.code).toBe('MESA_NO_DISPONIBLE')
        const enviar = () => mesero.post(`${BASE}/${e.id}/sentar`).set('Idempotency-Key', 'espera-1').send({ mesaId: String(mesa2._id) })
        const [x, y] = [await enviar(), await enviar()]
        expect([x.status, y.status]).toEqual([201, 201])
        expect(y.body.cuenta.id).toBe(x.body.cuenta.id)
        expect(await Cuenta.countDocuments()).toBe(2)
        const { body: deAyer } = await agregar({ nombre: 'Ayer Pérez' })
        await Espera.updateOne({ _id: deAyer.id }, { dia: '2026-11-04' })
        expect((await mesero.patch(`${BASE}/${deAyer.id}/retirar`).send({})).status).toBe(404)
    })
})
