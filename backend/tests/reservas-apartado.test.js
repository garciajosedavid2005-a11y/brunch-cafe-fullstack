// 4.6 · Mesa apartada con anticipación (corrección 1 de Brayan a la Fase 4): desde «Apartar la mesa desde … min
// antes» (Admin › Horarios, 60 por defecto) una reserva por llegar con mesa la deja «Reservada»: no se abre, mueve
// ni une para otros (409 MESA_RESERVADA, comprobado en la transacción). Antes, la mesa se usa y el plano trae
// cuántos minutos queda disponible. Reloj de las pruebas: jueves 2026-11-05 07:30 en Bogotá (setup.js).
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { crearConSesion } from './helpers/usuarios.js'
import { crearReserva } from './helpers/datos.js'
import Zona from '../src/modulos/salon/zona.model.js'
import Mesa from '../src/modulos/salon/mesa.model.js'
import Configuracion from '../src/modulos/configuracion/configuracion.model.js'

const HOY = '2026-11-05'
const BASE = '/api/v1/staff/reservas'
const PLANO = '/api/v1/staff/salon/mesas'
let admin, cliente, mesero, mesa1, mesa2

beforeEach(async () => {
    ;({ sesion: admin } = await crearConSesion('admin'))
    ;({ sesion: cliente } = await crearConSesion('cliente'))
    ;({ sesion: mesero } = await crearConSesion('mesero'))
    const zona = await Zona.create({ nombre: 'Interior', orden: 1 })
    mesa1 = await Mesa.create({ numero: 1, zona: zona._id, capacidad: 4 })
    mesa2 = await Mesa.create({ numero: 2, zona: zona._id, capacidad: 4 })
})

const reservaDeHoy = async ({ hora, mesa = mesa1, confirmar = true } = {}) => {
    const id = await crearReserva(cliente, { fecha: HOY, hora, personas: 2 })
    if (confirmar) expect((await mesero.patch(`${BASE}/${id}/estado`).send({ codigo: 'confirmada' })).status).toBe(200)
    expect((await mesero.patch(`${BASE}/${id}/mesa`).send({ mesaId: String(mesa._id) })).status).toBe(200)
    return id
}
const a = (hora) => vi.setSystemTime(new Date(`${HOY}T${hora}:00-05:00`))
const mesaDelPlano = async (mesa) => (await mesero.get(PLANO)).body.mesas.find((m) => m.id === String(mesa._id))
const abrir = (mesa) => mesero.post(`${PLANO}/${mesa._id}/abrir`).send({ comensales: 2 })
const horarios = async () => (await admin.get('/api/v1/admin/horarios')).body
const fijarApartado = async (apartarMesaMin) => {
    const actual = await horarios()
    return admin.put('/api/v1/admin/horarios').send({ ...actual.horarios, reservas: { ...actual.horarios.reservas, apartarMesaMin }, versionEsperada: actual.version })
}

describe('4.6 · «Apartar la mesa desde … min antes» en Admin › Horarios', () => {
    it('por defecto 60; el admin lo cambia (15 a 240, entero) y un PUT sin el campo conserva el guardado', async () => {
        expect((await horarios()).horarios.reservas.apartarMesaMin).toBe(60)
        const r = await fijarApartado(45)
        expect(r.status, JSON.stringify(r.body)).toBe(200)
        expect(r.body.horarios.reservas.apartarMesaMin).toBe(45)
        for (const malo of [14, 241, 30.5, '30', null]) {
            expect((await fijarApartado(malo)).status, String(malo)).toBe(400)
        }
        const actual = await horarios()
        const { apartarMesaMin, ...sinCampo } = actual.horarios.reservas
        expect(apartarMesaMin).toBe(45)
        const sin = await admin.put('/api/v1/admin/horarios').send({ ...actual.horarios, reservas: sinCampo, versionEsperada: actual.version })
        expect(sin.status).toBe(200)
        expect(sin.body.horarios.reservas.apartarMesaMin).toBe(45)
    })

    it('un documento de horarios anterior a 4.6 (sin el campo) se lee como 60', async () => {
        await Configuracion.updateOne({ clave: 'horarios' }, { $unset: { 'reservas.apartarMesaMin': 1 } })
        expect((await horarios()).horarios.reservas.apartarMesaMin).toBe(60)
    })
})

