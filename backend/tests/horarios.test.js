import { describe, it, expect, beforeEach, vi } from 'vitest'
import { agente } from './helpers/app.js'
import { crearConSesion } from './helpers/usuarios.js'
import { datosReserva } from './helpers/datos.js'
import Categoria from '../src/modulos/catalogo/categoria.model.js'
import Producto from '../src/modulos/catalogo/producto.model.js'
import Configuracion from '../src/models/configuracion.model.js'
import { horasEnPunto, horasReserva, horasDomicilio } from '../src/libs/horarios.js'
import { HORARIOS_POR_DEFECTO, sembrarHorarios } from '../src/modulos/configuracion/horarios.service.js'

// El reloj de las pruebas está fijo en setup.js: jueves 2026-11-05 07:30 en Bogotá (12:30Z)
const JUEVES = '2026-11-12'
const SABADO = '2026-11-14'
const enBogota = (hora) => new Date(`2026-11-05T${hora}:00-05:00`)

describe('Utilidad de horarios (decisión 15 y N8)', () => {
    const h = HORARIOS_POR_DEFECTO

    it('horas en punto de un rango, ambos extremos incluidos', () => {
        expect(horasEnPunto({ desde: '08:00', hasta: '11:00' })).toEqual(['08:00', '09:00', '10:00', '11:00'])
    })

    it('reservas: 08–19 de lunes a viernes y 08–17 sábado y domingo', () => {
        const ahora = enBogota('07:30')
        expect(horasReserva(h, JUEVES, ahora).at(-1)).toBe('19:00')
        expect(horasReserva(h, JUEVES, ahora)).toHaveLength(12)
        expect(horasReserva(h, SABADO, ahora).at(-1)).toBe('17:00')
        expect(horasReserva(h, '2026-11-15', ahora).at(-1)).toBe('17:00') // domingo
    })

    it('reservas de hoy: solo horas que aún no pasan', () => {
        expect(horasReserva(h, '2026-11-05', enBogota('10:15'))[0]).toBe('11:00')
        expect(horasReserva(h, '2026-11-05', enBogota('19:00'))).toEqual([])
    })

    it('domicilio: mismo día, 08–16 y con al menos 1 h de anticipación', () => {
        expect(horasDomicilio(h, enBogota('07:30'))).toEqual(['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00'])
        expect(horasDomicilio(h, enBogota('06:00'))[0]).toBe('08:00')
        expect(horasDomicilio(h, enBogota('14:00'))).toEqual(['15:00', '16:00']) // justo 1 h vale
        expect(horasDomicilio(h, enBogota('14:01'))).toEqual(['16:00'])
        expect(horasDomicilio(h, enBogota('15:30'))).toEqual([])
    })
})

