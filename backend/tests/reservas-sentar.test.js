// 4.3 · Plano con reservas próximas, mesa reservada, «Sentar» y no-show (PLAN_FASE_4, F4-3, F4-5, F4-6, F4-c, F4-e,
// F4-f, F4-g). Reloj de las pruebas: jueves 2026-11-05 07:30 en Bogotá (setup.js).
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { crearConSesion } from './helpers/usuarios.js'
import { crearReserva, fechaFutura } from './helpers/datos.js'
import Zona from '../src/modulos/salon/zona.model.js'
import Mesa from '../src/modulos/salon/mesa.model.js'
import Reserva from '../src/modulos/salon/reserva.model.js'
import Cuenta from '../src/modulos/salon/cuenta.model.js'
import Evento from '../src/modulos/compartido/evento.model.js'
import Rol from '../src/modulos/identidad/rol.model.js'

const HOY = '2026-11-05'
const BASE = '/api/v1/staff/reservas'
const PLANO = '/api/v1/staff/salon/mesas'
let cliente, mesero, mesa1, mesa2

beforeEach(async () => {
    ;({ sesion: cliente } = await crearConSesion('cliente'))
    ;({ sesion: mesero } = await crearConSesion('mesero'))
    const zona = await Zona.create({ nombre: 'Interior', orden: 1 })
    mesa1 = await Mesa.create({ numero: 1, zona: zona._id, capacidad: 4 })
    mesa2 = await Mesa.create({ numero: 2, zona: zona._id, capacidad: 4 })
})

const a = (hora) => vi.setSystemTime(new Date(`${HOY}T${hora}:00-05:00`))
/** Reserva de hoy a `hora`, en `mesa` y en `estado` (confirmada por defecto). */
const reservaDeHoy = async ({ hora = '08:00', mesa = mesa1, estado = 'confirmada', personas = 3 } = {}) => {
    const id = await crearReserva(cliente, { fecha: HOY, hora, personas })
    if (estado === 'confirmada') expect((await mesero.patch(`${BASE}/${id}/estado`).send({ codigo: 'confirmada' })).status).toBe(200)
    if (mesa) expect((await mesero.patch(`${BASE}/${id}/mesa`).send({ mesaId: String(mesa._id) })).status).toBe(200)
    return id
}
const mesaDelPlano = async (mesa) => (await mesero.get(PLANO)).body.mesas.find((m) => m.id === String(mesa._id))
const abrir = (mesa) => mesero.post(`${PLANO}/${mesa._id}/abrir`).send({ comensales: 2 })
const sentar = (id, cuerpo = {}) => mesero.post(`${BASE}/${id}/sentar`).send(cuerpo)

describe('4.3 · Plano con reservas próximas (F4-e)', () => {
    it('la mesa muestra su próxima reserva; antes del apartado (4.6: 60 min) no está bloqueada', async () => {
        const id = await reservaDeHoy({ hora: '09:00' })
        const m = await mesaDelPlano(mesa1)
        expect(m.reserva).toMatchObject({ id, cliente: 'Ana Pérez', personas: 3, hora: '09:00', estado: 'confirmada', bloqueada: false })
        expect(m.reserva.codigo).toMatch(/^RES-/)
        expect((await mesaDelPlano(mesa2)).reserva).toBeNull()
    })

    it('una reserva cuyo apartado empieza en más de 2 h no sale; una sentada, cancelada o no-show tampoco', async () => {
        await reservaDeHoy({ hora: '11:00' })
        expect((await mesaDelPlano(mesa1)).reserva).toBeNull()
        const id = await reservaDeHoy({ hora: '08:00', mesa: mesa2 })
        expect((await mesero.patch(`${BASE}/${id}/estado`).send({ codigo: 'no_show' })).status).toBe(200)
        expect((await mesaDelPlano(mesa2)).reserva).toBeNull()
    })
})

describe('4.3 · Mesa reservada (F4-c)', () => {
    it('desde el apartado (4.6: 60 min antes) la mesa no se abre para otra persona (409 MESA_RESERVADA); antes, sí', async () => {
        await reservaDeHoy({ hora: '08:00' })
        a('06:55')
        expect((await mesaDelPlano(mesa1)).reserva.bloqueada).toBe(false)
        a('07:01')
        expect((await mesaDelPlano(mesa1)).reserva.bloqueada).toBe(true)
        const r = await abrir(mesa1)
        expect(r.status).toBe(409)
        expect(r.body.error.code).toBe('MESA_RESERVADA')
        expect(r.body.error.message).toMatch(/Ana Pérez.*8:00 a\. m\./)
        expect(await Cuenta.countDocuments()).toBe(0)
        // La otra mesa se abre sin problema
        expect((await abrir(mesa2)).status).toBe(201)
    })

    it('antes del apartado la mesa se abre normalmente', async () => {
        await reservaDeHoy({ hora: '08:00' })
        a('06:50')
        expect((await abrir(mesa1)).status).toBe(201)
    })

    it('marcada como no-show (también desde pendiente, F4-g), la mesa queda libre para otros', async () => {
        const id = await reservaDeHoy({ hora: '08:00', estado: 'pendiente' })
        a('08:20')
        expect((await abrir(mesa1)).body.error?.code).toBe('MESA_RESERVADA')
        const r = await mesero.patch(`${BASE}/${id}/estado`).send({ codigo: 'no_show' })
        expect(r.status, JSON.stringify(r.body)).toBe(200)
        expect((await abrir(mesa1)).status).toBe(201)
    })
})

