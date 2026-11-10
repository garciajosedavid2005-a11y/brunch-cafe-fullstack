import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import mongoose from 'mongoose'
import { api } from './helpers/app.js'
import { crearConSesion } from './helpers/usuarios.js'
import { categoriaDePrueba } from './helpers/datos.js'
import Rol from '../src/modulos/identidad/rol.model.js'
import Zona from '../src/modulos/salon/zona.model.js'
import Mesa from '../src/modulos/salon/mesa.model.js'
import Cuenta from '../src/modulos/salon/cuenta.model.js'
import Comanda from '../src/modulos/salon/comanda.model.js'
import Producto from '../src/modulos/catalogo/producto.model.js'
import Evento from '../src/modulos/compartido/evento.model.js'
import { verificarConsistenciaSalon } from '../src/modulos/salon/consistencia.js'

// 1.5 · Endpoints de salón para el staff (/api/v1/staff/salon). F1-7, F1-8, F1-9, F1-13, F1-17, F1-18.
const BASE = '/api/v1/staff/salon'
const idFalso = () => String(new mongoose.Types.ObjectId())

let mesero
let meseroUsuario
let otroMesero
let otroMeseroUsuario
let recepcion
let admin
let interior
let terraza
let m1
let m2
let m3
let t1
let latte
let agotado

beforeEach(async () => {
    await Promise.all([Cuenta.init(), Comanda.init(), Mesa.init(), Zona.init()])
    ;({ sesion: mesero, usuario: meseroUsuario } = await crearConSesion('mesero'))
    ;({ sesion: otroMesero, usuario: otroMeseroUsuario } = await crearConSesion('mesero'))
    // 1.5b: sin rol anfitrión. «recepcion» es un rol de prueba con permisos de mesa y cuenta pero sin
    // tomar comandas (lo que tenía el anfitrión), para probar MESERO_REQUERIDO y los 403 por permiso
    await Rol.create({ nombre: 'recepcion', permisos: ['mesa:ver', 'mesa:operar', 'mesa:bloquear', 'mesa:unir', 'cuenta:abrir', 'cuenta:transferir'] })
    ;({ sesion: recepcion } = await crearConSesion('recepcion'))
    ;({ sesion: admin } = await crearConSesion('admin'))
    interior = await Zona.create({ nombre: 'Interior', orden: 1 })
    terraza = await Zona.create({ nombre: 'Terraza', orden: 2 })
    m1 = await Mesa.create({ numero: 1, zona: interior._id, capacidad: 4, combinable: true })
    m2 = await Mesa.create({ numero: 2, zona: interior._id, capacidad: 4, combinable: true })
    m3 = await Mesa.create({ numero: 3, zona: interior._id, capacidad: 2, combinable: false })
    t1 = await Mesa.create({ numero: 10, zona: terraza._id, capacidad: 4, combinable: true })
    const bebidas = await categoriaDePrueba('Bebidas')
    latte = await Producto.create({ codigo: 1, nombre: 'Latte', precio: 9000, categoria: bebidas._id })
    agotado = await Producto.create({ codigo: 2, nombre: 'Mocca', precio: 10000, categoria: bebidas._id, disponible: false })
})

const esperar = (res, status) => {
    expect(res.status, JSON.stringify(res.body)).toBe(status)
    return res.body
}
const abrir = async (mesa = m1, sesion = mesero, datos = {}) =>
    esperar(await sesion.post(`${BASE}/mesas/${mesa._id}/abrir`).send({ comensales: 2, ...datos }), 201)
const agregar = async (cuenta, sesion = mesero) =>
    esperar(await sesion.post(`${BASE}/cuentas/${cuenta.id}/items`).send({ productoId: String(latte._id), cantidad: 1 }), 201).cuenta
const enviar = async (cuenta, sesion = mesero) =>
    esperar(await sesion.post(`${BASE}/cuentas/${cuenta.id}/rondas/${cuenta.ultimaRonda + 1}/enviar`).send({ versionEsperada: cuenta.version }), 200)
const estadoMesa = async (mesa) => (await Mesa.findById(mesa._id).lean()).estado