describe('Configuración de horarios en BD', () => {
    it('el seed crea los horarios por defecto y no pisa los editados', async () => {
        await Configuracion.deleteMany({})
        expect(await sembrarHorarios()).toEqual({ creado: true })
        await Configuracion.updateOne({ clave: 'horarios' }, { $set: { 'domicilio.hasta': '14:00' } })
        expect(await sembrarHorarios()).toEqual({ creado: false })
        expect((await Configuracion.findOne({ clave: 'horarios' })).domicilio.hasta).toBe('14:00')
    })

    it('GET /api/v1/horarios es público', async () => {
        const res = await agente().get('/api/v1/horarios')
        expect(res.status).toBe(200)
        expect(res.body.horarios).toEqual(HORARIOS_POR_DEFECTO)
        expect(res.body.zonaHoraria).toBe('America/Bogota')
    })

    it('editar exige el permiso horario:editar', async () => {
        const { sesion: cliente } = await crearConSesion('cliente')
        expect((await cliente.put('/api/v1/admin/horarios').send(HORARIOS_POR_DEFECTO)).status).toBe(403)
        expect((await agente().put('/api/v1/admin/horarios').send(HORARIOS_POR_DEFECTO)).status).toBe(401)
    })

    it('el admin edita los horarios y valida los datos', async () => {
        const { sesion: admin } = await crearConSesion('admin')
        const nuevos = structuredClone(HORARIOS_POR_DEFECTO)
        nuevos.reservas.entreSemana.hasta = '15:00'
        const res = await admin.put('/api/v1/admin/horarios').send(nuevos)
        expect(res.status).toBe(200)
        expect(res.body.horarios.reservas.entreSemana.hasta).toBe('15:00')
        expect((await admin.get('/api/v1/admin/horarios')).body.horarios.reservas.entreSemana.hasta).toBe('15:00')

        const minutos = structuredClone(HORARIOS_POR_DEFECTO)
        minutos.domicilio.desde = '08:30'
        expect((await admin.put('/api/v1/admin/horarios').send(minutos)).status).toBe(400)
        const alReves = structuredClone(HORARIOS_POR_DEFECTO)
        alReves.reservas.finDeSemana = { desde: '17:00', hasta: '08:00' }
        const malo = await admin.put('/api/v1/admin/horarios').send(alReves)
        expect(malo.status).toBe(400)
        expect(malo.body.error.code).toBe('VALIDATION_ERROR')
    })

    it('las reservas siguen el horario editado', async () => {
        const { sesion: admin } = await crearConSesion('admin')
        const { sesion: cliente } = await crearConSesion('cliente')
        expect((await cliente.post('/api/v1/cliente/reservas').send(datosReserva({ fecha: JUEVES, hora: '18:00' }))).status).toBe(201)
        const nuevos = structuredClone(HORARIOS_POR_DEFECTO)
        nuevos.reservas.entreSemana.hasta = '15:00'
        await admin.put('/api/v1/admin/horarios').send(nuevos)
        expect((await cliente.post('/api/v1/cliente/reservas').send(datosReserva({ fecha: JUEVES, hora: '18:00' }))).status).toBe(400)
    })
})

describe('Reservas: horario configurado, horas en punto y teléfono', () => {
    let cliente
    beforeEach(async () => {
        ;({ sesion: cliente } = await crearConSesion('cliente'))
    })
    const reservar = (extra) => cliente.post('/api/v1/cliente/reservas').send(datosReserva(extra))

    it('acepta la última hora del día y rechaza la siguiente', async () => {
        expect((await reservar({ fecha: JUEVES, hora: '19:00' })).status).toBe(201)
        expect((await reservar({ fecha: JUEVES, hora: '20:00' })).status).toBe(400)
        expect((await reservar({ fecha: SABADO, hora: '17:00' })).status).toBe(201)
        const tarde = await reservar({ fecha: SABADO, hora: '18:00' })
        expect(tarde.status).toBe(400)
        expect(tarde.body.error.message).toMatch(/5:00 p\. m\./)
    })

    it('solo horas en punto', async () => {
        const res = await reservar({ fecha: JUEVES, hora: '09:30' })
        expect(res.status).toBe(400)
        expect(res.body.error.details.map((d) => d.campo)).toContain('hora')
    })

    it('hoy solo se reservan horas que no han pasado', async () => {
        expect((await reservar({ fecha: '2026-11-05', hora: '07:00' })).status).toBe(400)
        expect((await reservar({ fecha: '2026-11-05', hora: '08:00' })).status).toBe(201)
    })

    it('el teléfono de contacto es obligatorio y se valida', async () => {
        const sinTelefono = datosReserva()
        delete sinTelefono.telefono
        const falta = await cliente.post('/api/v1/cliente/reservas').send(sinTelefono)
        expect(falta.status).toBe(400)
        expect(falta.body.error.details.map((d) => d.campo)).toContain('telefono')
        expect((await reservar({ telefono: 'abc' })).status).toBe(400)
        expect((await reservar({ telefono: '+++ ---' })).status).toBe(400) // sin 7 dígitos

        const ok = await reservar({ telefono: ' 300 123 4567 ' })
        expect(ok.status).toBe(201)
        expect(ok.body.reservation.telefono).toBe('300 123 4567')
    })

    it('el staff ve el teléfono de la reserva (no el del perfil)', async () => {
        await reservar({ telefono: '3001112233' })
        const { sesion: admin } = await crearConSesion('admin', { telefono: '3009999999' })
        const lista = await admin.get('/api/v1/staff/reservas')
        expect(lista.body[0].telefono).toBe('3001112233')
    })

    it('el alias /api/reservas también exige el teléfono', async () => {
        const legado = { cantidadPersonas: 2, fecha: JUEVES, hora: '09:00', nombre: 'Ana Pérez', correo: 'ana@example.com', motivo: 'Desayuno' }
        expect((await cliente.post('/api/reservas').send(legado)).status).toBe(400)
        expect((await cliente.post('/api/reservas').send({ ...legado, telefono: '3001234567' })).status).toBe(200)
    })
})

