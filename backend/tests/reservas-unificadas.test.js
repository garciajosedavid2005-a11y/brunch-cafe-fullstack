import { describe, it, expect, beforeEach } from 'vitest'
import { crearConSesion } from './helpers/usuarios.js'
import { datosReserva, fechaFutura } from './helpers/datos.js'
import Reserva from '../src/models/reserva.model.js'

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
        expect((await cliente.post('/api/v1/cliente/reservas').send(datosReserva({ hora: '15:00' }))).status).toBe(400)
    })

    it('el alias /api/customer/reservations responde igual y avisa que está deprecado', async () => {
        const res = await cliente.post('/api/customer/reservations').send(datosReserva())
        expect(res.status).toBe(201)
        expect(res.headers.deprecation).toBe('true')
        expect(res.headers.link).toContain('/api/v1/cliente/reservas')
        expect((await cliente.get('/api/customer/reservations')).body.reservations).toHaveLength(1)
    })
})

describe('Alias antiguo /api/reservas: mismo servicio, mismas validaciones', () => {
    const legado = (extra) => ({ cantidadPersonas: 2, fecha: fechaFutura(), hora: '09:00', nombre: 'Ana Pérez', correo: 'ana@example.com', motivo: 'Desayuno', ...extra })

    it('POST crea la reserva (respuesta anterior) y ahora valida fecha futura y horario', async () => {
        const ok = await cliente.post('/api/reservas').send(legado())
        expect(ok.status).toBe(200) // código de respuesta anterior
        expect(ok.headers.deprecation).toBe('true')
        expect(ok.body).toMatchObject({ cantidadPersonas: 2, hora: '09:00', estado: { codigo: 'pendiente' } })
        expect(ok.body.inicio).toBeDefined()

        expect((await cliente.post('/api/reservas').send(legado({ fecha: ayer() }))).status).toBe(400)
        expect((await cliente.post('/api/reservas').send(legado({ hora: '15:00' }))).status).toBe(400)
    })

    it('GET /mias lista las propias', async () => {
        await cliente.post('/api/reservas').send(legado())
        const res = await cliente.get('/api/reservas/mias')
        expect(res.status).toBe(200)
        expect(res.body).toHaveLength(1)
    })

    it('PATCH /:id/cancelar ya no cancela una reserva que inició (antes sí)', async () => {
        const { body } = await cliente.post('/api/reservas').send(legado())
        await Reserva.updateOne({ _id: body._id }, { $set: { inicio: new Date(Date.now() - 60000) } })
        const res = await cliente.patch(`/api/reservas/${body._id}/cancelar`)
        expect(res.status).toBe(409)
    })

    it('no puede cancelar la reserva de otro', async () => {
        const { body } = await cliente.post('/api/reservas').send(legado())
        const { sesion: otro } = await crearConSesion('cliente')
        expect((await otro.patch(`/api/reservas/${body._id}/cancelar`)).status).toBe(404)
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
