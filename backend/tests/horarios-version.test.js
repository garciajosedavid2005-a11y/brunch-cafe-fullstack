// 1.15 · Horarios con control de versión (como las cuentas): si otro admin guardó antes → 409, y
// «Última modificación» es la del último cambio real, no la del arranque del servidor.
import { describe, it, expect, vi } from 'vitest'
import { crearConSesion } from './helpers/usuarios.js'
import Configuracion from '../src/modulos/configuracion/configuracion.model.js'
import Evento from '../src/modulos/compartido/evento.model.js'
import { HORARIOS_POR_DEFECTO, sembrarHorarios } from '../src/modulos/configuracion/horarios.service.js'

const conDomicilioHasta = (hasta) => ({ ...HORARIOS_POR_DEFECTO, domicilio: { ...HORARIOS_POR_DEFECTO.domicilio, hasta } })
const MENSAJE = 'Otro usuario cambió los horarios; recarga para ver los cambios.'

describe('Horarios con versión (1.15)', () => {
    it('GET devuelve la versión; cada cambio la sube en 1', async () => {
        const { sesion: admin } = await crearConSesion('admin')
        expect((await admin.get('/api/v1/admin/horarios')).body.version).toBe(0)
        const res = await admin.put('/api/v1/admin/horarios').send({ ...conDomicilioHasta('17:00'), versionEsperada: 0 })
        expect(res.status, JSON.stringify(res.body)).toBe(200)
        expect(res.body.version).toBe(1)
        expect((await admin.get('/api/v1/admin/horarios')).body.version).toBe(1)
    })

    it('si otro admin guardó antes → 409 HORARIOS_MODIFICADOS con el aviso, sin cambiar nada ni dejar Evento', async () => {
        const { sesion: ana } = await crearConSesion('admin')
        const { sesion: beto } = await crearConSesion('admin')
        await ana.put('/api/v1/admin/horarios').send({ ...conDomicilioHasta('17:00'), versionEsperada: 0 }).expect(200)
        const tarde = await beto.put('/api/v1/admin/horarios').send({ ...conDomicilioHasta('15:00'), versionEsperada: 0 })
        expect(tarde.status).toBe(409)
        expect(tarde.body.error).toEqual({ code: 'HORARIOS_MODIFICADOS', message: MENSAJE, details: { version: 1 } })
        expect((await Configuracion.findOne({ clave: 'horarios' }).lean()).domicilio.hasta).toBe('17:00')
        expect(await Evento.countDocuments({ entidad: 'configuracion' })).toBe(1)
    })

    it('dos admins guardan a la vez con la misma versión: uno gana (200) y el otro recibe 409; un solo Evento', async () => {
        const { sesion: ana } = await crearConSesion('admin')
        const { sesion: beto } = await crearConSesion('admin')
        const respuestas = await Promise.all([
            ana.put('/api/v1/admin/horarios').send({ ...conDomicilioHasta('17:00'), versionEsperada: 0 }),
            beto.put('/api/v1/admin/horarios').send({ ...conDomicilioHasta('15:00'), versionEsperada: 0 }),
        ])
        expect(respuestas.map((r) => r.status).sort()).toEqual([200, 409])
        const perdedor = respuestas.find((r) => r.status === 409)
        expect(perdedor.body.error).toEqual({ code: 'HORARIOS_MODIFICADOS', message: MENSAJE, details: { version: 1 } })
        const ganador = respuestas.find((r) => r.status === 200)
        const guardado = await Configuracion.findOne({ clave: 'horarios' }).lean()
        expect(guardado.version).toBe(1)
        expect(guardado.domicilio.hasta).toBe(ganador.body.horarios.domicilio.hasta)
        expect(await Evento.countDocuments({ entidad: 'configuracion' })).toBe(1)
    })

    it('un documento con version null también se lee como 0 y se puede guardar', async () => {
        await Configuracion.collection.updateOne({ clave: 'horarios' }, { $set: { version: null } })
        const { sesion: admin } = await crearConSesion('admin')
        expect((await admin.put('/api/v1/admin/horarios').send({ ...conDomicilioHasta('17:00'), versionEsperada: 0 })).status).toBe(200)
    })

    it('la versión es obligatoria', async () => {
        const { sesion: admin } = await crearConSesion('admin')
        const res = await admin.put('/api/v1/admin/horarios').send(conDomicilioHasta('17:00'))
        expect(res.status).toBe(400)
        expect(res.body.error.code).toBe('VALIDATION_ERROR')
    })

    it('un documento anterior a 1.15 (sin versión) se lee como versión 0 y se puede guardar', async () => {
        await Configuracion.collection.updateOne({ clave: 'horarios' }, { $unset: { version: '', modificadoEn: '' } })
        const { sesion: admin } = await crearConSesion('admin')
        expect((await admin.get('/api/v1/admin/horarios')).body.version).toBe(0)
        const res = await admin.put('/api/v1/admin/horarios').send({ ...conDomicilioHasta('17:00'), versionEsperada: 0 })
        expect(res.status).toBe(200)
        expect(res.body.version).toBe(1)
    })

    it('«Última modificación» es la del último cambio real: guardar sin cambios ni arrancar el servidor la mueven', async () => {
        const { sesion: admin } = await crearConSesion('admin')
        expect((await admin.get('/api/v1/admin/horarios')).body.actualizadoEn).toBeNull() // nunca se cambió
        const cambio = await admin.put('/api/v1/admin/horarios').send({ ...conDomicilioHasta('17:00'), versionEsperada: 0 })
        const cuando = cambio.body.actualizadoEn
        expect(cuando).toBeTruthy()

        vi.setSystemTime(new Date(Date.now() + 3_600_000))
        await sembrarHorarios() // lo que hace el servidor al arrancar
        await admin.put('/api/v1/admin/horarios').send({ ...conDomicilioHasta('17:00'), versionEsperada: 1 }).expect(200) // sin cambios
        const leido = (await admin.get('/api/v1/admin/horarios')).body
        expect(leido.actualizadoEn).toBe(cuando)
        expect(leido.version).toBe(1)
    })

    it('arrancar el servidor no toca updatedAt de unos horarios existentes', async () => {
        const antes = await Configuracion.findOne({ clave: 'horarios' }).lean()
        vi.setSystemTime(new Date(Date.now() + 3_600_000))
        await sembrarHorarios()
        const despues = await Configuracion.findOne({ clave: 'horarios' }).lean()
        expect(despues.updatedAt).toEqual(antes.updatedAt)
    })

    it('guardados de 1.14 (sin modificadoEn): «Última modificación» sale del último Evento del cambio', async () => {
        const { sesion: admin } = await crearConSesion('admin')
        await admin.put('/api/v1/admin/horarios').send({ ...conDomicilioHasta('17:00'), versionEsperada: 0 }).expect(200)
        const evento = await Evento.findOne({ entidad: 'configuracion' }).lean()
        await Configuracion.collection.updateOne({ clave: 'horarios' }, { $unset: { modificadoEn: '' } })
        expect((await admin.get('/api/v1/admin/horarios')).body.actualizadoEn).toBe(evento.createdAt.toISOString())
    })
})