describe('4.3 · «Sentar» abre la cuenta en la mesa asignada (F4-6, F4-f)', () => {
    it('sienta la reserva confirmada: queda sentada con su cuenta (comensales = personas) y la mesa ocupada', async () => {
        const id = await reservaDeHoy({ hora: '08:00', personas: 3 })
        a('07:55')
        const r = await sentar(id)
        expect(r.status, JSON.stringify(r.body)).toBe(201)
        expect(r.body.reserva).toMatchObject({ id, estadoCodigo: 'sentada' })
        expect(r.body.cuenta).toMatchObject({ comensales: 3, estado: 'abierta' })
        const reserva = await Reserva.findById(id).populate('estado', 'codigo')
        expect([reserva.estado.codigo, String(reserva.cuenta)]).toEqual(['sentada', r.body.cuenta.id])
        const mesa = await Mesa.findById(mesa1._id)
        expect([mesa.estado, String(mesa.cuentaActual)]).toEqual(['ocupada', r.body.cuenta.id])
        expect(await Evento.countDocuments({ entidad: 'reserva', entidadId: id, a: 'sentada' })).toBe(1)
        expect(await Evento.findOne({ entidad: 'cuenta', entidadId: r.body.cuenta.id, a: 'abierta' }).lean()).toMatchObject({ datos: { reserva: `RES-${id.slice(-6).toUpperCase()}` } })
        // Ya sentada: no se vuelve a sentar
        expect((await sentar(id)).body.error.code).toBe('RESERVA_NO_SENTABLE')
    })

    it('también una pendiente que llega (check-in sin confirmar), desde 10 min antes (4.6.2)', async () => {
        const id = await reservaDeHoy({ hora: '09:00', estado: 'pendiente' })
        a('08:50')
        expect((await sentar(id)).status).toBe(201)
    })

    it('sin mesa → 409 RESERVA_SIN_MESA; otro día → 409 RESERVA_FUERA_DE_HORARIO; sin permiso → 403', async () => {
        const sinMesa = await reservaDeHoy({ hora: '08:00', mesa: null })
        expect((await sentar(sinMesa)).body.error.code).toBe('RESERVA_SIN_MESA')
        const otroDia = await crearReserva(cliente, { fecha: fechaFutura() })
        expect((await mesero.patch(`${BASE}/${otroDia}/mesa`).send({ mesaId: String(mesa2._id) })).status).toBe(200)
        expect((await sentar(otroDia)).body.error.code).toBe('RESERVA_FUERA_DE_HORARIO')
        expect((await cliente.post(`${BASE}/${sinMesa}/sentar`).send({})).status).toBe(403)
        expect((await sentar('0123456789abcdef01234567')).status).toBe(404)
    })

    it('si la mesa está ocupada no se sienta y la reserva sigue confirmada (todo o nada)', async () => {
        const id = await reservaDeHoy({ hora: '09:00' })
        expect((await abrir(mesa1)).status).toBe(201) // 7:30: aún no está reservada
        a('08:50')
        const r = await sentar(id)
        expect(r.status).toBe(409)
        expect(r.body.error.code).toBe('MESA_NO_DISPONIBLE')
        expect((await Reserva.findById(id).populate('estado', 'codigo')).estado.codigo).toBe('confirmada')
        expect(await Cuenta.countDocuments()).toBe(1)
    })

    it('dos «Sentar» a la vez: una sola cuenta', async () => {
        const id = await reservaDeHoy({ hora: '08:00' })
        a('07:50')
        const res = await Promise.all([sentar(id), sentar(id)])
        expect(res.map((r) => r.status).sort()).toEqual([201, 409])
        expect(await Cuenta.countDocuments()).toBe(1)
        const cuenta = await Cuenta.findOne().lean()
        expect(String((await Reserva.findById(id)).cuenta)).toBe(String(cuenta._id))
        expect(await Evento.countDocuments({ entidad: 'reserva', entidadId: id, a: 'sentada' })).toBe(1)
    })

    it('con la misma Idempotency-Key el reintento devuelve la misma cuenta', async () => {
        const id = await reservaDeHoy({ hora: '08:00' })
        a('07:50')
        const enviar = () => mesero.post(`${BASE}/${id}/sentar`).set('Idempotency-Key', 'sentar-1').send({})
        const [primero, segundo] = [await enviar(), await enviar()]
        expect([primero.status, segundo.status]).toEqual([201, 201])
        expect(segundo.body.cuenta.id).toBe(primero.body.cuenta.id)
        expect(await Cuenta.countDocuments()).toBe(1)
    })

    it('el admin (no atiende mesas) indica el mesero; sin él → 400 MESERO_REQUERIDO y nada cambia', async () => {
        const { sesion: admin } = await crearConSesion('admin')
        const { usuario: otro } = await crearConSesion('mesero')
        const id = await reservaDeHoy({ hora: '08:00' })
        a('07:50')
        const sin = await admin.post(`${BASE}/${id}/sentar`).send({})
        expect(sin.status).toBe(400)
        expect(sin.body.error.code).toBe('MESERO_REQUERIDO')
        expect((await Reserva.findById(id).populate('estado', 'codigo')).estado.codigo).toBe('confirmada')
        const con = await admin.post(`${BASE}/${id}/sentar`).send({ meseroId: String(otro._id) })
        expect(con.status, JSON.stringify(con.body)).toBe(201)
        expect(con.body.cuenta.mesero).toBe(String(otro._id))
    })

    it('con reserva:cambiar_estado pero sin cuenta:abrir → 403, sin cuenta ni cambio de estado', async () => {
        await Rol.create({ nombre: 'recepcion', permisos: ['reserva:ver', 'reserva:cambiar_estado'] })
        const { sesion: recepcion } = await crearConSesion('recepcion')
        const id = await reservaDeHoy({ hora: '08:00' })
        expect((await recepcion.post(`${BASE}/${id}/sentar`).send({})).status).toBe(403)
        expect(await Cuenta.countDocuments()).toBe(0)
        expect((await Reserva.findById(id).populate('estado', 'codigo')).estado.codigo).toBe('confirmada')
    })

    it('defensa: no se sienta la reserva A en una mesa que otra reserva B tiene en su bloque', async () => {
        // 4.6.2 · Con reservas válidas no ocurre (el horario de «Sentar» no se cruza con el bloque de otra reserva de la
        // mesa, F4-1): se fuerza el dato en la BD para probar la comprobación dentro de la transacción
        const b = await reservaDeHoy({ hora: '08:00' })
        const aId = await reservaDeHoy({ hora: '08:00', mesa: mesa2 })
        await Reserva.updateOne({ _id: aId }, { $set: { mesa: mesa1._id } })
        a('07:50')
        const r = await sentar(aId)
        expect(r.status).toBe(409)
        expect(r.body.error.code).toBe('MESA_RESERVADA')
        expect(r.body.error.details.reserva).toBe(`RES-${b.slice(-6).toUpperCase()}`)
        expect((await Reserva.findById(aId).populate('estado', 'codigo')).estado.codigo).toBe('confirmada')
    })
})

