// 4.6 · Pendiente de la Fase 4: al cobrar o cerrar la cuenta de una reserva sentada, la reserva pasa sola a
// «completada», con su Evento (en la misma transacción) y el aviso en vivo. Reloj: 2026-11-05 07:30 en Bogotá.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import mongoose from 'mongoose'
import { crearConSesion } from './helpers/usuarios.js'
import { categoriaDePrueba, crearReserva } from './helpers/datos.js'
import Producto from '../src/modulos/catalogo/producto.model.js'
import Zona from '../src/modulos/salon/zona.model.js'
import Mesa from '../src/modulos/salon/mesa.model.js'
import Cuenta from '../src/modulos/salon/cuenta.model.js'
import Reserva from '../src/modulos/salon/reserva.model.js'
import Estado from '../src/modulos/compartido/estado.model.js'
import Evento from '../src/modulos/compartido/evento.model.js'
import { PERMISOS_CAJA, PERMISOS_SALON } from '../src/modulos/identidad/permisos.js'
import { abrirTurno } from '../src/modulos/caja/turno.service.js'
import { suscribir } from '../src/modulos/tiempoReal/bus.js'
import {
    abrirCuenta, agregarItem, enviarRonda, solicitarCuenta, cobrarCuenta, cobrarParte, cerrarSinCobro, cancelarCuenta,
} from '../src/modulos/salon/cuentas.service.js'

const { ObjectId } = mongoose.Types
const HOY = '2026-11-05'
const BASE = '/api/v1/staff/reservas'
const admin = { id: String(new ObjectId()), rol: 'admin', permisos: ['*'] }
let cliente, meseroHttp, mesero, mesa1, huevos

beforeEach(async () => {
    ;({ sesion: cliente } = await crearConSesion('cliente'))
    const creado = await crearConSesion('mesero')
    meseroHttp = creado.sesion
    mesero = { id: String(creado.usuario._id), rol: 'mesero', permisos: PERMISOS_SALON.mesero }
    const zona = await Zona.create({ nombre: 'Interior', orden: 1 })
    mesa1 = await Mesa.create({ numero: 1, zona: zona._id, capacidad: 4 })
    const platos = await categoriaDePrueba('Desayunos')
    huevos = await Producto.create({ codigo: 1, nombre: 'Huevos pericos', precio: 15000, categoria: platos._id })
    await abrirTurno({ base: 0 }, admin)
})

const estadoDe = async (id) => (await Estado.findById((await Reserva.findById(id)).estado)).codigo
/** Reserva de hoy a las 8:00 en la mesa 1, sentada a las 7:50 → { reservaId, cuentaId } */
const sentada = async () => {
    const reservaId = await crearReserva(cliente, { fecha: HOY, hora: '08:00', personas: 2 })
    expect((await meseroHttp.patch(`${BASE}/${reservaId}/estado`).send({ codigo: 'confirmada' })).status).toBe(200)
    expect((await meseroHttp.patch(`${BASE}/${reservaId}/mesa`).send({ mesaId: String(mesa1._id) })).status).toBe(200)
    vi.setSystemTime(new Date(`${HOY}T07:50:00-05:00`))
    const r = await meseroHttp.post(`${BASE}/${reservaId}/sentar`).send({})
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    return { reservaId, cuentaId: r.body.cuenta.id }
}
const version = async (cuentaId) => (await Cuenta.findById(cuentaId).lean()).version
const conConsumo = async (cuentaId) => {
    await agregarItem(cuentaId, { productoId: String(huevos._id), cantidad: 2 }, mesero)
    await enviarRonda(cuentaId, { numeroRonda: 1, versionEsperada: await version(cuentaId) }, mesero)
    await solicitarCuenta(cuentaId, { versionEsperada: await version(cuentaId) }, mesero)
}
const escuchar = async (accion) => {
    const avisos = []
    const baja = suscribir(['reservas'], (a) => avisos.push(a))
    try {
        await accion()
    } finally {
        baja()
    }
    return avisos
}

