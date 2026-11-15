// 4.2 · Aforo por franja horaria (PLAN_FASE_4, F4-2, F4-d): máximo de personas por hora en Admin › Horarios.
// General para todas las horas y, si hace falta, uno por hora; vacío = sin límite. Cuentan las reservas
// activas (pendiente, confirmada, sentada) que empiezan a esa hora; se verifica en la transacción.
import { describe, it, expect, beforeEach } from 'vitest'
import { crearConSesion } from './helpers/usuarios.js'
import { datosReserva, fechaFutura } from './helpers/datos.js'
import Reserva from '../src/modulos/salon/reserva.model.js'
import Configuracion from '../src/modulos/configuracion/configuracion.model.js'

let admin, cliente, mesero

beforeEach(async () => {
    ;({ sesion: admin } = await crearConSesion('admin'))
    ;({ sesion: cliente } = await crearConSesion('cliente'))
    ;({ sesion: mesero } = await crearConSesion('mesero'))
})

const horarios = async () => (await admin.get('/api/v1/admin/horarios')).body
const fijarAforo = async (aforo) => {
    const actual = await horarios()
    return admin.put('/api/v1/admin/horarios').send({ ...actual.horarios, reservas: { ...actual.horarios.reservas, aforo }, versionEsperada: actual.version })
}
const reservar = (extra, sesion = cliente) => sesion.post(sesion === cliente ? '/api/v1/cliente/reservas' : '/api/v1/staff/reservas').send(datosReserva(extra))

describe('4.2 · Configuración del aforo', () => {
    it('por defecto no hay límite (general null, sin horas) y el admin lo guarda con su Evento', async () => {
        expect((await horarios()).horarios.reservas.aforo).toEqual({ general: null, porHora: [] })
        const r = await fijarAforo({ general: 10, porHora: [{ hora: '09:00', maximo: 4 }] })
        expect(r.status, JSON.stringify(r.body)).toBe(200)
        expect(r.body.horarios.reservas.aforo).toEqual({ general: 10, porHora: [{ hora: '09:00', maximo: 4 }] })
        // La configuración pública (formularios) también lo trae
        expect((await cliente.get('/api/v1/horarios')).body.horarios.reservas.aforo).toEqual({ general: 10, porHora: [{ hora: '09:00', maximo: 4 }] })
    })

    it('valida: enteros de 1 a 500 (0 en una hora = sin reservas a esa hora), horas en punto y sin repetir', async () => {
        for (const aforo of [{ general: 0, porHora: [] }, { general: 501, porHora: [] }, { general: 2.5, porHora: [] },
            { general: null, porHora: [{ hora: '09:30', maximo: 2 }] }, { general: null, porHora: [{ hora: '09:00', maximo: 2 }, { hora: '09:00', maximo: 3 }] }]) {
            const r = await fijarAforo(aforo)
            expect(r.status, JSON.stringify(aforo)).toBe(400)
        }
        expect((await fijarAforo({ general: null, porHora: [{ hora: '09:00', maximo: 0 }] })).status).toBe(200)
    })

    it('quitar una hora del aforo es un cambio; un PUT sin aforo (cliente anterior) conserva el guardado', async () => {
        await fijarAforo({ general: 10, porHora: [{ hora: '09:00', maximo: 4 }] })
        const sinHora = await fijarAforo({ general: 10, porHora: [] })
        expect(sinHora.body.horarios.reservas.aforo.porHora).toEqual([])
        await fijarAforo({ general: 6, porHora: [] })
        const actual = await horarios()
        const { aforo, ...reservasSinAforo } = actual.horarios.reservas
        expect(aforo.general).toBe(6)
        const r = await admin.put('/api/v1/admin/horarios').send({ ...actual.horarios, reservas: reservasSinAforo, versionEsperada: actual.version })
        expect(r.status).toBe(200)
        expect(r.body.horarios.reservas.aforo).toEqual({ general: 6, porHora: [] })
    })

    it('un documento de horarios anterior a la Fase 4 (sin aforo) se lee como sin límite', async () => {
        await Configuracion.collection.updateOne({ clave: 'horarios' }, { $unset: { 'reservas.aforo': '' } })
        expect((await horarios()).horarios.reservas.aforo).toEqual({ general: null, porHora: [] })
    })
})

