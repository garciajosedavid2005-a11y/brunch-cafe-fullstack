import { describe, it, expect, beforeEach } from 'vitest'
import { crearConSesion } from './helpers/usuarios.js'
import { datosReserva } from './helpers/datos.js'

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