describe('Permisos', () => {
    const rutas = [
        ['get', '/mesas'], ['get', '/catalogo'], ['get', '/meseros'], ['get', `/cuentas/${idFalso()}`],
        ['post', '/mesas/unir'], ['post', `/mesas/${idFalso()}/abrir`], ['post', `/mesas/${idFalso()}/mover`],
        ['post', `/mesas/${idFalso()}/separar`], ['post', `/mesas/${idFalso()}/estado`],
        ['post', `/cuentas/${idFalso()}/items`], ['patch', `/cuentas/${idFalso()}/items/${idFalso()}`],
        ['delete', `/cuentas/${idFalso()}/items/${idFalso()}`], ['post', `/cuentas/${idFalso()}/items/${idFalso()}/anular`],
        ['post', `/cuentas/${idFalso()}/rondas/1/enviar`], ['post', `/cuentas/${idFalso()}/solicitar`],
        ['post', `/cuentas/${idFalso()}/cancelar`], ['post', `/cuentas/${idFalso()}/transferir`],
        ['post', `/cuentas/${idFalso()}/cerrar-sin-cobro`],
    ]

    it.each(rutas)('%s %s sin sesión → 401', async (metodo, ruta) => {
        expect((await api()[metodo](`${BASE}${ruta}`).send({})).status).toBe(401)
    })

    it.each(rutas)('%s %s como cliente o cocina → 403', async (metodo, ruta) => {
        for (const rol of ['cliente', 'cocina']) {
            const { sesion } = await crearConSesion(rol)
            const res = await sesion[metodo](`${BASE}${ruta}`).send({})
            expect(res.status).toBe(403)
            expect(res.body.error.code).toBe('FORBIDDEN')
        }
    })

    it('cada uno lo suyo: el mesero une y transfiere (1.5b) pero no anula ni cierra sin cobro; sin comanda:tomar no se toman comandas', async () => {
        const cuenta = await abrir()
        expect((await mesero.post(`${BASE}/mesas/unir`).send({ principalId: String(m1._id), mesaIds: [String(m2._id)] })).status).toBe(200)
        expect((await mesero.post(`${BASE}/cuentas/${cuenta.id}/transferir`).send({ meseroId: String(otroMeseroUsuario._id) })).status).toBe(200)
        expect((await recepcion.post(`${BASE}/cuentas/${cuenta.id}/items`).send({ productoId: String(latte._id), cantidad: 1 })).status).toBe(403)
        const enviada = await enviar(await agregar(cuenta))
        const itemId = enviada.rondas[0].items[0].id
        expect((await mesero.post(`${BASE}/cuentas/${cuenta.id}/items/${itemId}/anular`).send({ motivo: 'demora' })).status).toBe(403)
        expect((await mesero.post(`${BASE}/cuentas/${cuenta.id}/cerrar-sin-cobro`).send({ motivo: 'x', versionEsperada: enviada.version })).status).toBe(403)
    })
})

