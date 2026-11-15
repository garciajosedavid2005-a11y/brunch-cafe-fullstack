// 4.6.2 · «Sentar» solo en el horario de la reserva (corrección 2 de Brayan a la Fase 4): desde 10 min antes de la
// hora y durante sus 90 min. Antes o después responde 409 RESERVA_FUERA_DE_HORARIO con un mensaje claro y no abre
// nada. Reloj de las pruebas: jueves 2026-11-05 07:30 en Bogotá (setup.js).
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { crearConSesion } from './helpers/usuarios.js'
import { crearReserva, fechaFutura } from './helpers/datos.js'
import Zona from '../src/modulos/salon/zona.model.js'
import Mesa from '../src/modulos/salon/mesa.model.js'
import Reserva from '../src/modulos/salon/reserva.model.js'
import Cuenta from '../src/modulos/salon/cuenta.model.js'
import Estado from '../src/modulos/compartido/estado.model.js'

const HOY = '2026-11-05'
const BASE = '/api/v1/staff/reservas'
let cliente, mesero, mesa1

beforeEach(async () => {
    ;({ sesion: cliente } = await crearConSesion('cliente'))
    ;({ sesion: mesero } = await crearConSesion('mesero'))
    const zona = await Zona.create({ nombre: 'Interior', orden: 1 })
    mesa1 = await Mesa.create({ numero: 1, zona: zona._id, capacidad: 4 })
})

const a = (hora) => vi.setSystemTime(new Date(`${HOY}T${hora}:00-05:00`))
const reservaConMesa = async ({ fecha = HOY, hora = '08:00' } = {}) => {
    const id = await crearReserva(cliente, { fecha, hora, personas: 2 })
    expect((await mesero.patch(`${BASE}/${id}/estado`).send({ codigo: 'confirmada' })).status).toBe(200)
    expect((await mesero.patch(`${BASE}/${id}/mesa`).send({ mesaId: String(mesa1._id) })).status).toBe(200)
    return id
}
const sentar = (id) => mesero.post(`${BASE}/${id}/sentar`).send({})
const estadoDe = async (id) => (await Estado.findById((await Reserva.findById(id)).estado)).codigo

describe('4.6.2 · «Sentar» solo en el horario de la reserva', () => {
    it('antes de los 10 min previos → 409 «Podrás sentar esta reserva desde las 7:50 a. m.», sin cuenta ni cambio', async () => {
        const id = await reservaConMesa()
        const r = await sentar(id)
        expect(r.status).toBe(409)
        expect(r.body.error.code).toBe('RESERVA_FUERA_DE_HORARIO')
        expect(r.body.error.message).toBe('Podrás sentar esta reserva desde las 7:50 a. m.')
        expect(r.body.error.details).toMatchObject({ desde: new Date(`${HOY}T07:50:00-05:00`).toISOString() })
        expect(await Cuenta.countDocuments()).toBe(0)
        expect(await estadoDe(id)).toBe('confirmada')
    })

    it('desde las 7:50 (10 min antes) se sienta', async () => {
        const id = await reservaConMesa()
        a('07:50')
        const r = await sentar(id)
        expect(r.status, JSON.stringify(r.body)).toBe(201)
        expect(await estadoDe(id)).toBe('sentada')
    })

    it('a las 9:29 todavía se sienta (dentro de los 90 min)', async () => {
        const id = await reservaConMesa()
        a('09:29')
        expect((await sentar(id)).status).toBe(201)
    })

    it('pasados los 90 min (9:30) → 409: el horario terminó, solo queda «No llegó»', async () => {
        const id = await reservaConMesa()
        a('09:30')
        const r = await sentar(id)
        expect(r.status).toBe(409)
        expect(r.body.error.code).toBe('RESERVA_FUERA_DE_HORARIO')
        expect(r.body.error.message).toBe('El horario de esta reserva terminó a las 9:30 a. m.: márcala como «No llegó».')
        expect(await Cuenta.countDocuments()).toBe(0)
        expect((await mesero.patch(`${BASE}/${id}/estado`).send({ codigo: 'no_show' })).status).toBe(200)
    })

    it('borde inferior: a las 7:49 todavía no', async () => {
        const id = await reservaConMesa()
        a('07:49')
        expect((await sentar(id)).body.error?.code).toBe('RESERVA_FUERA_DE_HORARIO')
    })

    it('una ya sentada que se vuelve a sentar pasado su horario → RESERVA_NO_SENTABLE (no el mensaje del horario)', async () => {
        const id = await reservaConMesa()
        a('07:50')
        expect((await sentar(id)).status).toBe(201)
        a('09:30')
        expect((await sentar(id)).body.error?.code).toBe('RESERVA_NO_SENTABLE')
    })

    it('un 409 de horario con Idempotency-Key no queda guardado: ya en horario, la misma clave sienta una vez', async () => {
        const id = await reservaConMesa()
        const enviar = () => mesero.post(`${BASE}/${id}/sentar`).set('Idempotency-Key', 'sentar-h1').send({})
        expect((await enviar()).status).toBe(409)
        a('07:50')
        const primero = await enviar()
        expect(primero.status, JSON.stringify(primero.body)).toBe(201)
        const repetido = await enviar()
        expect(repetido.status).toBe(201)
        expect(repetido.body.cuenta.id).toBe(primero.body.cuenta.id)
        expect(await Cuenta.countDocuments()).toBe(1)
    })

    it('una reserva de otro día → 409 que lo dice', async () => {
        const id = await reservaConMesa({ fecha: fechaFutura(), hora: '09:00' })
        const r = await sentar(id)
        expect(r.status).toBe(409)
        expect(r.body.error.code).toBe('RESERVA_FUERA_DE_HORARIO')
        expect(r.body.error.message).toBe('Podrás sentar esta reserva el día de la reserva, desde las 8:50 a. m.')
    })
})