describe('4.6 · Mesa apartada en el plano y al abrir', () => {
    it('con 60 min: a las 7:30 la reserva de las 8:00 ya aparta la mesa (409 MESA_RESERVADA); la de las 9:00, no', async () => {
        await reservaDeHoy({ hora: '08:00' })
        await reservaDeHoy({ hora: '09:00', mesa: mesa2 })
        const apartada = (await mesaDelPlano(mesa1)).reserva
        expect(apartada).toMatchObject({ hora: '08:00', bloqueada: true, minutosDisponible: 0 })
        expect(new Date(apartada.apartadaDesde).toISOString()).toBe(new Date(`${HOY}T07:00:00-05:00`).toISOString())
        const r = await abrir(mesa1)
        expect(r.status).toBe(409)
        expect(r.body.error.code).toBe('MESA_RESERVADA')
        expect(r.body.error.message).toMatch(/8:00 a\. m\./)
        // La de las 9:00 se aparta a las 8:00: mientras tanto se usa, con 30 min disponibles
        expect((await mesaDelPlano(mesa2)).reserva).toMatchObject({ hora: '09:00', bloqueada: false, minutosDisponible: 30 })
        expect((await abrir(mesa2)).status).toBe(201)
    })

    it('con 15 min configurados, la de las 8:00 todavía no aparta la mesa (disponible 15 min) y se abre', async () => {
        expect((await fijarApartado(15)).status).toBe(200)
        await reservaDeHoy({ hora: '08:00' })
        expect((await mesaDelPlano(mesa1)).reserva).toMatchObject({ bloqueada: false, minutosDisponible: 15 })
        expect((await abrir(mesa1)).status).toBe(201)
    })

    it('una reserva pendiente con mesa también la aparta (como en F4-c)', async () => {
        await reservaDeHoy({ hora: '08:00', confirmar: false })
        expect((await mesaDelPlano(mesa1)).reserva).toMatchObject({ estado: 'pendiente', bloqueada: true })
        expect((await abrir(mesa1)).body.error?.code).toBe('MESA_RESERVADA')
    })

    it('tampoco se mueve una cuenta a la mesa apartada ni se une (409 MESA_RESERVADA)', async () => {
        await Mesa.updateMany({}, { combinable: true })
        await reservaDeHoy({ hora: '08:00', mesa: mesa2 })
        const abierta = await abrir(mesa1)
        expect(abierta.status).toBe(201)
        const mover = await mesero.post(`${PLANO}/${mesa1._id}/mover`).send({ mesaDestinoId: String(mesa2._id), versionEsperada: abierta.body.version })
        expect(mover.body.error?.code).toBe('MESA_RESERVADA')
        const unir = await mesero.post(`${PLANO}/unir`).send({ principalId: String(mesa1._id), mesaIds: [String(mesa2._id)], versionEsperada: abierta.body.version })
        expect(unir.body.error?.code).toBe('MESA_RESERVADA')
    })

    it('bordes: a las 7:00 exactas (8:00 − 60) ya está apartada; a las 6:59, no (1 min disponible)', async () => {
        await reservaDeHoy({ hora: '08:00' })
        a('06:59')
        expect((await mesaDelPlano(mesa1)).reserva).toMatchObject({ bloqueada: false, minutosDisponible: 1 })
        a('07:00')
        expect((await mesaDelPlano(mesa1)).reserva).toMatchObject({ bloqueada: true, minutosDisponible: 0 })
        expect((await abrir(mesa1)).body.error?.code).toBe('MESA_RESERVADA')
        a('06:59')
        expect((await abrir(mesa1)).status).toBe(201)
    })

    it('sin el campo (horarios anteriores a 4.6) el apartado es de 60 min también al abrir y en el plano', async () => {
        await Configuracion.updateOne({ clave: 'horarios' }, { $unset: { 'reservas.apartarMesaMin': 1 } })
        await reservaDeHoy({ hora: '08:00' })
        expect((await mesaDelPlano(mesa1)).reserva.bloqueada).toBe(true)
        expect((await abrir(mesa1)).body.error?.code).toBe('MESA_RESERVADA')
        // Sin configuración de horarios, igual
        await Configuracion.deleteMany({})
        expect((await abrir(mesa1)).body.error?.code).toBe('MESA_RESERVADA')
    })

    it('sentar a alguien de la lista de espera en una mesa apartada → 409 MESA_RESERVADA', async () => {
        await reservaDeHoy({ hora: '08:00' })
        const { body: espera } = await mesero.post('/api/v1/staff/espera').send({ nombre: 'Pedro Gómez', personas: 2, telefono: '3105556677' })
        const r = await mesero.post(`/api/v1/staff/espera/${espera.id}/sentar`).send({ mesaId: String(mesa1._id) })
        expect(r.status).toBe(409)
        expect(r.body.error.code).toBe('MESA_RESERVADA')
    })

    it('«Sentar» una reserva usa el bloque de 15 min, no el apartado de otra reserva de la misma mesa', async () => {
        await Configuracion.updateOne({ clave: 'horarios' }, { $set: { 'reservas.apartarMesaMin': 240 } })
        const temprano = await reservaDeHoy({ hora: '08:00' })
        await reservaDeHoy({ hora: '10:00' }) // con 240 min aparta la mesa desde las 6:00
        a('07:50')
        const r = await mesero.post(`${BASE}/${temprano}/sentar`).send({})
        expect(r.status, JSON.stringify(r.body)).toBe(201)
    })

    it('el plano trae la reserva cuyo apartado empieza en las próximas 2 h (10:00 sí, 11:00 no)', async () => {
        await reservaDeHoy({ hora: '10:00' })
        await reservaDeHoy({ hora: '11:00', mesa: mesa2 })
        expect((await mesaDelPlano(mesa1)).reserva).toMatchObject({ hora: '10:00', bloqueada: false, minutosDisponible: 90 })
        expect((await mesaDelPlano(mesa2)).reserva).toBeNull()
    })
})