describe('Plano de mesas (GET /mesas)', () => {
    it('devuelve zonas activas y mesas con estado, cuenta, mesero, comensales y minutos ocupada', async () => {
        await Mesa.create({ numero: 99, zona: interior._id, capacidad: 2, activa: false })
        const cuenta = await abrir(m2, mesero, { comensales: 3 })
        await Mesa.updateOne({ _id: m3._id }, { estado: 'bloqueada' })
        await Cuenta.updateOne({ _id: cuenta.id }, { abiertaEn: new Date(Date.now() - 25 * 60_000) })

        const plano = esperar(await mesero.get(`${BASE}/mesas`), 200)
        expect(plano.zonas.map((z) => z.nombre)).toEqual(['Interior', 'Terraza'])
        expect(plano.mesas.map((m) => m.numero)).toEqual([1, 2, 3, 10]) // la inactiva no sale
        expect(Date.parse(plano.actualizadoEn)).not.toBeNaN()
        const [libre, ocupada, bloqueada] = plano.mesas
        expect(libre).toMatchObject({ estado: 'libre', cuenta: null, capacidad: 4, combinable: true, zona: { nombre: 'Interior' } })
        expect(bloqueada).toMatchObject({ estado: 'bloqueada', cuenta: null })
        expect(ocupada).toMatchObject({
            estado: 'ocupada',
            cuenta: {
                id: cuenta.id, codigo: cuenta.codigo, estado: 'abierta', comensales: 3, total: 0, pendiente: 0,
                mesero: { id: String(meseroUsuario._id), nombre: 'mesero P.' },
                mesas: [{ id: String(m2._id), numero: 2 }],
            },
        })
        expect(ocupada.cuenta.minutosOcupada).toBeGreaterThanOrEqual(25)
        expect(ocupada.cuenta.minutosOcupada).toBeLessThan(27)
    })

    it('una mesa con cuenta en una zona que quedó inactiva sigue en el plano, con el nombre de la zona', async () => {
        await abrir(t1)
        await Zona.updateOne({ _id: terraza._id }, { activa: false })
        const plano = esperar(await mesero.get(`${BASE}/mesas`), 200)
        expect(plano.zonas.map((z) => z.nombre)).toEqual(['Interior'])
        expect(plano.mesas.find((m) => m.numero === 10)).toMatchObject({ zona: { nombre: 'Terraza' }, cuenta: { estado: 'abierta' } })
    })

    it('filtra por zona; una zona mal formada → 400', async () => {
        const plano = esperar(await mesero.get(`${BASE}/mesas?zona=${terraza._id}`), 200)
        expect(plano.mesas.map((m) => m.numero)).toEqual([10])
        expect((await mesero.get(`${BASE}/mesas?zona=xyz`)).status).toBe(400)
    })

    it('sin N+1: el número de consultas no crece con las mesas ocupadas', async () => {
        const contar = async () => {
            let consultas = 0
            mongoose.set('debug', () => { consultas += 1 })
            try {
                esperar(await mesero.get(`${BASE}/mesas`), 200)
            } finally {
                mongoose.set('debug', false)
            }
            return consultas
        }
        await abrir(m1)
        const conUna = await contar()
        for (let n = 20; n < 28; n += 1) {
            const mesa = await Mesa.create({ numero: n, zona: interior._id, capacidad: 2 })
            await abrir(mesa, n % 2 ? mesero : otroMesero)
        }
        expect(await contar()).toBe(conUna)
    })
})

describe('Abrir cuenta (POST /mesas/:id/abrir)', () => {
    it('con Idempotency-Key, el reintento devuelve la misma cuenta sin abrir otra', async () => {
        const pedir = () => mesero.post(`${BASE}/mesas/${m1._id}/abrir`).set('Idempotency-Key', 'abrir-mesa-1').send({ comensales: 2 })
        const primera = esperar(await pedir(), 201)
        const repetida = await pedir()
        expect(repetida.status).toBe(201)
        expect(repetida.headers['idempotent-replayed']).toBe('true')
        expect(repetida.body.id).toBe(primera.id)
        expect(await Cuenta.countDocuments()).toBe(1)
    })

    it('con cuenta:transferir se abre a nombre de otro mesero (también el mesero, 1.5b); sin él no; un cliente no es mesero', async () => {
        const cuenta = await abrir(m1, recepcion, { meseroId: String(meseroUsuario._id) })
        expect(cuenta.mesero).toBe(String(meseroUsuario._id))
        const delMesero = await abrir(m3, mesero, { meseroId: String(otroMeseroUsuario._id) })
        expect(delMesero.mesero).toBe(String(otroMeseroUsuario._id))
        await Rol.create({ nombre: 'sin-transferir', permisos: ['cuenta:abrir', 'comanda:tomar'] })
        const { sesion: sinTransferir } = await crearConSesion('sin-transferir')
        const res = await sinTransferir.post(`${BASE}/mesas/${m2._id}/abrir`).send({ comensales: 2, meseroId: String(otroMeseroUsuario._id) })
        expect(res.status).toBe(403)
        const { usuario: cliente } = await crearConSesion('cliente')
        const otra = await recepcion.post(`${BASE}/mesas/${m2._id}/abrir`).send({ comensales: 2, meseroId: String(cliente._id) })
        expect(otra.status).toBe(400)
        expect(otra.body.error.code).toBe('MESERO_NO_VALIDO')
        expect(await estadoMesa(m2)).toBe('libre')
    })

    it('quien no toma comandas debe indicar el mesero → 400 MESERO_REQUERIDO', async () => {
        const res = await recepcion.post(`${BASE}/mesas/${m1._id}/abrir`).send({ comensales: 2 })
        expect(res.status).toBe(400)
        expect(res.body.error.code).toBe('MESERO_REQUERIDO')
        expect(await Cuenta.countDocuments()).toBe(0)
    })

    it('mesa ocupada → 409 MESA_NO_DISPONIBLE; campos no declarados → 400', async () => {
        await abrir()
        expect((await mesero.post(`${BASE}/mesas/${m1._id}/abrir`).send({ comensales: 2 })).body.error.code).toBe('MESA_NO_DISPONIBLE')
        const extra = await mesero.post(`${BASE}/mesas/${m2._id}/abrir`).send({ comensales: 2, estado: 'cerrada' })
        expect(extra.status).toBe(400)
    })
})

