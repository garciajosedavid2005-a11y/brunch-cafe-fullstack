// 4.6 · Pendiente de la Fase 4: las esperas de días anteriores que quedaron «esperando» se cierran solas como
// «retirada» (al consultar la lista o al arrancar el servidor), cada una con su Evento. Reloj: 2026-11-05 07:30.
import { describe, it, expect, beforeEach } from 'vitest'
import { crearConSesion } from './helpers/usuarios.js'
import Espera from '../src/modulos/salon/espera.model.js'
import Evento from '../src/modulos/compartido/evento.model.js'
import { cerrarEsperasAnteriores } from '../src/modulos/salon/espera.service.js'

const BASE = '/api/v1/staff/espera'
let mesero, creadaPor

beforeEach(async () => {
    const creado = await crearConSesion('mesero')
    mesero = creado.sesion
    creadaPor = creado.usuario._id
})

const espera = (dia, estado = 'esperando', nombre = 'Pedro Gómez') =>
    Espera.create({ nombre, personas: 2, telefono: '3105556677', estado, dia, creadaPor })

describe('4.6 · Esperas de días anteriores', () => {
    it('al consultar la lista, las de ayer que seguían «esperando» quedan «retirada» con su Evento; las de hoy y las ya cerradas, no', async () => {
        const ayer = await espera('2026-11-04')
        const antier = await espera('2026-11-03', 'esperando', 'Sofía Vargas')
        const ayerRetirada = await Espera.create({ nombre: 'Lina Ruiz', personas: 2, telefono: '3001112233', estado: 'retirada', dia: '2026-11-04', creadaPor, retiradaEn: new Date() })
        const hoy = await espera('2026-11-05', 'esperando', 'Juan Díaz')
        const r = await mesero.get(BASE)
        expect(r.status).toBe(200)
        expect(r.body.espera.map((e) => e.nombre)).toEqual(['Juan Díaz'])
        for (const e of [ayer, antier]) {
            const actual = await Espera.findById(e._id).lean()
            expect(actual.estado).toBe('retirada')
            expect(actual.retiradaEn).toBeInstanceOf(Date)
            expect(await Evento.countDocuments({ entidad: 'espera', entidadId: e._id })).toBe(1)
            const evento = await Evento.findOne({ entidad: 'espera', entidadId: e._id, tipo: 'espera_retirada' }).lean()
            expect(evento).toMatchObject({ actor: 'sistema', usuario: null, motivo: 'cerrada al terminar el día' })
        }
        expect(await Evento.countDocuments({ entidad: 'espera', entidadId: ayerRetirada._id })).toBe(0)
        expect((await Espera.findById(hoy._id).lean()).estado).toBe('esperando')
    })

    it('dos pasadas a la vez cierran cada espera una sola vez (escritura condicional)', async () => {
        const e = await espera('2026-11-04')
        const [a, b] = await Promise.all([cerrarEsperasAnteriores(), cerrarEsperasAnteriores()])
        expect(a + b).toBe(1)
        expect(await Evento.countDocuments({ entidad: 'espera', entidadId: e._id, tipo: 'espera_retirada' })).toBe(1)
    })

    it('no toca una sentada de ayer ni la fecha de una ya retirada', async () => {
        const retiradaEn = new Date('2026-11-04T20:00:00Z')
        const retirada = await Espera.create({ nombre: 'Lina Ruiz', personas: 2, telefono: '3001112233', estado: 'retirada', dia: '2026-11-04', creadaPor, retiradaEn })
        await Espera.collection.insertOne({ nombre: 'Ana Díaz', personas: 2, telefono: '3007778899', estado: 'sentada', dia: '2026-11-04', creadaPor })
        expect(await cerrarEsperasAnteriores()).toBe(0)
        expect((await Espera.findById(retirada._id).lean()).retiradaEn.toISOString()).toBe(retiradaEn.toISOString())
        expect(await Espera.countDocuments({ estado: 'sentada' })).toBe(1)
        expect(await Evento.countDocuments({ entidad: 'espera' })).toBe(0)
    })

    it('sin reserva:ver la lista responde 403 y no cierra nada', async () => {
        const { sesion: cliente } = await crearConSesion('cliente')
        const e = await espera('2026-11-04')
        expect((await cliente.get(BASE)).status).toBe(403)
        expect((await Espera.findById(e._id).lean()).estado).toBe('esperando')
    })

    it('es idempotente: una segunda pasada no cambia nada ni repite Eventos', async () => {
        await espera('2026-11-04')
        expect(await cerrarEsperasAnteriores()).toBe(1)
        expect(await cerrarEsperasAnteriores()).toBe(0)
        expect(await Evento.countDocuments({ entidad: 'espera', tipo: 'espera_retirada' })).toBe(1)
    })
})
