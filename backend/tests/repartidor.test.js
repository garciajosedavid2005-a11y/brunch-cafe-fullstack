// 6.2 (F6-2) · Repartidor asignado: el admin o el cajero lo asignan; el repartidor solo ve, lleva y cobra los suyos.
import { describe, it, expect, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { crearConSesion } from './helpers/usuarios.js'
import { crearPedido } from './helpers/datos.js'
import Evento from '../src/modulos/compartido/evento.model.js'
import Comprobante from '../src/modulos/caja/comprobante.model.js'
import TurnoCaja from '../src/modulos/caja/turno.model.js'
import { abrirTurno } from '../src/modulos/caja/turno.service.js'
import { up, down, MARCA, INDICE } from '../src/migraciones/m62-repartidor.js'
import Rol from '../src/modulos/identidad/rol.model.js'
import Pedido from '../src/modulos/pedidos/pedido.model.js'
import { suscribir } from '../src/modulos/tiempoReal/bus.js'
import { validarCanales } from '../src/modulos/tiempoReal/eventos.routes.js'

const { ObjectId } = mongoose.Types
const PEDIDOS = '/api/v1/staff/pedidos'
const admin = { id: String(new ObjectId()), rol: 'admin', permisos: ['*'] }
let cliente, cajero, adminS, ruben, rosa, rubenU, rosaU

beforeEach(async () => {
    await Promise.all([Comprobante.createIndexes(), TurnoCaja.createIndexes()])
    await abrirTurno({ base: 0 }, admin)
    ;({ sesion: cliente } = await crearConSesion('cliente'))
    ;({ sesion: cajero } = await crearConSesion('cajero'))
    ;({ sesion: adminS } = await crearConSesion('admin'))
    ;({ sesion: ruben, usuario: rubenU } = await crearConSesion('repartidor'))
    ;({ sesion: rosa, usuario: rosaU } = await crearConSesion('repartidor'))
})

const asignar = (sesion, id, repartidorId) => sesion.patch(`${PEDIDOS}/${id}/repartidor`).send({ repartidorId })
const avanzar = async (sesion, id, codigos) => {
    for (const codigo of codigos) {
        const r = await sesion.patch(`${PEDIDOS}/${id}/estado`).send({ codigo })
        expect(r.status, `${codigo}: ${JSON.stringify(r.body)}`).toBe(200)
    }
}

describe('6.2 · Asignar el repartidor', () => {
    it('el cajero lo asigna y lo cambia (Evento con de/a); la lista de repartidores es de quienes entregan', async () => {
        const id = await crearPedido(cliente)
        const lista = await cajero.get(`${PEDIDOS}/repartidores`)
        expect(lista.status).toBe(200)
        expect(lista.body.repartidores.map((r) => r.id).sort()).toEqual([String(rubenU._id), String(rosaU._id)].sort())

        const r = await asignar(cajero, id, String(rubenU._id))
        expect(r.status, JSON.stringify(r.body)).toBe(200)
        expect(r.body.repartidor).toEqual({ id: String(rubenU._id), nombre: expect.stringContaining('repartidor') })
        await asignar(cajero, id, String(rosaU._id))
        const eventos = await Evento.find({ entidadId: new ObjectId(id), tipo: 'repartidor_asignado' }).sort({ createdAt: 1, _id: 1 }).lean()
        expect(eventos.map((e) => e.datos)).toEqual([{ de: null, a: String(rubenU._id) }, { de: String(rubenU._id), a: String(rosaU._id) }])
    })

    it('sin permiso 403; a alguien que no reparte 400; ya en camino 409', async () => {
        const id = await crearPedido(cliente)
        const { sesion: mesero, usuario: meseroU } = await crearConSesion('mesero')
        expect((await asignar(mesero, id, String(rubenU._id))).status).toBe(403)
        expect((await asignar(ruben, id, String(rubenU._id))).status).toBe(403)
        expect((await asignar(cajero, id, String(meseroU._id))).body.error.code).toBe('REPARTIDOR_NO_VALIDO')
        await asignar(cajero, id, String(rubenU._id))
        await avanzar(adminS, id, ['confirmado', 'en_preparacion', 'listo'])
        await avanzar(ruben, id, ['en_camino'])
        const tarde = await asignar(cajero, id, String(rosaU._id))
        expect(tarde.status).toBe(409)
        expect(tarde.body.error.code).toBe('PEDIDO_NO_ASIGNABLE')
    })
})

describe('6.2 · El repartidor solo ve y lleva los suyos', () => {
    it('lista, detalle y estados solo de sus asignados (los demás, 404); en camino → entregado', async () => {
        const suyo = await crearPedido(cliente)
        const ajeno = await crearPedido(cliente)
        const sinAsignar = await crearPedido(cliente)
        await asignar(cajero, suyo, String(rubenU._id))
        await asignar(cajero, ajeno, String(rosaU._id))
        for (const id of [suyo, ajeno, sinAsignar]) await avanzar(adminS, id, ['confirmado', 'en_preparacion', 'listo'])

        const lista = await ruben.get(PEDIDOS)
        expect(lista.body.map((p) => String(p.id))).toEqual([suyo])
        expect(lista.body[0].transiciones.map((t) => t.codigo)).toEqual(['en_camino'])
        expect((await ruben.get(`${PEDIDOS}/${ajeno}`)).status).toBe(404)
        expect((await ruben.patch(`${PEDIDOS}/${ajeno}/estado`).send({ codigo: 'en_camino' })).status).toBe(404)
        expect((await ruben.patch(`${PEDIDOS}/${sinAsignar}/estado`).send({ codigo: 'en_camino' })).status).toBe(404)
        // No puede retroceder ni cancelar el suyo
        expect((await ruben.patch(`${PEDIDOS}/${suyo}/estado`).send({ codigo: 'en_preparacion' })).status).toBe(409)
        expect((await ruben.patch(`${PEDIDOS}/${suyo}/cancelar`).send({ motivo: 'no contesta' })).status).toBe(403)
        await avanzar(ruben, suyo, ['en_camino', 'entregado'])

        // El cajero ve todos; el admin no ve botones repetidos (dos caminos al mismo estado)
        expect((await cajero.get(PEDIDOS)).body).toHaveLength(3)
        const delAdmin = (await adminS.get(PEDIDOS)).body.find((p) => String(p.id) === ajeno)
        expect(delAdmin.transiciones.map((t) => t.codigo)).toEqual(['en_camino', 'cancelado'])
    })

    it('cobra solo los suyos: la lista de la caja no trae los ajenos y cobrar uno ajeno da 404', async () => {
        const suyo = await crearPedido(cliente)
        const ajeno = await crearPedido(cliente)
        await asignar(cajero, suyo, String(rubenU._id))
        await asignar(cajero, ajeno, String(rosaU._id))
        for (const [id, quien] of [[suyo, ruben], [ajeno, rosa]]) {
            await avanzar(adminS, id, ['confirmado', 'en_preparacion', 'listo'])
            await avanzar(quien, id, ['en_camino', 'entregado'])
        }
        const lista = await ruben.get('/api/v1/staff/caja/domicilios')
        expect(lista.body.domicilios.map((d) => d.id)).toEqual([suyo])
        const pago = { propina: 0, pagos: [{ metodo: 'efectivo', monto: 9000, recibido: 9000 }] }
        expect((await ruben.post(`/api/v1/staff/caja/domicilios/${ajeno}/cobrar`).send(pago)).status).toBe(404)
        expect((await ruben.post(`/api/v1/staff/caja/domicilios/${suyo}/cobrar`).send(pago)).status).toBe(201)
    })
})

describe('6.2 · Revisión: otros caminos a lo ajeno', () => {
    it('en «Cuentas abiertas» el repartidor solo ve sus domicilios (ni ajenos ni sin asignar); el cajero, todos', async () => {
        const suyo = await crearPedido(cliente)
        const ajeno = await crearPedido(cliente)
        await crearPedido(cliente)
        await asignar(cajero, suyo, String(rubenU._id))
        await asignar(cajero, ajeno, String(rosaU._id))
        const r = await ruben.get('/api/v1/staff/cuentas-abiertas')
        expect(r.status, JSON.stringify(r.body)).toBe(200)
        expect(r.body.cuentas.map((c) => c.id)).toEqual([suyo])
        expect((await cajero.get('/api/v1/staff/cuentas-abiertas')).body.cuentas).toHaveLength(3)
    })

    it('si lo reasignan mientras tanto, el anterior no lo puede avanzar (escritura condicional: 409)', async () => {
        const id = await crearPedido(cliente)
        await asignar(cajero, id, String(rubenU._id))
        await avanzar(adminS, id, ['confirmado', 'en_preparacion', 'listo'])
        // Reasignado «por debajo» después de que él lo leyó: la escritura exige que siga siendo suyo
        const original = Pedido.findOneAndUpdate.bind(Pedido)
        Pedido.findOneAndUpdate = function (filtro, ...resto) {
            Pedido.findOneAndUpdate = original
            return Pedido.updateOne({ _id: id }, { $set: { repartidor: rosaU._id } }).then(() => original(filtro, ...resto))
        }
        try {
            const r = await ruben.patch(`${PEDIDOS}/${id}/estado`).send({ codigo: 'en_camino' })
            expect(r.status).toBe(409)
        } finally {
            Pedido.findOneAndUpdate = original
        }
        expect((await Pedido.findById(id).populate('estado', 'codigo').lean()).estado.codigo).toBe('listo')
    })

    it('un rol con solo pedido:cobrar (sin pedido:entregar) también cobra solo sus asignados (cerrado por defecto)', async () => {
        await Rol.create({ nombre: 'mensajero', etiqueta: 'Mensajero', permisos: ['pedido:cobrar'] })
        const { sesion: mensajero } = await crearConSesion('mensajero')
        const id = await crearPedido(cliente)
        await asignar(cajero, id, String(rubenU._id))
        await avanzar(adminS, id, ['confirmado', 'en_preparacion', 'listo', 'en_camino'])
        const lista = await mensajero.get('/api/v1/staff/caja/domicilios')
        expect(lista.status).toBe(200)
        expect(lista.body.domicilios).toEqual([])
    })

    it('canal en vivo repartidor:<id>: solo el propio y con pedido:entregar; al reasignar avisa al anterior y al nuevo', async () => {
        const sesion = (permisos, id = String(new ObjectId())) => ({ id, permisos })
        const yo = String(rubenU._id)
        expect(validarCanales(`repartidor:${yo}`, sesion(['pedido:entregar'], yo))).toEqual([`repartidor:${yo}`])
        expect(() => validarCanales(`repartidor:${yo}`, sesion(['pedido:entregar']))).toThrow()
        expect(() => validarCanales(`repartidor:${yo}`, sesion(['pedido:ver'], yo))).toThrow()

        const id = await crearPedido(cliente)
        const avisos = []
        const baja = suscribir([`repartidor:${yo}`, `repartidor:${rosaU._id}`], (a) => avisos.push(a))
        try {
            await asignar(cajero, id, yo)
            await asignar(cajero, id, String(rosaU._id))
        } finally {
            baja()
        }
        expect(avisos.map((a) => [a.canal, a.tipo])).toEqual([
            [`repartidor:${yo}`, 'pedido_asignado'],
            [`repartidor:${yo}`, 'pedido_asignado'], [`repartidor:${rosaU._id}`, 'pedido_asignado'],
        ])
    })

    it('al repartidor no se le envía el correo del cliente; quitar el repartidor (null) deja el Evento con a: null', async () => {
        const id = await crearPedido(cliente)
        await asignar(cajero, id, String(rubenU._id))
        expect((await ruben.get(PEDIDOS)).body[0].correo).toBe('')
        expect((await cajero.get(PEDIDOS)).body[0].correo).toMatch(/@/)
        const quitado = await asignar(cajero, id, null)
        expect(quitado.body.repartidor).toBeNull()
        expect((await Evento.findOne({ tipo: 'repartidor_asignado' }).sort({ createdAt: -1, _id: -1 }).lean()).datos).toEqual({ de: String(rubenU._id), a: null })
        expect((await asignar(cajero, String(new ObjectId()), null)).status).toBe(404)
        expect((await cajero.patch(`${PEDIDOS}/${id}/repartidor`).send({ repartidorId: null, otro: 1 })).status).toBe(400)
    })
})

describe('Migración 6.2', () => {
    it('dry-run no escribe; up agrega permisos e índice; down los quita; up de nuevo; no pisa un rol personalizado', async () => {
        const db = mongoose.connection.db
        const roles = db.collection('rols')
        // BD anterior: roles sin los permisos nuevos y sin el índice
        await roles.updateOne({ nombre: 'cajero' }, { $pull: { permisos: 'pedido:asignar_repartidor' } })
        await roles.updateOne({ nombre: 'repartidor' }, { $pull: { permisos: 'pedido:entregar' } })
        if ((await db.collection('pedidos').indexes()).some((i) => i.name === INDICE.nombre)) await db.collection('pedidos').dropIndex(INDICE.nombre)
        const antes = await roles.find({}).sort({ nombre: 1 }).toArray()

        const simulacro = await up(db, { dryRun: true })
        expect(simulacro.indice).toEqual({ crear: true, aplicado: false })
        expect(simulacro.roles.map((r) => r.accion)).toEqual(['agregar', 'agregar'])
        expect(await roles.find({}).sort({ nombre: 1 }).toArray()).toEqual(antes)

        await up(db)
        expect((await roles.findOne({ nombre: 'cajero' })).permisos).toContain('pedido:asignar_repartidor')
        expect((await roles.findOne({ nombre: 'repartidor' }))[MARCA]).toEqual(['pedido:entregar'])
        expect((await db.collection('pedidos').indexes()).some((i) => i.name === INDICE.nombre)).toBe(true)
        expect((await up(db)).roles.map((r) => r.accion)).toEqual(['ya-aplicada', 'ya-aplicada'])

        await down(db)
        expect(await roles.find({}).sort({ nombre: 1 }).toArray()).toEqual(antes)
        expect((await db.collection('pedidos').indexes()).some((i) => i.name === INDICE.nombre)).toBe(false)
        expect((await up(db)).roles.every((r) => r.aplicado)).toBe(true)

        // Un rol que el admin ya personalizó con la clave no se toca
        await down(db)
        await roles.updateOne({ nombre: 'cajero' }, { $addToSet: { permisos: 'pedido:asignar_repartidor' } })
        expect((await up(db)).roles.find((r) => r.nombre === 'cajero').accion).toBe('sin-cambios')
    })
})