describe('4.2 · Reservas con aforo', () => {
    it('a las 9:00 caben 5 personas: 3 + 2 entran, la siguiente de 1 → 409 AFORO_COMPLETO con los cupos; a las 10:00 rige el general', async () => {
        await fijarAforo({ general: 8, porHora: [{ hora: '09:00', maximo: 5 }] })
        const fecha = fechaFutura()
        expect((await reservar({ fecha, hora: '09:00', personas: 3 })).status).toBe(201)
        expect((await reservar({ fecha, hora: '09:00', personas: 2 }, mesero)).status).toBe(201)
        const lleno = await reservar({ fecha, hora: '09:00', personas: 1 })
        expect(lleno.status).toBe(409)
        expect(lleno.body.error).toMatchObject({ code: 'AFORO_COMPLETO', details: { hora: '09:00', maximo: 5, disponibles: 0 } })
        expect(lleno.body.error.message).toMatch(/9:00 a\. m\./)
        expect((await reservar({ fecha, hora: '10:00', personas: 8 })).status).toBe(201)
        expect((await reservar({ fecha, hora: '10:00', personas: 1 })).status).toBe(409)
        // Otro día no cuenta
        expect((await reservar({ fecha: fechaFutura(14), hora: '09:00', personas: 5 })).status).toBe(201)
    })

    it('una cancelada libera sus cupos; editar la propia no se cuenta dos veces', async () => {
        await fijarAforo({ general: null, porHora: [{ hora: '09:00', maximo: 4 }] })
        const fecha = fechaFutura()
        const a = (await reservar({ fecha, hora: '09:00', personas: 4 })).body.reservation._id
        expect((await reservar({ fecha, hora: '09:00', personas: 1 })).status).toBe(409)
        // Editar la propia sin cambiar personas cabe (no se suma a sí misma)
        expect((await cliente.patch(`/api/v1/cliente/reservas/${a}`).send(datosReserva({ fecha, hora: '09:00', personas: 4, observaciones: 'Ventana' }))).status).toBe(200)
        expect((await cliente.patch(`/api/v1/cliente/reservas/${a}`).send(datosReserva({ fecha, hora: '09:00', personas: 5 }))).status).toBe(409)
        expect((await cliente.patch(`/api/v1/cliente/reservas/${a}/cancelar`)).status).toBe(200)
        expect((await reservar({ fecha, hora: '09:00', personas: 4 })).status).toBe(201)
    })

    it('dos reservas simultáneas que juntas superan el aforo: solo entra una', async () => {
        await fijarAforo({ general: null, porHora: [{ hora: '09:00', maximo: 4 }] })
        const fecha = fechaFutura()
        const res = await Promise.all([reservar({ fecha, hora: '09:00', personas: 3 }), reservar({ fecha, hora: '09:00', personas: 3 }, mesero)])
        expect(res.map((r) => r.status).sort()).toEqual([201, 409])
        expect(await Reserva.countDocuments()).toBe(1)
    })

    it('si el admin baja el aforo, editar sin ocupar más (observaciones o menos personas) no da 409; ocupar más, sí', async () => {
        const fecha = fechaFutura()
        const id = (await reservar({ fecha, hora: '09:00', personas: 4 })).body.reservation._id
        await reservar({ fecha, hora: '09:00', personas: 2 })
        await fijarAforo({ general: null, porHora: [{ hora: '09:00', maximo: 3 }] })
        expect((await cliente.patch(`/api/v1/cliente/reservas/${id}`).send(datosReserva({ fecha, hora: '09:00', personas: 4, observaciones: 'Ventana' }))).status).toBe(200)
        expect((await cliente.patch(`/api/v1/cliente/reservas/${id}`).send(datosReserva({ fecha, hora: '09:00', personas: 3 }))).status).toBe(200)
        expect((await cliente.patch(`/api/v1/cliente/reservas/${id}`).send(datosReserva({ fecha, hora: '09:00', personas: 4 }))).status).toBe(409)
    })

    it('una hora con aforo 0 no recibe reservas; el mesero no puede cambiar el aforo (403)', async () => {
        await fijarAforo({ general: null, porHora: [{ hora: '09:00', maximo: 0 }] })
        const r = await reservar({ fecha: fechaFutura(), hora: '09:00', personas: 1 })
        expect(r.status).toBe(409)
        expect(r.body.error.message).toBe('A las 9:00 a. m. no se reciben reservas. Elige otra hora.')
        const actual = await horarios()
        expect((await mesero.put('/api/v1/admin/horarios').send({ ...actual.horarios, versionEsperada: actual.version })).status).toBe(403)
    })
})
