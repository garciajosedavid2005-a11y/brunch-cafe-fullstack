import { describe, it, expect, beforeEach } from 'vitest'
import { crearConSesion } from './helpers/usuarios.js'
import { datosReserva } from './helpers/datos.js'
import Reserva from '../src/modulos/salon/reserva.model.js'

let cliente
beforeEach(async () => {
    ;({ sesion: cliente } = await crearConSesion('cliente'))
})

const ayer = () => new Date(Date.now() - 86400000).toISOString().slice(0, 10)

describe('Reservas del cliente: /api/v1/cliente/reservas (0.8)', () => {
    it('crear, listar, editar y cancelar', async () => {
        const creada = await cliente.post('/api/v1/cliente/reservas').send(datosReserva())
        expect(creada.status).toBe(201)
        const id = creada.body.reservation._id
        expect(creada.body.reservation).toMatchObject({ personas: 2, hora: '09:00', status: 'pending' })

        const lista = await cliente.get('/api/v1/cliente/reservas')
        expect(lista.body.reservations.map((r) => r._id)).toEqual([id])

        const editada = await cliente.patch(`/api/v1/cliente/reservas/${id}`).send(datosReserva({ personas: 4 }))
        expect(editada.body.reservation.personas).toBe(4)

        const cancelada = await cliente.patch(`/api/v1/cliente/reservas/${id}/cancelar`)
        expect(cancelada.status).toBe(200)
        expect(cancelada.body.reservation.status).toBe('cancelled')
    })

    it('valida fecha futura y horario', async () => {
        expect((await cliente.post('/api/v1/cliente/reservas').send(datosReserva({ fecha: ayer() }))).status).toBe(400)
        expect((await cliente.post('/api/v1/cliente/reservas').send(datosReserva({ hora: '20:00' }))).status).toBe(400)
        expect((await cliente.post('/api/v1/cliente/reservas').send(datosReserva({ hora: '09:30' }))).status).toBe(400)
    })

})

describe('Reservas del staff: /api/v1/staff/reservas', () => {
    it('listar exige reserva:ver; cambiar estado exige reserva:cambiar_estado', async () => {
        const { body } = await cliente.post('/api/v1/cliente/reservas').send(datosReserva())
        expect((await cliente.get('/api/v1/staff/reservas')).status).toBe(403)

        const { sesion: anfitrion } = await crearConSesion('anfitrion')
        const lista = await anfitrion.get('/api/v1/staff/reservas')
        expect(lista.status).toBe(200)
        expect(lista.body[0]).toMatchObject({ id: body.reservation._id, estadoCodigo: 'pendiente' })

        const res = await anfitrion.patch(`/api/v1/staff/reservas/${body.reservation._id}/estado`).send({ codigo: 'confirmada' })
        expect(res.status).toBe(200)
        expect(res.body.estadoCodigo).toBe('confirmada')
    })
})

// 0.15e: el personal registra la reserva de un cliente: usuario null + registradaPor
describe('Reserva registrada por el personal: POST /api/v1/staff/reservas', () => {
    const datosStaff = (extra = {}) => datosReserva({ nombre: 'Laura Ruiz', correo: '', telefono: '3209876543', ...extra })

    it('queda sin usuario, con registradaPor, y sin el correo es válida', async () => {
        const { sesion: mesero, usuario: datosMesero } = await crearConSesion('mesero')
        const creada = await mesero.post('/api/v1/staff/reservas').send(datosStaff())
        expect(creada.status).toBe(201)
        expect(creada.body.reservation).toMatchObject({
            cliente: 'Laura Ruiz', telefono: '3209876543', correo: '', personas: 2, estadoCodigo: 'pendiente',
            registradaPor: { id: String(datosMesero._id), nombre: `mesero ${datosMesero.apellido}` },
        })

        const guardada = await Reserva.findById(creada.body.reservation.id).lean()
        expect(guardada.usuario).toBeNull()
        expect(String(guardada.registradaPor)).toBe(String(datosMesero._id))
    })

    it('el cliente sigue viendo solo sus reservas (ni el mesero ni un cliente con el mismo correo la ven)', async () => {
        const { sesion: mesero } = await crearConSesion('mesero')
        const { sesion: clienta, usuario: datosClienta } = await crearConSesion('cliente')
        await mesero.post('/api/v1/staff/reservas').send(datosStaff({ correo: datosClienta.correo }))

        expect((await cliente.get('/api/v1/cliente/reservas')).body.reservations).toEqual([])
        expect((await clienta.get('/api/v1/cliente/reservas')).body.reservations).toEqual([])
        expect((await mesero.get('/api/v1/cliente/reservas')).body.reservations ?? []).toEqual([])
    })

    it('el listado del staff y del admin muestra quién la registró (null si la hizo el cliente)', async () => {
        const { sesion: mesero, usuario: datosMesero } = await crearConSesion('mesero')
        await mesero.post('/api/v1/staff/reservas').send(datosStaff())
        await cliente.post('/api/v1/cliente/reservas').send(datosReserva({ hora: '10:00' }))

        const { sesion: admin } = await crearConSesion('admin')
        for (const sesion of [mesero, admin]) {
            const lista = await sesion.get('/api/v1/staff/reservas')
            expect(lista.status).toBe(200)
            const porCliente = Object.fromEntries(lista.body.map((r) => [r.cliente, r.registradaPor]))
            expect(porCliente['Laura Ruiz']).toEqual({ id: String(datosMesero._id), nombre: `mesero ${datosMesero.apellido}` })
            expect(porCliente['Ana Pérez']).toBeNull()
        }
    })

    it('nombre y teléfono del cliente son obligatorios; el correo, si viene, debe ser válido', async () => {
        const { sesion: mesero } = await crearConSesion('mesero')
        expect((await mesero.post('/api/v1/staff/reservas').send(datosStaff({ telefono: '' }))).status).toBe(400)
        expect((await mesero.post('/api/v1/staff/reservas').send(datosStaff({ nombre: '' }))).status).toBe(400)
        expect((await mesero.post('/api/v1/staff/reservas').send(datosStaff({ correo: 'no-es-correo' }))).status).toBe(400)
        const sinCampo = datosStaff()
        delete sinCampo.correo
        expect((await mesero.post('/api/v1/staff/reservas').send(sinCampo)).status).toBe(201)
    })

    it('sin reserva:crear → 403; el mesero no cambia estados', async () => {
        const { sesion: anfitrion } = await crearConSesion('anfitrion')
        expect((await anfitrion.post('/api/v1/staff/reservas').send(datosStaff())).status).toBe(403)
        const { sesion: mesero } = await crearConSesion('mesero')
        const { body } = await mesero.post('/api/v1/staff/reservas').send(datosStaff())
        expect((await mesero.patch(`/api/v1/staff/reservas/${body.reservation.id}/estado`).send({ codigo: 'confirmada' })).status).toBe(403)
    })
})