describe('Comanda: ítems y envío', () => {
    it('agregar un ítem con la misma Idempotency-Key no lo duplica', async () => {
        const cuenta = await abrir()
        const pedir = () => mesero.post(`${BASE}/cuentas/${cuenta.id}/items`).set('Idempotency-Key', 'item-latte-01')
            .send({ productoId: String(latte._id), cantidad: 1 })
        esperar(await pedir(), 201)
        expect((await pedir()).headers['idempotent-replayed']).toBe('true')
        const [ronda] = await Comanda.find({ cuenta: cuenta.id }).lean()
        expect(ronda.items).toHaveLength(1)
    })

    it('editar, quitar y un producto agotado → 409 PRODUCT_UNAVAILABLE', async () => {
        const cuenta = await abrir()
        const conItem = await agregar(cuenta)
        const itemId = conItem.rondas[0].items[0].id
        const editada = esperar(await mesero.patch(`${BASE}/cuentas/${cuenta.id}/items/${itemId}`).send({ cantidad: 3, nota: 'tibio' }), 200)
        expect(editada).toMatchObject({ pendiente: 27000, rondas: [{ items: [{ cantidad: 3, nota: 'tibio' }] }] })
        const sinItems = esperar(await mesero.delete(`${BASE}/cuentas/${cuenta.id}/items/${itemId}`), 200)
        expect(sinItems).toMatchObject({ pendiente: 0, rondas: [] })
        const res = await mesero.post(`${BASE}/cuentas/${cuenta.id}/items`).send({ productoId: String(agotado._id), cantidad: 1 })
        expect(res.status).toBe(409)
        expect(res.body.error.code).toBe('PRODUCT_UNAVAILABLE')
    })

    it('enviar la ronda: con la misma clave, dos toques simultáneos la envían una sola vez', async () => {
        const cuenta = await agregar(await abrir())
        const pedir = () => mesero.post(`${BASE}/cuentas/${cuenta.id}/rondas/1/enviar`).set('Idempotency-Key', 'enviar-ronda-1')
            .send({ versionEsperada: cuenta.version })
        const respuestas = await Promise.all([pedir(), pedir()])
        expect(respuestas.map((r) => r.status).sort()).toEqual([200, 409])
        expect(await Evento.countDocuments({ tipo: 'ronda_enviada' })).toBe(1)
        const repetida = await pedir()
        expect(repetida.status).toBe(200)
        expect(repetida.headers['idempotent-replayed']).toBe('true')
        // Sin clave, el segundo envío lo rechaza el servicio
        const sinClave = await mesero.post(`${BASE}/cuentas/${cuenta.id}/rondas/1/enviar`).send({ versionEsperada: repetida.body.version })
        expect(sinClave.body.error.code).toBe('RONDA_YA_ENVIADA')
    })

    it('anular (admin), solicitar, F1-18 (vuelve a abierta) y cerrar sin cobro', async () => {
        const enviada = await enviar(await agregar(await abrir()))
        const pedida = esperar(await mesero.post(`${BASE}/cuentas/${enviada.id}/solicitar`).send({ versionEsperada: enviada.version }), 200)
        expect(pedida.estado).toBe('cuenta_pedida')
        const itemId = pedida.rondas[0].items[0].id
        const anulada = esperar(await admin.post(`${BASE}/cuentas/${enviada.id}/items/${itemId}/anular`).send({ motivo: 'error_toma' }), 200)
        expect(anulada.estado).toBe('abierta')
        expect(await estadoMesa(m1)).toBe('ocupada')
        const cancelar = await mesero.post(`${BASE}/cuentas/${enviada.id}/cancelar`).send({ motivo: 'x', versionEsperada: anulada.version })
        expect(cancelar.body.error.code).toBe('CUENTA_CON_ITEMS_ENVIADOS')
        const cerrada = esperar(await admin.post(`${BASE}/cuentas/${enviada.id}/cerrar-sin-cobro`).send({ motivo: 'se fueron', versionEsperada: anulada.version }), 200)
        expect(cerrada.estado).toBe('cerrada_sin_cobro')
        expect(await estadoMesa(m1)).toBe('por_limpiar')
        // Limpiar la mesa: por_limpiar → libre
        esperar(await mesero.post(`${BASE}/mesas/${m1._id}/estado`).send({ a: 'libre' }), 200)
        expect(await estadoMesa(m1)).toBe('libre')
    })

    it('cancelar una cuenta sin envíos deja la mesa por limpiar', async () => {
        const cuenta = await abrir()
        esperar(await mesero.post(`${BASE}/cuentas/${cuenta.id}/cancelar`).send({ motivo: 'abierta por error', versionEsperada: cuenta.version }), 200)
        expect(await estadoMesa(m1)).toBe('por_limpiar')
    })
})

