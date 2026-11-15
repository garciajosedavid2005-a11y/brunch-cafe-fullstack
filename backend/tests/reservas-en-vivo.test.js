// 4.5 · Aviso en vivo de reservas (PLAN_FASE_4, F4-7): canal SSE `reservas` (reserva:ver). Editar una reserva
// confirmada avisa con `reserva_editada`; los demás cambios de reservas y de la lista de espera, con su tipo. Los
// avisos solo llevan tipo e ids (sin datos personales): cada pantalla vuelve a leer con su permiso.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { crearConSesion } from './helpers/usuarios.js'
import { crearReserva, datosReserva, fechaFutura } from './helpers/datos.js'
import Zona from '../src/modulos/salon/zona.model.js'
import Mesa from '../src/modulos/salon/mesa.model.js'
import { suscribir } from '../src/modulos/tiempoReal/bus.js'
import { validarCanales } from '../src/modulos/tiempoReal/eventos.routes.js'

const BASE = '/api/v1/staff/reservas'
let cliente, mesero, mesa1

beforeEach(async () => {
    ;({ sesion: cliente } = await crearConSesion('cliente'))
    ;({ sesion: mesero } = await crearConSesion('mesero'))
    const zona = await Zona.create({ nombre: 'Interior', orden: 1 })
    mesa1 = await Mesa.create({ numero: 1, zona: zona._id, capacidad: 4 })
})

/** Ejecuta `accion` y devuelve los avisos de los canales `reservas` y `plano` que llegaron mientras tanto. */
const escuchar = async (accion) => {
    const avisos = []
    const baja = suscribir(['reservas', 'plano'], (a) => avisos.push(a))
    try {
        await accion()
    } finally {
        baja()
    }
    return avisos
}

describe('4.5 · Canal `reservas`', () => {
    it('lo escucha quien tiene reserva:ver; el cliente o la cocina, no', () => {
        expect(validarCanales('reservas', { id: 'x', permisos: ['reserva:ver'] })).toEqual(['reservas'])
        expect(() => validarCanales('reservas', { id: 'x', permisos: ['pedido:crear'] })).toThrow()
        expect(() => validarCanales('reservas', { id: 'x', permisos: ['kds:ver'] })).toThrow()
    })
})

