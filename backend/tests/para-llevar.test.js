// 6.3 (F6-3, F6-b) · Cuentas para llevar: sin mesa, con nombre o teléfono; el cajero (y el mesero) las abren, toman el
// pedido, lo envían a cocina y lo pasan a caja; cocina las ve como «Para llevar · nombre»; se cobran en la caja y lo
// listo se entrega (listo → servido). cuenta:para_llevar no sirve para operar cuentas del salón.
import { describe, it, expect, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { crearConSesion } from './helpers/usuarios.js'
import { categoriaDePrueba } from './helpers/datos.js'
import Producto from '../src/modulos/catalogo/producto.model.js'
import Zona from '../src/modulos/salon/zona.model.js'
import Mesa from '../src/modulos/salon/mesa.model.js'
import Cuenta from '../src/modulos/salon/cuenta.model.js'
import Comanda from '../src/modulos/salon/comanda.model.js'
import Comprobante from '../src/modulos/caja/comprobante.model.js'
import Evento from '../src/modulos/compartido/evento.model.js'
import { abrirTurno } from '../src/modulos/caja/turno.service.js'
import { obtenerCola } from '../src/modulos/cocina/cola.service.js'
import { todoListo } from '../src/modulos/cocina/cocina.service.js'
import { validarCanales } from '../src/modulos/tiempoReal/eventos.routes.js'
import { suscribir } from '../src/modulos/tiempoReal/bus.js'
import { PERMISOS_COCINA, PERMISOS_SALON } from '../src/modulos/identidad/permisos.js'
import { abrirCuenta } from '../src/modulos/salon/cuentas.service.js'

const { ObjectId } = mongoose.Types
const SALON = '/api/v1/staff/salon'
const cocinero = { id: String(new ObjectId()), rol: 'cocina', permisos: ['pedido:ver', ...PERMISOS_COCINA.cocina], estaciones: ['cocina'] }
const admin = { id: String(new ObjectId()), rol: 'admin', permisos: ['*'] }

let huevos
beforeEach(async () => {
    const platos = await categoriaDePrueba('Desayunos')
    huevos = await Producto.create({ codigo: 1, nombre: 'Huevos pericos', precio: 15000, categoria: platos._id })
    await Promise.all([Cuenta.createIndexes(), Comanda.createIndexes(), Mesa.createIndexes(), Comprobante.createIndexes()])
    await abrirTurno({ base: 0 }, admin)
})

const version = async (id) => (await Cuenta.findById(id).lean()).version

/** Abre una para llevar, agrega 2 × huevos, la envía a cocina y (si `pedir`) la pasa a caja, todo por HTTP. */
const paraLlevarEnviada = async (sesion, { nombre = 'Ana', pedir = true } = {}) => {
    const abierta = await sesion.post(`${SALON}/para-llevar`).send({ nombre, telefono: '300 123 4567' })
    expect(abierta.status, JSON.stringify(abierta.body)).toBe(201)
    const id = abierta.body.id
    const item = await sesion.post(`${SALON}/cuentas/${id}/items`).send({ productoId: String(huevos._id), cantidad: 2 })
    expect(item.status, JSON.stringify(item.body)).toBe(201)
    const envio = await sesion.post(`${SALON}/cuentas/${id}/rondas/1/enviar`).send({ versionEsperada: await version(id) })
    expect(envio.status, JSON.stringify(envio.body)).toBe(200)
    if (pedir) {
        const r = await sesion.post(`${SALON}/cuentas/${id}/solicitar`).send({ versionEsperada: await version(id) })
        expect(r.status, JSON.stringify(r.body)).toBe(200)
    }
    return id
}

describe('6.3 · Abrir una cuenta para llevar', () => {
    it('el cajero la abre con nombre y teléfono (solo dígitos), sin mesas, a su nombre, con Evento sin el teléfono', async () => {
        const { sesion, usuario } = await crearConSesion('cajero')
        const r = await sesion.post(`${SALON}/para-llevar`).send({ nombre: 'Ana Ruiz', telefono: '+57 300 123 4567' })
        expect(r.status, JSON.stringify(r.body)).toBe(201)
        expect(r.body).toMatchObject({ canal: 'para_llevar', estado: 'abierta', mesas: [], paraLlevar: { nombre: 'Ana Ruiz', telefono: '573001234567' }, mesero: String(usuario._id) })
        const evento = await Evento.findOne({ entidad: 'cuenta', entidadId: r.body.id }).lean()
        expect(evento.datos).toMatchObject({ canal: 'para_llevar', nombre: 'Ana Ruiz' })
        expect(JSON.stringify(evento.datos)).not.toContain('3001234567')
    })

    it('sin nombre ni teléfono, 400 con el mensaje en español; teléfono mal escrito, 400', async () => {
        const { sesion } = await crearConSesion('mesero')
        const vacio = await sesion.post(`${SALON}/para-llevar`).send({ nombre: '  ' })
        expect(vacio.status).toBe(400)
        expect(vacio.body.error.message).toBe('Indica el nombre o el teléfono de quien recoge el pedido')
        expect((await sesion.post(`${SALON}/para-llevar`).send({ telefono: '12ab' })).status).toBe(400)
        expect((await sesion.post(`${SALON}/para-llevar`).send({ nombre: 'Ana', mesaId: String(new ObjectId()) })).status).toBe(400)
    })

    it('el cliente, cocina y el repartidor no pueden (403)', async () => {
        for (const rol of ['cliente', 'cocina', 'repartidor']) {
            const { sesion } = await crearConSesion(rol)
            expect((await sesion.post(`${SALON}/para-llevar`).send({ nombre: 'Ana' })).status, rol).toBe(403)
        }
    })

    it('varias para llevar abiertas a la vez no chocan con el índice de mesas (solo vale para el salón)', async () => {
        const { sesion } = await crearConSesion('cajero')
        for (const nombre of ['Ana', 'Beto', 'Caro']) expect((await sesion.post(`${SALON}/para-llevar`).send({ nombre })).status).toBe(201)
        expect(await Cuenta.countDocuments({ canal: 'para_llevar', estado: 'abierta' })).toBe(3)
    })

    it('el esquema rechaza una para llevar con mesas o sin quién recoge, y una del salón sin mesas', async () => {
        const base = { codigo: 'C-999999', mesero: new ObjectId(), comensales: 1, abiertaPor: new ObjectId(), abiertaEn: new Date() }
        await expect(Cuenta.create({ ...base, canal: 'para_llevar', mesas: [] })).rejects.toThrow('Indica el nombre o el teléfono')
        await expect(Cuenta.create({ ...base, canal: 'salon', mesas: [] })).rejects.toThrow('entre 1 y 10 mesas')
    })
})

describe('6.3 · Pedido, cocina, caja y entrega', () => {
    it('ciclo completo del cajero: toma, envía, pasa a caja, cocina la ve como «Para llevar · nombre», cobra y entrega', async () => {
        const { sesion } = await crearConSesion('cajero')
        const id = await paraLlevarEnviada(sesion, { nombre: 'Ana' })

        const cola = await obtenerCola({ estacion: 'cocina' }, cocinero)
        expect(cola.salon).toEqual([expect.objectContaining({ cuentaId: id, mesas: [], paraLlevar: { nombre: 'Ana' } })])

        const caja = await sesion.get('/api/v1/staff/caja/cuentas')
        expect(caja.body.cuentas).toEqual([expect.objectContaining({ id, mesas: [], paraLlevar: { nombre: 'Ana', telefono: '3001234567' }, total: 30000 })])

        const cobro = await sesion.post(`/api/v1/staff/caja/cuentas/${id}/cobrar`)
            .send({ versionEsperada: await version(id), propina: 0, pagos: [{ metodo: 'efectivo', monto: 30000, recibido: 30000 }] })
        expect(cobro.status, JSON.stringify(cobro.body)).toBe(201)
        expect(cobro.body.comprobante.mesas).toEqual([])

        // Cobrada pero sin entregar: sigue en el KDS y en la lista «Para llevar»
        expect((await obtenerCola({ estacion: 'cocina' }, cocinero)).salon).toHaveLength(1)
        let lista = await sesion.get(`${SALON}/para-llevar`)
        expect(lista.body.cuentas).toEqual([expect.objectContaining({ id, cobrada: true, porPreparar: 2, listos: 0, entregados: 0 })])

        const ronda = await Comanda.findOne({ cuenta: id }).lean()
        await todoListo(String(ronda._id), { estacion: 'cocina' }, cocinero)
        const itemId = String(ronda.items[0]._id)
        const entrega = await sesion.post(`/api/v1/staff/items/${itemId}/estado`).send({ de: 'listo', a: 'servido' })
        expect(entrega.status, JSON.stringify(entrega.body)).toBe(200)
        lista = await sesion.get(`${SALON}/para-llevar`)
        expect(lista.body.cuentas).toEqual([]) // entregada y cobrada: sale de la lista
    })

    it('el mesero también la lleva entera desde /staff y la ve en la lista mientras está abierta', async () => {
        const { sesion } = await crearConSesion('mesero')
        const id = await paraLlevarEnviada(sesion, { pedir: false })
        const lista = await sesion.get(`${SALON}/para-llevar`)
        expect(lista.body.cuentas).toEqual([expect.objectContaining({ id, estado: 'abierta', cobrada: false, porPreparar: 2, nombre: 'Ana' })])
    })

    it('con solo cuenta:para_llevar, el cajero no toca una cuenta del salón (403) ni entrega sus ítems', async () => {
        const zona = await Zona.create({ nombre: 'Interior' })
        const mesa = await Mesa.create({ numero: 1, zona: zona._id, capacidad: 4 })
        const mesero = { id: String((await crearConSesion('mesero')).usuario._id), rol: 'mesero', permisos: [...PERMISOS_SALON.mesero, ...PERMISOS_COCINA.mesero] }
        const salon = await abrirCuenta({ mesaId: String(mesa._id), comensales: 2 }, mesero)
        const { sesion } = await crearConSesion('cajero')
        expect((await sesion.get(`${SALON}/cuentas/${salon.id}`)).status).toBe(403)
        expect((await sesion.post(`${SALON}/cuentas/${salon.id}/items`).send({ productoId: String(huevos._id), cantidad: 1 })).status).toBe(403)
        expect((await sesion.post(`${SALON}/cuentas/${salon.id}/cancelar`).send({ versionEsperada: await version(salon.id), motivo: 'error' })).status).toBe(403)
        expect(await Comanda.countDocuments({ cuenta: salon.id })).toBe(0)

        // Un ítem listo del salón: el cajero no lo entrega
        const { sesion: sesionMesero } = await crearConSesion('mesero')
        await sesionMesero.post(`${SALON}/cuentas/${salon.id}/items`).send({ productoId: String(huevos._id), cantidad: 1 })
        await sesionMesero.post(`${SALON}/cuentas/${salon.id}/rondas/1/enviar`).send({ versionEsperada: await version(salon.id) })
        const ronda = await Comanda.findOne({ cuenta: salon.id }).lean()
        await todoListo(String(ronda._id), { estacion: 'cocina' }, cocinero)
        const r = await sesion.post(`/api/v1/staff/items/${ronda.items[0]._id}/estado`).send({ de: 'listo', a: 'servido' })
        expect(r.status).toBe(403)
        expect((await Comanda.findById(ronda._id).lean()).items[0].estado).toBe('listo')
        // Sin enumerar el salón: el 403 llega antes que el 409 que revelaría la ronda o el estado del ítem
        expect((await sesion.post(`${SALON}/cuentas/${salon.id}/rondas/1/enviar`).send({ versionEsperada: await version(salon.id) })).status).toBe(403)
        expect((await sesion.post(`/api/v1/staff/items/${ronda.items[0]._id}/estado`).send({ de: 'enviado', a: 'servido' })).status).toBe(403)
        // Las demás rutas que ahora aceptan cuenta:para_llevar: 403 en el salón y la cuenta no cambia
        await sesionMesero.post(`${SALON}/cuentas/${salon.id}/items`).send({ productoId: String(huevos._id), cantidad: 1 })
        const borrador = await Comanda.findOne({ cuenta: salon.id, estado: 'borrador' }).lean()
        const antes = await Cuenta.findById(salon.id).lean()
        const itemBorrador = `${SALON}/cuentas/${salon.id}/items/${borrador.items[0]._id}`
        expect((await sesion.patch(itemBorrador).send({ cantidad: 3 })).status).toBe(403)
        expect((await sesion.delete(itemBorrador).send({})).status).toBe(403)
        expect((await sesion.post(`${SALON}/cuentas/${salon.id}/rondas/2/enviar`).send({ versionEsperada: antes.version })).status).toBe(403)
        expect((await sesion.post(`${SALON}/cuentas/${salon.id}/solicitar`).send({ versionEsperada: antes.version })).status).toBe(403)
        const despues = await Cuenta.findById(salon.id).lean()
        expect([despues.version, despues.estado]).toEqual([antes.version, antes.estado])
    })

    it('pasadas 12 h de cobrada, lo listo ya no se entrega (409)', async () => {
        const { sesion } = await crearConSesion('cajero')
        const id = await paraLlevarEnviada(sesion)
        await sesion.post(`/api/v1/staff/caja/cuentas/${id}/cobrar`)
            .send({ versionEsperada: await version(id), propina: 0, pagos: [{ metodo: 'tarjeta', monto: 30000 }] })
        const ronda = await Comanda.findOne({ cuenta: id }).lean()
        await todoListo(String(ronda._id), { estacion: 'cocina' }, cocinero)
        await Cuenta.updateOne({ _id: id }, { $set: { cerradaEn: new Date(Date.now() - 13 * 60 * 60 * 1000) } })
        const r = await sesion.post(`/api/v1/staff/items/${ronda.items[0]._id}/estado`).send({ de: 'listo', a: 'servido' })
        expect(r.status, JSON.stringify(r.body)).toBe(409)
        expect((await Comanda.findById(ronda._id).lean()).items[0].estado).toBe('listo')
    })

    it('una para llevar del cajero se cancela sin ítems enviados; con enviados, no (409)', async () => {
        const { sesion } = await crearConSesion('cajero')
        const abierta = (await sesion.post(`${SALON}/para-llevar`).send({ nombre: 'Ana' })).body
        const r = await sesion.post(`${SALON}/cuentas/${abierta.id}/cancelar`).send({ versionEsperada: abierta.version, motivo: 'se fue' })
        expect(r.status, JSON.stringify(r.body)).toBe(200)
        expect(r.body.estado).toBe('cancelada')
        const enviada = await paraLlevarEnviada(sesion, { pedir: false })
        expect((await sesion.post(`${SALON}/cuentas/${enviada}/cancelar`).send({ versionEsperada: await version(enviada), motivo: 'x' })).status).toBe(409)
    })

    it('avisos en vivo: el canal para_llevar recibe la apertura; canales permitidos con cuenta:para_llevar', async () => {
        expect(validarCanales('para_llevar', { id: 'x', permisos: ['cuenta:para_llevar'] })).toEqual(['para_llevar'])
        const cuenta = String(new ObjectId())
        expect(validarCanales(`cuenta:${cuenta}`, { id: 'x', permisos: ['cuenta:para_llevar'] })).toEqual([`cuenta:${cuenta}`])
        expect(() => validarCanales('para_llevar', { id: 'x', permisos: ['pedido:ver'] })).toThrow()
        const avisos = []
        const baja = suscribir(['para_llevar'], (a) => avisos.push(a))
        try {
            const { sesion } = await crearConSesion('cajero')
            await sesion.post(`${SALON}/para-llevar`).send({ nombre: 'Ana' })
            expect(avisos).toHaveLength(1)
        } finally {
            baja()
        }
    })

    it('reportes: la venta para llevar cuenta en su canal (no en el salón)', async () => {
        const { sesion } = await crearConSesion('cajero')
        const id = await paraLlevarEnviada(sesion)
        await sesion.post(`/api/v1/staff/caja/cuentas/${id}/cobrar`)
            .send({ versionEsperada: await version(id), propina: 0, pagos: [{ metodo: 'tarjeta', monto: 30000 }] })
        const { sesion: sesionAdmin } = await crearConSesion('admin')
        const r = await sesionAdmin.get('/api/v1/admin/reportes/ventas?desde=2026-11-05&hasta=2026-11-05')
        expect(r.status, JSON.stringify(r.body)).toBe(200)
        expect(r.body.porCanal.find((c) => c.canal === 'para_llevar')).toMatchObject({ ventas: 30000, tickets: 1, disponible: true })
        expect(r.body.porCanal.find((c) => c.canal === 'salon')).toMatchObject({ ventas: 0, tickets: 0 })
        expect(r.body.porDia[0]).toMatchObject({ paraLlevar: 30000, salon: 0 })
    })
})