describe('Detalle de la cuenta (GET /cuentas/:id)', () => {
    it('trae rondas, totales, mesero y el historial con quién y cuándo', async () => {
        const enviada = await enviar(await agregar(await abrir()))
        const cuenta = esperar(await mesero.get(`${BASE}/cuentas/${enviada.id}`), 200)
        expect(cuenta).toMatchObject({ subtotal: 9000, total: 9000, mesero: { nombre: 'mesero P.' }, rondas: [{ numeroRonda: 1, estado: 'enviada' }] })
        expect(cuenta.historial.map((h) => h.tipo)).toEqual(['cambio_estado', 'item_agregado', 'ronda_enviada'])
        expect(cuenta.historial[1]).toMatchObject({ por: { nombre: 'mesero P.' }, item: { nombre: 'Latte', cantidad: 1 } })
        expect((await mesero.get(`${BASE}/cuentas/${idFalso()}`)).status).toBe(404)
    })
})

describe('Transferir (F1-8)', () => {
    it('quien tiene cuenta:transferir cambia el mesero responsable, con motivo opcional y Evento', async () => {
        const cuenta = await abrir()
        const transferida = esperar(await recepcion.post(`${BASE}/cuentas/${cuenta.id}/transferir`)
            .send({ meseroId: String(otroMeseroUsuario._id), motivo: 'cambio de turno' }), 200)
        expect(transferida.mesero).toBe(String(otroMeseroUsuario._id))
        const detalle = esperar(await otroMesero.get(`${BASE}/cuentas/${cuenta.id}`), 200)
        expect(detalle.historial.at(-1)).toMatchObject({
            tipo: 'cuenta_transferida', motivo: 'cambio de turno',
            meseroAnterior: { id: String(meseroUsuario._id) }, meseroNuevo: { id: String(otroMeseroUsuario._id) },
        })
        const igual = await recepcion.post(`${BASE}/cuentas/${cuenta.id}/transferir`).send({ meseroId: String(otroMeseroUsuario._id) })
        expect(igual.body.error.code).toBe('MISMO_MESERO')
        const { usuario: cocinero } = await crearConSesion('cocina')
        const invalido = await recepcion.post(`${BASE}/cuentas/${cuenta.id}/transferir`).send({ meseroId: String(cocinero._id) })
        expect(invalido.body.error.code).toBe('MESERO_NO_VALIDO')
    })

    it('lista de meseros: usuarios activos cuyo rol puede tomar comandas', async () => {
        const { usuario: inactivo } = await crearConSesion('mesero')
        await inactivo.updateOne({ activo: false })
        const lista = esperar(await recepcion.get(`${BASE}/meseros`), 200)
        const ids = lista.map((m) => m.id)
        expect(ids).toContain(String(meseroUsuario._id))
        expect(ids).not.toContain(String(inactivo._id))
        expect(lista.every((m) => typeof m.nombre === 'string' && !('correo' in m))).toBe(true)
    })
})