describe('4.5 · Avisos (F4-7)', () => {
    it('el cliente edita su reserva confirmada → `reserva_editada` con el id (sin datos personales), también al plano', async () => {
        const id = await crearReserva(cliente)
        await mesero.patch(`${BASE}/${id}/estado`).send({ codigo: 'confirmada' })
        const avisos = await escuchar(async () => {
            const r = await cliente.patch(`/api/v1/cliente/reservas/${id}`).send(datosReserva({ hora: '10:00' }))
            expect(r.status).toBe(200)
        })
        const editada = avisos.filter((a) => a.tipo === 'reserva_editada')
        expect(editada.map((a) => a.canal).sort()).toEqual(['plano', 'reservas'])
        expect(editada[0].ids).toEqual({ reserva: id })
        expect(JSON.stringify(avisos)).not.toMatch(/Ana|3001234567|example\.com/)
    })

    it('editar una pendiente, crearla, cambiar su estado, asignar mesa y la lista de espera avisan con `reserva_cambio` / `espera_cambio`', async () => {
        const nueva = await escuchar(() => crearReserva(cliente, { fecha: fechaFutura() }))
        expect(nueva.filter((a) => a.canal === 'reservas').map((a) => a.tipo)).toEqual(['reserva_cambio'])
        const id = await crearReserva(cliente)
        const editada = await escuchar(() => cliente.patch(`/api/v1/cliente/reservas/${id}`).send(datosReserva({ hora: '11:00' })))
        expect(editada.filter((a) => a.canal === 'reservas').map((a) => a.tipo)).toEqual(['reserva_cambio'])
        const estado = await escuchar(() => mesero.patch(`${BASE}/${id}/estado`).send({ codigo: 'confirmada' }))
        expect(estado.filter((a) => a.canal === 'reservas').map((a) => a.tipo)).toEqual(['reserva_cambio'])
        const mesa = await escuchar(() => mesero.patch(`${BASE}/${id}/mesa`).send({ mesaId: String(mesa1._id) }))
        expect(mesa.filter((a) => a.canal === 'reservas').map((a) => a.ids)).toEqual([{ reserva: id }])
        const espera = await escuchar(() => mesero.post('/api/v1/staff/espera').send({ nombre: 'Pedro Gómez', personas: 2, telefono: '3105556677' }))
        expect(espera.filter((a) => a.canal === 'reservas').map((a) => a.tipo)).toEqual(['espera_cambio'])
        expect(JSON.stringify(espera)).not.toMatch(/Pedro|3105556677/)
        // La misma mesa otra vez no cambia nada: no avisa
        expect(await escuchar(() => mesero.patch(`${BASE}/${id}/mesa`).send({ mesaId: String(mesa1._id) }))).toEqual([])
    })

    it('cancelar, registrar por el personal, sentar y la espera (sentar y retirar) también avisan, con su id', async () => {
        const id = await crearReserva(cliente)
        const cancelada = await escuchar(() => cliente.patch(`/api/v1/cliente/reservas/${id}/cancelar`))
        expect(cancelada.filter((a) => a.canal === 'reservas')).toEqual([expect.objectContaining({ tipo: 'reserva_cambio', ids: { reserva: id } })])
        const porStaff = await escuchar(async () => {
            const r = await mesero.post(BASE).send(datosReserva({ correo: '' }))
            expect(r.status).toBe(201)
        })
        expect(porStaff.filter((a) => a.canal === 'reservas').map((a) => a.tipo)).toEqual(['reserva_cambio'])
        const hoy = await crearReserva(cliente, { fecha: '2026-11-05', hora: '09:00' })
        await mesero.patch(`${BASE}/${hoy}/mesa`).send({ mesaId: String(mesa1._id) })
        vi.setSystemTime(new Date('2026-11-05T08:50:00-05:00')) // 4.6.2 · en el horario de «Sentar»
        const sentada = await escuchar(async () => expect((await mesero.post(`${BASE}/${hoy}/sentar`).send({})).status).toBe(201))
        expect(sentada.filter((a) => a.canal === 'reservas')).toEqual([expect.objectContaining({ tipo: 'reserva_cambio', ids: { reserva: hoy } })])
        const { body: e1 } = await mesero.post('/api/v1/staff/espera').send({ nombre: 'Lina Ruiz', personas: 2, telefono: '3001112233' })
        const { body: e2 } = await mesero.post('/api/v1/staff/espera').send({ nombre: 'Juan Díaz', personas: 2, telefono: '3004445566' })
        const zona = await Zona.findOne()
        const mesa2 = await Mesa.create({ numero: 2, zona: zona._id, capacidad: 4 })
        const sentarEspera = await escuchar(() => mesero.post(`/api/v1/staff/espera/${e1.id}/sentar`).send({ mesaId: String(mesa2._id) }))
        expect(sentarEspera.filter((a) => a.canal === 'reservas')).toEqual([expect.objectContaining({ tipo: 'espera_cambio', ids: { espera: e1.id } })])
        const retirar = await escuchar(() => mesero.patch(`/api/v1/staff/espera/${e2.id}/retirar`).send({}))
        expect(retirar.filter((a) => a.canal === 'reservas')).toEqual([expect.objectContaining({ tipo: 'espera_cambio', ids: { espera: e2.id } })])
    })

    it('un 409 dentro de la transacción (sentar con la mesa ocupada) no avisa', async () => {
        const id = await crearReserva(cliente, { fecha: '2026-11-05', hora: '09:00' })
        await mesero.patch(`${BASE}/${id}/mesa`).send({ mesaId: String(mesa1._id) })
        expect((await mesero.post(`/api/v1/staff/salon/mesas/${mesa1._id}/abrir`).send({ comensales: 2 })).status).toBe(201)
        vi.setSystemTime(new Date('2026-11-05T08:50:00-05:00')) // 4.6.2 · en el horario de «Sentar»
        const avisos = await escuchar(async () => {
            const r = await mesero.post(`${BASE}/${id}/sentar`).send({})
            expect(r.status).toBe(409)
            expect(r.body.error.code).toBe('MESA_NO_DISPONIBLE')
        })
        expect(avisos).toEqual([])
    })

    it('por HTTP: el cliente no abre el canal (403)', async () => {
        const r = await cliente.get('/api/v1/staff/eventos?canales=reservas')
        expect(r.status).toBe(403)
    })
})