describe('4.3 · Revisores: sentar por cambio de estado, mover y unir', () => {
    it('una reserva con mesa no pasa a «sentada» por PATCH /estado (409 USA_SENTAR) ni lo ofrece; sin mesa, sí', async () => {
        const conMesa = await reservaDeHoy({ hora: '08:00' })
        const r = await mesero.patch(`${BASE}/${conMesa}/estado`).send({ codigo: 'sentada' })
        expect(r.status).toBe(409)
        expect(r.body.error.code).toBe('USA_SENTAR')
        const lista = (await mesero.get(BASE)).body
        expect(lista.find((x) => String(x.id) === conMesa).transiciones.map((t) => t.codigo)).not.toContain('sentada')
        const sinMesa = await reservaDeHoy({ hora: '09:00', mesa: null })
        expect((await mesero.patch(`${BASE}/${sinMesa}/estado`).send({ codigo: 'sentada' })).status).toBe(200)
    })

    it('no se mueve una cuenta a una mesa reservada ni se une una mesa reservada (409 MESA_RESERVADA)', async () => {
        await Mesa.updateMany({}, { combinable: true })
        await reservaDeHoy({ hora: '08:00', mesa: mesa2 })
        a('07:50')
        const abierta = await abrir(mesa1)
        expect(abierta.status).toBe(201)
        const mover = await mesero.post(`${PLANO}/${mesa1._id}/mover`).send({ mesaDestinoId: String(mesa2._id), versionEsperada: abierta.body.version })
        expect(mover.body.error?.code).toBe('MESA_RESERVADA')
        const unir = await mesero.post(`${PLANO}/unir`).send({ principalId: String(mesa1._id), mesaIds: [String(mesa2._id)], versionEsperada: abierta.body.version })
        expect(unir.body.error?.code).toBe('MESA_RESERVADA')
        expect((await Mesa.findById(mesa2._id)).estado).toBe('libre')
    })
})