describe('Mover (POST /mesas/:id/mover)', () => {
    it('lleva la cuenta a una mesa libre; la que deja pasa a por limpiar', async () => {
        const cuenta = await abrir(m1)
        const movida = esperar(await mesero.post(`${BASE}/mesas/${m1._id}/mover`).send({ mesaDestinoId: String(t1._id) }), 200)
        expect(movida.mesas).toEqual([expect.objectContaining({ id: String(t1._id), numero: 10, zona: expect.objectContaining({ nombre: 'Terraza' }) })])
        expect(await Mesa.findById(m1._id).lean()).toMatchObject({ estado: 'por_limpiar', cuentaActual: null })
        expect(String((await Mesa.findById(t1._id).lean()).cuentaActual)).toBe(cuenta.id)
        expect(await verificarConsistenciaSalon()).toMatchObject({ ok: true })
    })

    it('a una mesa ocupada → 409; sin cuenta → 409 MESA_SIN_CUENTA; con la cuenta pedida → 409', async () => {
        await abrir(m1)
        await abrir(m2)
        expect((await mesero.post(`${BASE}/mesas/${m1._id}/mover`).send({ mesaDestinoId: String(m2._id) })).body.error.code).toBe('MESA_NO_DISPONIBLE')
        expect((await mesero.post(`${BASE}/mesas/${m3._id}/mover`).send({ mesaDestinoId: String(t1._id) })).body.error.code).toBe('MESA_SIN_CUENTA')
        const cuenta = (await mesero.get(`${BASE}/mesas`)).body.mesas[0].cuenta
        const enviada = await enviar(await agregar({ id: cuenta.id }))
        esperar(await mesero.post(`${BASE}/cuentas/${enviada.id}/solicitar`).send({ versionEsperada: enviada.version }), 200)
        expect((await mesero.post(`${BASE}/mesas/${m1._id}/mover`).send({ mesaDestinoId: String(t1._id) })).status).toBe(409)
    })
})

describe('Unir y separar (F1-9)', () => {
    it('une mesas combinables de la misma zona en una cuenta; se separan sin ítems enviados', async () => {
        const cuenta = await abrir(m1)
        const unida = esperar(await recepcion.post(`${BASE}/mesas/unir`).send({ principalId: String(m1._id), mesaIds: [String(m2._id)] }), 200)
        expect(unida.mesas.map((m) => m.numero)).toEqual([1, 2])
        expect(String((await Mesa.findById(m2._id).lean()).cuentaActual)).toBe(cuenta.id)
        const plano = esperar(await mesero.get(`${BASE}/mesas`), 200)
        expect(plano.mesas.find((m) => m.numero === 2).cuenta.mesas.map((m) => m.numero)).toEqual([1, 2])
        expect(await verificarConsistenciaSalon()).toMatchObject({ ok: true })

        // Con mesas unidas no se mueve a otra zona
        expect((await mesero.post(`${BASE}/mesas/${m2._id}/mover`).send({ mesaDestinoId: String(t1._id) })).body.error.code).toBe('MESA_NO_COMBINABLE')

        const separada = esperar(await recepcion.post(`${BASE}/mesas/${m2._id}/separar`).send({}), 200)
        expect(separada.mesas.map((m) => m.numero)).toEqual([1])
        expect(await Mesa.findById(m2._id).lean()).toMatchObject({ estado: 'por_limpiar', cuentaActual: null })
        expect((await recepcion.post(`${BASE}/mesas/${m1._id}/separar`).send({})).body.error.code).toBe('MESA_NO_UNIDA')
        expect(await verificarConsistenciaSalon()).toMatchObject({ ok: true })
    })

    it('no combinable, de otra zona u ocupada → 409 y no cambia nada', async () => {
        await abrir(m1)
        await abrir(t1)
        const unir = (mesaIds) => recepcion.post(`${BASE}/mesas/unir`).send({ principalId: String(m1._id), mesaIds: mesaIds.map(String) })
        expect((await unir([m3._id])).body.error.code).toBe('MESA_NO_COMBINABLE')
        expect((await unir([t1._id])).body.error.code).toBe('MESA_NO_COMBINABLE')
        await abrir(m2)
        expect((await unir([m2._id])).body.error.code).toBe('MESA_NO_DISPONIBLE')
        expect((await unir([m1._id])).body.error.code).toBe('MESAS_REPETIDAS')
        expect((await Cuenta.findOne({ 'mesas.mesa': m1._id }).lean()).mesas).toHaveLength(1)
    })

    it('con ítems enviados (aunque estén anulados) no se separan', async () => {
        const cuenta = await abrir(m1)
        esperar(await recepcion.post(`${BASE}/mesas/unir`).send({ principalId: String(m1._id), mesaIds: [String(m2._id)] }), 200)
        const enviada = await enviar(await agregar(cuenta))
        esperar(await admin.post(`${BASE}/cuentas/${cuenta.id}/items/${enviada.rondas[0].items[0].id}/anular`).send({ motivo: 'demora' }), 200)
        const res = await recepcion.post(`${BASE}/mesas/${m2._id}/separar`).send({})
        expect(res.status).toBe(409)
        expect(res.body.error.code).toBe('CUENTA_CON_ITEMS_ENVIADOS')
    })
})