describe('Pedidos a domicilio: mismo día, ≥ 1 h, horas en punto y teléfono (N8)', () => {
    let cliente
    let base
    beforeEach(async () => {
        ;({ sesion: cliente } = await crearConSesion('cliente'))
        const categoria = await Categoria.create({ nombre: 'Bebidas' })
        const latte = await Producto.create({ codigo: 7, nombre: 'Latte', precio: 9000, categoria: categoria._id })
        const metodos = await cliente.get('/api/v1/cliente/metodos-pago')
        base = {
            items: [{ productoRef: String(latte._id), cantidad: 1 }], nombre: 'Ana Pérez', telefono: '3001234567',
            direccion: 'Carrera 36B #30-06', hora: '10:00', barrio: 'Centro', metodoPagoId: metodos.body[0].id,
        }
    })
    const pedir = (extra) => cliente.post('/api/v1/cliente/pedidos').send({ ...base, ...extra })

    it('a las 07:30 acepta las 09:00 y rechaza las 08:00 (menos de 1 h)', async () => {
        const pronto = await pedir({ hora: '08:00' })
        expect(pronto.status).toBe(400)
        expect(pronto.body.error.code).toBe('HORA_NO_DISPONIBLE')
        expect(pronto.body.error.details.horasDisponibles[0]).toBe('09:00')
        expect((await pedir({ hora: '09:00' })).status).toBe(201)
    })

    it('fuera del horario de domicilio o con minutos → 400', async () => {
        expect((await pedir({ hora: '17:00' })).body.error.code).toBe('HORA_NO_DISPONIBLE')
        expect((await pedir({ hora: '10:30' })).status).toBe(400)
    })

    it('pasada la última hora ya no se puede pedir para hoy', async () => {
        vi.setSystemTime(new Date('2026-11-06T03:30:00Z')) // 22:30 del 5 en Bogotá
        ;({ sesion: cliente } = await crearConSesion('cliente'))
        const res = await pedir({ hora: '10:00' })
        expect(res.status).toBe(400)
        expect(res.body.error.code).toBe('HORA_NO_DISPONIBLE')
        expect(res.body.error.details.horasDisponibles).toEqual([])
        expect(res.body.error.message).toMatch(/ya no hay/i)
    })

    it('el teléfono es obligatorio; se guarda y lo ve el staff', async () => {
        const sinTelefono = { ...base }
        delete sinTelefono.telefono
        const falta = await cliente.post('/api/v1/cliente/pedidos').send(sinTelefono)
        expect(falta.status).toBe(400)
        expect((await pedir({ telefono: '12' })).status).toBe(400)

        const ok = await pedir({ telefono: '300 765 4321' })
        expect(ok.status).toBe(201)
        expect(ok.body.order.delivery.telefono).toBe('300 765 4321')
        const { sesion: admin } = await crearConSesion('admin')
        const lista = await admin.get('/api/v1/staff/pedidos')
        expect(lista.body[0].telefono).toBe('300 765 4321')
    })
})