describe('4.6 · Cerrar la cuenta completa la reserva sentada', () => {
    it('al cobrar: la reserva pasa a «completada» con su Evento y avisa en vivo', async () => {
        const { reservaId, cuentaId } = await sentada()
        expect(String((await Cuenta.findById(cuentaId).lean()).reserva)).toBe(reservaId)
        await conConsumo(cuentaId)
        const versionEsperada = await version(cuentaId)
        const avisos = await escuchar(() => cobrarCuenta(cuentaId, { versionEsperada, propina: 0, pagos: [{ metodo: 'tarjeta', monto: 30000 }] }, admin))
        expect((await Cuenta.findById(cuentaId).lean()).estado).toBe('cerrada')
        expect(await estadoDe(reservaId)).toBe('completada')
        const evento = await Evento.findOne({ entidad: 'reserva', entidadId: reservaId, a: 'completada' }).lean()
        expect(evento).toMatchObject({ de: 'sentada' })
        expect(avisos).toContainEqual(expect.objectContaining({ ids: { reserva: reservaId } }))
    })

    it('al cerrar sin cobro, también', async () => {
        const { reservaId, cuentaId } = await sentada()
        await conConsumo(cuentaId)
        await cerrarSinCobro(cuentaId, { motivo: 'Cortesía de la casa', versionEsperada: await version(cuentaId) }, admin)
        expect(await estadoDe(reservaId)).toBe('completada')
    })

    it('al cancelar la cuenta (se fueron sin pedir), también: la reserva ya se atendió', async () => {
        const { reservaId, cuentaId } = await sentada()
        await cancelarCuenta(cuentaId, { motivo: 'Se fueron sin pedir', versionEsperada: await version(cuentaId) }, mesero)
        expect(await estadoDe(reservaId)).toBe('completada')
    })

    it('una cuenta sin reserva se cierra igual y no toca otra reserva sentada', async () => {
        const { reservaId } = await sentada()
        const otra = await Mesa.create({ numero: 2, zona: mesa1.zona, capacidad: 4 })
        const cuenta = await abrirCuenta({ mesaId: String(otra._id), comensales: 2 }, mesero)
        const versionEsperada = await version(cuenta.id)
        const avisos = await escuchar(() => cancelarCuenta(cuenta.id, { motivo: 'Abierta por error', versionEsperada }, mesero))
        expect(await estadoDe(reservaId)).toBe('sentada')
        expect(await Evento.countDocuments({ entidad: 'reserva', a: 'completada' })).toBe(0)
        expect(avisos).toEqual([])
    })

    it('el cajero (sin reserva:cambiar_estado) cobra y la reserva se completa; el Evento queda como «sistema» con quien cobró', async () => {
        const { reservaId, cuentaId } = await sentada()
        await conConsumo(cuentaId)
        const cajero = { id: String(new ObjectId()), rol: 'cajero', permisos: PERMISOS_CAJA.cajero }
        await cobrarCuenta(cuentaId, { versionEsperada: await version(cuentaId), propina: 0, pagos: [{ metodo: 'efectivo', monto: 30000, recibido: 30000 }] }, cajero)
        expect(await estadoDe(reservaId)).toBe('completada')
        const evento = await Evento.findOne({ entidad: 'reserva', entidadId: reservaId, a: 'completada' }).lean()
        expect(evento).toMatchObject({ actor: 'sistema', motivo: expect.stringMatching(/^cuenta C-\d+ cobrada$/) })
        expect(String(evento.usuario)).toBe(cajero.id)
    })

    it('el Evento dice cómo se cerró: «cerrada sin cobro» y «cancelada»', async () => {
        const uno = await sentada()
        await conConsumo(uno.cuentaId)
        await cerrarSinCobro(uno.cuentaId, { motivo: 'Cortesía de la casa', versionEsperada: await version(uno.cuentaId) }, admin)
        expect((await Evento.findOne({ entidad: 'reserva', entidadId: uno.reservaId, a: 'completada' }).lean()).motivo).toMatch(/ cerrada sin cobro$/)
        vi.setSystemTime(new Date(`${HOY}T07:30:00-05:00`))
        await Mesa.updateOne({ _id: mesa1._id }, { estado: 'libre', cuentaActual: null })
        const dos = await sentada()
        await cancelarCuenta(dos.cuentaId, { motivo: 'Se fueron sin pedir', versionEsperada: await version(dos.cuentaId) }, mesero)
        expect((await Evento.findOne({ entidad: 'reserva', entidadId: dos.reservaId, a: 'completada' }).lean()).motivo).toMatch(/ cancelada$/)
    })

    it('por partes: una parte intermedia la deja «sentada» (sin aviso); la última la completa', async () => {
        const { reservaId, cuentaId } = await sentada()
        await conConsumo(cuentaId)
        const parte = async () => cobrarParte(cuentaId, { versionEsperada: await version(cuentaId), propina: 0, pagos: [{ metodo: 'tarjeta', monto: 15000 }], division: { modo: 'iguales', partes: 2 } }, admin)
        const primera = await escuchar(parte)
        expect(await estadoDe(reservaId)).toBe('sentada')
        expect(primera).toEqual([])
        const ultima = await escuchar(parte)
        expect(await estadoDe(reservaId)).toBe('completada')
        expect(ultima).toContainEqual(expect.objectContaining({ ids: { reserva: reservaId } }))
        expect(await Evento.countDocuments({ entidad: 'reserva', entidadId: reservaId, a: 'completada' })).toBe(1)
    })

    it('si ya se completó a mano, el cobro no falla ni repite el Evento', async () => {
        const { reservaId, cuentaId } = await sentada()
        await conConsumo(cuentaId)
        expect((await meseroHttp.patch(`${BASE}/${reservaId}/estado`).send({ codigo: 'completada' })).status).toBe(200)
        await cobrarCuenta(cuentaId, { versionEsperada: await version(cuentaId), propina: 0, pagos: [{ metodo: 'tarjeta', monto: 30000 }] }, admin)
        expect((await Cuenta.findById(cuentaId).lean()).estado).toBe('cerrada')
        expect(await Evento.countDocuments({ entidad: 'reserva', entidadId: reservaId, a: 'completada' })).toBe(1)
    })

    it('todo o nada: si el cobro falla (sin turno de caja abierto), la reserva sigue «sentada»', async () => {
        const { reservaId, cuentaId } = await sentada()
        await conConsumo(cuentaId)
        await mongoose.connection.collection('turnosCaja').deleteMany({})
        await expect(cobrarCuenta(cuentaId, { versionEsperada: await version(cuentaId), propina: 0, pagos: [{ metodo: 'tarjeta', monto: 30000 }] }, admin)).rejects.toThrow()
        expect(await estadoDe(reservaId)).toBe('sentada')
    })
})