describe('Concurrencia en transferir, mover, unir y separar', () => {
    it('con una versión vieja → 409 CUENTA_MODIFICADA y no cambia nada', async () => {
        const cuenta = await abrir(m1)
        esperar(await recepcion.post(`${BASE}/mesas/unir`).send({ principalId: String(m1._id), mesaIds: [String(m2._id)] }), 200)
        const vieja = cuenta.version
        const intentos = [
            recepcion.post(`${BASE}/cuentas/${cuenta.id}/transferir`).send({ meseroId: String(otroMeseroUsuario._id), versionEsperada: vieja }),
            mesero.post(`${BASE}/mesas/${m1._id}/mover`).send({ mesaDestinoId: String(t1._id), versionEsperada: vieja }),
            recepcion.post(`${BASE}/mesas/${m2._id}/separar`).send({ versionEsperada: vieja }),
        ]
        for (const res of await Promise.all(intentos)) {
            expect(res.status).toBe(409)
            expect(res.body.error.code).toBe('CUENTA_MODIFICADA')
        }
        const sigue = await Cuenta.findById(cuenta.id).lean()
        expect(sigue.mesas.map((m) => m.numero)).toEqual([1, 2])
        expect(String(sigue.mesero)).toBe(String(meseroUsuario._id))
        expect([await estadoMesa(m1), await estadoMesa(m2), await estadoMesa(t1)]).toEqual(['ocupada', 'ocupada', 'libre'])
    })

    it('mover a la misma mesa → 400; unir con la cuenta pedida → 409; transferir a un inactivo → 400', async () => {
        const cuenta = await abrir(m1)
        expect((await mesero.post(`${BASE}/mesas/${m1._id}/mover`).send({ mesaDestinoId: String(m1._id) })).body.error.code).toBe('MESA_DESTINO_NO_VALIDA')
        await otroMeseroUsuario.updateOne({ activo: false })
        expect((await recepcion.post(`${BASE}/cuentas/${cuenta.id}/transferir`).send({ meseroId: String(otroMeseroUsuario._id) })).body.error.code)
            .toBe('MESERO_NO_VALIDO')
        const enviada = await enviar(await agregar(cuenta))
        esperar(await mesero.post(`${BASE}/cuentas/${cuenta.id}/solicitar`).send({ versionEsperada: enviada.version }), 200)
        const unir = await recepcion.post(`${BASE}/mesas/unir`).send({ principalId: String(m1._id), mesaIds: [String(m2._id)] })
        expect(unir.status).toBe(409)
        expect(unir.body.error.code).toBe('CUENTA_NO_EDITABLE')
    })
})

describe('Catálogo de sala (GET /catalogo)', () => {
    it('incluye los agotados marcados como no disponibles, con estación y categoría', async () => {
        const { productos, categorias } = esperar(await mesero.get(`${BASE}/catalogo`), 200)
        expect(categorias.map((c) => c.nombre)).toContain('Bebidas')
        expect(productos.map((p) => [p.nombre, p.disponible])).toEqual([['Latte', true], ['Mocca', false]])
        expect(productos[0]).toMatchObject({ precio: 9000, categoria: 'Bebidas', estacion: { codigo: 'barra' }, modificadores: [] })
    })
})

afterEach(() => mongoose.set('debug', false))
