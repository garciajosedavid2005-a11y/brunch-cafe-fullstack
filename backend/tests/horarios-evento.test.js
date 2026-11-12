// 1.14 · Cambiar los horarios deja un Evento con quién, cuándo, el valor anterior y el nuevo.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { crearConSesion } from './helpers/usuarios.js'
import Configuracion from '../src/modulos/configuracion/configuracion.model.js'
import Evento from '../src/modulos/compartido/evento.model.js'
import { HORARIOS_POR_DEFECTO } from '../src/modulos/configuracion/horarios.service.js'

afterEach(() => vi.restoreAllMocks())

const conDomicilioHasta =(hasta) => ({ ...HORARIOS_POR_DEFECTO, domicilio: { ...HORARIOS_POR_DEFECTO.domicilio, hasta } })

describe('Evento al cambiar los horarios (1.14)', () => {
    it('guarda quién, cuándo, el valor anterior y el nuevo', async () => {
        const { usuario, sesion: admin } = await crearConSesion('admin')
        const t0 = new Date()
        const res = await admin.put('/api/v1/admin/horarios').send(conDomicilioHasta('17:00'))
        expect(res.status, JSON.stringify(res.body)).toBe(200)

        const config = await Configuracion.findOne({ clave: 'horarios' }).lean()
        const eventos = await Evento.find({ entidad: 'configuracion' }).lean()
        expect(eventos).toHaveLength(1)
        const [evento] = eventos
        expect(evento).toMatchObject({ entidadId: config._id, tipo: 'horarios_cambiados', actor: 'admin' })
        expect(String(evento.usuario)).toBe(String(usuario._id))
        expect(evento.createdAt.getTime()).toBeGreaterThanOrEqual(t0.getTime())
        expect(evento.createdAt.getTime()).toBeLessThanOrEqual(Date.now())
        expect(evento.datos.antes).toEqual(HORARIOS_POR_DEFECTO)
        expect(evento.datos.despues).toEqual(conDomicilioHasta('17:00'))
        expect(evento.datos.cambios).toEqual(['domicilio.hasta'])
    })

    it('el segundo cambio guarda como «antes» lo que dejó el primero', async () => {
        const { sesion: admin } = await crearConSesion('admin')
        await admin.put('/api/v1/admin/horarios').send(conDomicilioHasta('17:00')).expect(200)
        await admin.put('/api/v1/admin/horarios').send(conDomicilioHasta('16:00')).expect(200)
        const eventos = await Evento.find({ entidad: 'configuracion' }).sort({ createdAt: 1, _id: 1 }).lean()
        expect(eventos.map((e) => [e.datos.antes.domicilio.hasta, e.datos.despues.domicilio.hasta])).toEqual([['16:00', '17:00'], ['17:00', '16:00']])
    })

    it('guardar sin cambios no deja Evento ni cambia quién ni cuándo (no escribe)', async () => {
        const { sesion: admin } = await crearConSesion('admin')
        const antes = await Configuracion.findOne({ clave: 'horarios' }).lean()
        await admin.put('/api/v1/admin/horarios').send(HORARIOS_POR_DEFECTO).expect(200)
        expect(await Evento.countDocuments({ entidad: 'configuracion' })).toBe(0)
        const despues = await Configuracion.findOne({ clave: 'horarios' }).lean()
        expect(despues.actualizadoPor ?? null).toBe(antes.actualizadoPor ?? null)
        expect(despues.updatedAt).toEqual(antes.updatedAt)
    })

    it('si el Evento falla, el cambio no queda (transacción)', async () => {
        const { sesion: admin } = await crearConSesion('admin')
        vi.spyOn(Evento, 'create').mockRejectedValueOnce(new Error('fallo simulado del Evento'))
        expect((await admin.put('/api/v1/admin/horarios').send(conDomicilioHasta('17:00'))).status).toBe(500)
        const config = await Configuracion.findOne({ clave: 'horarios' }).lean()
        expect(config.domicilio.hasta).toBe('16:00')
        expect(config.actualizadoPor ?? null).toBeNull()
        expect(await Evento.countDocuments({ entidad: 'configuracion' })).toBe(0)
    })

    it('un cambio rechazado (sin permiso o inválido) no deja Evento ni cambia nada', async () => {
        const { sesion: mesero } = await crearConSesion('mesero')
        const { sesion: admin } = await crearConSesion('admin')
        expect((await mesero.put('/api/v1/admin/horarios').send(conDomicilioHasta('17:00'))).status).toBe(403)
        expect((await admin.put('/api/v1/admin/horarios').send(conDomicilioHasta('25:00'))).status).toBe(400)
        expect(await Evento.countDocuments({ entidad: 'configuracion' })).toBe(0)
        expect((await Configuracion.findOne({ clave: 'horarios' }).lean()).domicilio.hasta).toBe('16:00')
    })
})
