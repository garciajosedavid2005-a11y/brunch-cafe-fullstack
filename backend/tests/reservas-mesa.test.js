// 4.1 · Mesa asignada a una reserva (PLAN_FASE_4, F4-1, F4-a, F4-b, F4-i): bloque [inicio − 15 min, inicio + 90 min),
// sin solapamientos en la misma mesa (verificado en la transacción), capacidad y edición del cliente.
import { describe, it, expect, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { crearConSesion } from './helpers/usuarios.js'
import { crearReserva, fechaFutura } from './helpers/datos.js'
import Zona from '../src/modulos/salon/zona.model.js'
import Mesa from '../src/modulos/salon/mesa.model.js'
import Reserva from '../src/modulos/salon/reserva.model.js'
import Evento from '../src/modulos/compartido/evento.model.js'
import { solapan, DURACION_RESERVA_MIN, MARGEN_ANTES_MIN } from '../src/modulos/salon/reservas.bloque.js'

const BASE = '/api/v1/staff/reservas'
let cliente, mesero, mesa4, mesa2

beforeEach(async () => {
    ;({ sesion: cliente } = await crearConSesion('cliente'))
    ;({ sesion: mesero } = await crearConSesion('mesero'))
    const zona = await Zona.create({ nombre: 'Interior', orden: 1 })
    mesa4 = await Mesa.create({ numero: 1, zona: zona._id, capacidad: 4 })
    mesa2 = await Mesa.create({ numero: 2, zona: zona._id, capacidad: 2 })
})

const asignar = (id, mesaId, sesion = mesero) => sesion.patch(`${BASE}/${id}/mesa`).send({ mesaId })

describe('4.1 · Bloque de la reserva', () => {
    it('dura 90 min y reserva la mesa desde 15 min antes: 09:00 y 10:00 se cruzan; 09:00 y 11:00, no', () => {
        expect([DURACION_RESERVA_MIN, MARGEN_ANTES_MIN]).toEqual([90, 15])
        const a = new Date('2026-11-12T14:00:00Z')
        expect(solapan(a, new Date('2026-11-12T15:00:00Z'))).toBe(true)
        expect(solapan(a, new Date('2026-11-12T16:00:00Z'))).toBe(false)
        // Justo en el borde: 105 min de diferencia ya no se cruzan
        expect(solapan(a, new Date(a.getTime() + 105 * 60000))).toBe(false)
        expect(solapan(a, new Date(a.getTime() + 104 * 60000))).toBe(true)
    })
})

describe('4.1 · Asignar mesa', () => {
    it('el mesero asigna una mesa: la reserva la guarda, la lista la muestra y queda un Evento', async () => {
        const id = await crearReserva(cliente)
        const r = await asignar(id, String(mesa4._id))
        expect(r.status, JSON.stringify(r.body)).toBe(200)
        expect(r.body.mesa).toEqual({ id: String(mesa4._id), numero: 1, capacidad: 4 })
        expect(String((await Reserva.findById(id)).mesa)).toBe(String(mesa4._id))
        const lista = await mesero.get(BASE)
        expect(lista.body.find((x) => String(x.id) === id).mesa).toMatchObject({ numero: 1 })
        const evento = await Evento.findOne({ entidad: 'reserva', entidadId: id, tipo: 'mesa_asignada' }).lean()
        expect(evento.datos).toMatchObject({ de: null, a: 1 })
    })

    it('no se solapa con otra reserva activa de la misma mesa (409 MESA_OCUPADA_EN_HORARIO); en otra hora u otra mesa, sí', async () => {
        const fecha = fechaFutura()
        const [a, b, c] = [await crearReserva(cliente, { fecha, hora: '09:00' }), await crearReserva(cliente, { fecha, hora: '10:00' }), await crearReserva(cliente, { fecha, hora: '11:00' })]
        expect((await asignar(a, String(mesa4._id))).status).toBe(200)
        const choque = await asignar(b, String(mesa4._id))
        expect(choque.status).toBe(409)
        expect(choque.body.error.code).toBe('MESA_OCUPADA_EN_HORARIO')
        expect(choque.body.error.message).toMatch(/9:00 a\. m\./)
        expect((await asignar(b, String(mesa2._id))).status).toBe(200)
        expect((await asignar(c, String(mesa4._id))).status).toBe(200)
        expect((await Reserva.findById(b)).mesa?.toString()).toBe(String(mesa2._id))
    })

    it('una reserva cancelada ya no ocupa la mesa', async () => {
        const fecha = fechaFutura()
        const a = await crearReserva(cliente, { fecha, hora: '09:00' })
        const b = await crearReserva(cliente, { fecha, hora: '09:00' })
        expect((await asignar(a, String(mesa4._id))).status).toBe(200)
        expect((await mesero.patch(`${BASE}/${a}/estado`).send({ codigo: 'cancelada', motivo: 'El cliente llamó' })).status).toBe(200)
        expect((await asignar(b, String(mesa4._id))).status).toBe(200)
    })

    it('dos asignaciones simultáneas que se cruzan: solo una queda', async () => {
        const fecha = fechaFutura()
        const [a, b] = [await crearReserva(cliente, { fecha, hora: '09:00' }), await crearReserva(cliente, { fecha, hora: '10:00' })]
        const res = await Promise.all([asignar(a, String(mesa4._id)), asignar(b, String(mesa4._id))])
        expect(res.map((r) => r.status).sort()).toEqual([200, 409])
        expect(await Reserva.countDocuments({ mesa: mesa4._id })).toBe(1)
    })

    it('capacidad: una mesa de 2 no recibe 4 personas (409 MESA_PEQUENA)', async () => {
        const id = await crearReserva(cliente, { personas: 4 })
        const r = await asignar(id, String(mesa2._id))
        expect(r.status).toBe(409)
        expect(r.body.error.code).toBe('MESA_PEQUENA')
    })

    it('quitar la mesa (mesaId null), mesa inexistente o inactiva, reserva final y permisos', async () => {
        const id = await crearReserva(cliente)
        expect((await asignar(id, String(mesa4._id))).status).toBe(200)
        const quitar = await asignar(id, null)
        expect(quitar.status).toBe(200)
        expect(quitar.body.mesa).toBeNull()
        const inexistente = (await asignar(id, '0123456789abcdef01234567')).body.error
        expect(inexistente.code).toBe('MESA_NO_ENCONTRADA')
        // Mensaje en español con sus tildes (protege contra un archivo mal codificado)
        expect(inexistente.message).toBe('La mesa no existe o está inactiva.')
        await Mesa.updateOne({ _id: mesa2._id }, { activa: false })
        expect((await asignar(id, String(mesa2._id))).body.error.code).toBe('MESA_NO_ENCONTRADA')
        expect((await asignar('0123456789abcdef01234567', String(mesa4._id))).status).toBe(404)
        expect((await asignar(id, 'no-es-un-id')).status).toBe(400)
        expect((await asignar(id, String(mesa4._id), cliente)).status).toBe(403)
        await mesero.patch(`${BASE}/${id}/estado`).send({ codigo: 'cancelada', motivo: 'El cliente llamó' })
        const final = await asignar(id, String(mesa4._id))
        expect(final.status).toBe(409)
        expect(final.body.error.code).toBe('RESERVA_NO_EDITABLE')
    })
})

describe('4.1 · Edición del cliente (F4-i)', () => {
    it('si la nueva hora choca con otra reserva de la mesa, la mesa se quita; si no choca, se conserva', async () => {
        const fecha = fechaFutura()
        const otra = await crearReserva(cliente, { fecha, hora: '11:00' })
        const mia = await crearReserva(cliente, { fecha, hora: '08:00' })
        expect((await asignar(otra, String(mesa4._id))).status).toBe(200)
        expect((await asignar(mia, String(mesa4._id))).status).toBe(200)
        const datos = { nombre: 'Ana Pérez', correo: 'ana@example.com', telefono: '3001234567', motivo: 'Desayuno', personas: 2, fecha }
        // 09:00 no choca con 11:00 (105 min): conserva la mesa
        expect((await cliente.patch(`/api/v1/cliente/reservas/${mia}`).send({ ...datos, hora: '09:00' })).status).toBe(200)
        expect(String((await Reserva.findById(mia)).mesa)).toBe(String(mesa4._id))
        // 10:00 choca con 11:00: la pierde
        expect((await cliente.patch(`/api/v1/cliente/reservas/${mia}`).send({ ...datos, hora: '10:00' })).status).toBe(200)
        expect((await Reserva.findById(mia)).mesa).toBeNull()
    })

    it('confirmada en una mesa de 2: si el cliente sube a 4 personas pierde la mesa, vuelve a pendiente y queda el Evento', async () => {
        const id = await crearReserva(cliente)
        expect((await mesero.patch(`${BASE}/${id}/estado`).send({ codigo: 'confirmada' })).status).toBe(200)
        expect((await asignar(id, String(mesa2._id))).status).toBe(200)
        const r = await cliente.patch(`/api/v1/cliente/reservas/${id}`).send({ nombre: 'Ana Pérez', correo: 'ana@example.com', telefono: '3001234567', motivo: 'Desayuno', personas: 4, fecha: fechaFutura(), hora: '09:00' })
        expect(r.status).toBe(200)
        const guardada = await Reserva.findById(id).populate('estado', 'codigo')
        expect([guardada.mesa, guardada.estado.codigo]).toEqual([null, 'pendiente'])
        const evento = await Evento.findOne({ entidad: 'reserva', entidadId: id, tipo: 'mesa_asignada', 'datos.a': null }).lean()
        expect(evento).toMatchObject({ motivo: 'la reserva editada ya no cabe en la mesa', datos: { de: 2 } })
        expect(String(evento.datos.mesaDe)).toBe(String(mesa2._id))
    })

    it('si la mesa quedó inactiva, al editar la reserva la pierde', async () => {
        const id = await crearReserva(cliente)
        expect((await asignar(id, String(mesa4._id))).status).toBe(200)
        await Mesa.updateOne({ _id: mesa4._id }, { activa: false })
        expect((await cliente.patch(`/api/v1/cliente/reservas/${id}`).send({ nombre: 'Ana Pérez', correo: 'ana@example.com', telefono: '3001234567', motivo: 'Otro', personas: 2, fecha: fechaFutura(), hora: '09:00' })).status).toBe(200)
        expect((await Reserva.findById(id)).mesa).toBeNull()
    })
})

describe('4.1 · Casos borde (revisor-backend)', () => {
    it('la reserva que se asigna sin `inicio` (anterior a 0.10) se compara por su fecha y hora', async () => {
        // Las guardadas tienen `inicio` (migración 0.10 y el pre-validate); aquí falta solo en la que se asigna
        const fecha = fechaFutura()
        const [a, b] = [await crearReserva(cliente, { fecha, hora: '09:00' }), await crearReserva(cliente, { fecha, hora: '10:00' })]
        await Reserva.collection.updateOne({ _id: new mongoose.Types.ObjectId(b) }, { $unset: { inicio: '' } })
        expect((await asignar(a, String(mesa4._id))).status).toBe(200)
        expect((await asignar(b, String(mesa4._id))).body.error?.code).toBe('MESA_OCUPADA_EN_HORARIO')
    })

    it('la misma mesa otra vez no escribe otro Evento; una reserva ya pasada → 409 RESERVA_VENCIDA', async () => {
        const id = await crearReserva(cliente)
        await asignar(id, String(mesa4._id))
        expect((await asignar(id, String(mesa4._id))).status).toBe(200)
        expect(await Evento.countDocuments({ entidadId: id, tipo: 'mesa_asignada' })).toBe(1)
        await Reserva.collection.updateOne({ _id: (await Reserva.findById(id))._id }, { $set: { inicio: new Date(Date.now() - 2 * 3600 * 1000), mesa: null } })
        const r = await asignar(id, String(mesa4._id))
        expect(r.status).toBe(409)
        expect(r.body.error.code).toBe('RESERVA_VENCIDA')
    })
})
