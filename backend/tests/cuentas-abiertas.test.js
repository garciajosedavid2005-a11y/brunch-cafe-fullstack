// 1.9 · Domicilio y Cuenta (opción A, F1-11): el domicilio sigue en Pedido, con `canal: 'domicilio'`,
// y el staff tiene una vista unificada de solo lectura «Cuentas abiertas» (salón + domicilio).
import { describe, it, expect, beforeEach, vi } from 'vitest'
import mongoose from 'mongoose'
import { api } from './helpers/app.js'
import { crearConSesion } from './helpers/usuarios.js'
import { crearPedido } from './helpers/datos.js'
import { AHORA_PRUEBAS } from './helpers/setup.js'
import Rol from '../src/modulos/identidad/rol.model.js'
import Zona from '../src/modulos/salon/zona.model.js'
import Mesa from '../src/modulos/salon/mesa.model.js'
import Cuenta from '../src/modulos/salon/cuenta.model.js'
import Comanda from '../src/modulos/salon/comanda.model.js'
import Pedido from '../src/modulos/pedidos/pedido.model.js'
import { pedidoComoCuenta } from '../src/modulos/pedidos/pedidoComoCuenta.js'
import { listarCuentasAbiertas } from '../src/modulos/salon/salonStaff.service.js'

const URL = '/api/v1/staff/cuentas-abiertas'
const CLAVES_FILA_DOMICILIO = ['canal', 'cliente', 'codigo', 'desde', 'entregaEn', 'estado', 'hora', 'id', 'minutos', 'pendiente', 'referencia', 'responsable', 'total']

let cliente
let mesero
let meseroUsuario
let mesas

beforeEach(async () => {
    await Promise.all([Cuenta.init(), Comanda.init(), Mesa.init(), Zona.init()])
    ;({ sesion: cliente } = await crearConSesion('cliente'))
    ;({ sesion: mesero, usuario: meseroUsuario } = await crearConSesion('mesero'))
    const zona = await Zona.create({ nombre: 'Interior', orden: 1 })
    mesas = await Promise.all([1, 2, 3].map((numero) => Mesa.create({ numero, zona: zona._id, capacidad: 4 })))
})

const abrir = async (mesa) => {
    const res = await mesero.post(`/api/v1/staff/salon/mesas/${mesa._id}/abrir`).send({ comensales: 2 })
    expect(res.status, JSON.stringify(res.body)).toBe(201)
    return res.body
}
// Reloj de las pruebas a AHORA_PRUEBAS + n minutos (el orden no depende de que dos cosas caigan en el mismo ms)
const aLos = (minutos) => vi.setSystemTime(new Date(AHORA_PRUEBAS.getTime() + minutos * 60_000))

describe('Pedido.canal (1.9)', () => {
    it('los pedidos nuevos se guardan con canal «domicilio»', async () => {
        const id = await crearPedido(cliente)
        expect((await Pedido.findById(id).lean()).canal).toBe('domicilio')
    })

    it('un pedido anterior sin el campo se lee como domicilio (sin migración) y sale en la vista', async () => {
        const id = await crearPedido(cliente)
        await Pedido.collection.updateOne({ _id: new mongoose.Types.ObjectId(id) }, { $unset: { canal: '' } })
        const pedido = await Pedido.findById(id).populate('estado', 'codigo nombre').lean()
        expect(pedido.canal).toBeUndefined()
        expect(pedidoComoCuenta(pedido)).toMatchObject({ canal: 'domicilio', id })
        expect((await mesero.get(URL)).body.cuentas.map((c) => c.id)).toEqual([id])
    })

    it('el portal del cliente responde igual: mismas claves, sin canal', async () => {
        await crearPedido(cliente)
        const res = await cliente.get('/api/v1/cliente/pedidos')
        expect(res.status).toBe(200)
        expect(Object.keys(res.body.orders[0]).sort()).toEqual(
            ['_id', 'codigo', 'createdAt', 'delivery', 'items', 'orderNumber', 'paymentMethod', 'status', 'statusLabel', 'total'])
    })
})

describe('GET /api/v1/staff/cuentas-abiertas', () => {
    it('reúne salón y domicilio intercalados, de la más antigua a la más nueva', async () => {
        aLos(0)
        const primera = await abrir(mesas[0])
        aLos(5)
        const pedidoId = await crearPedido(cliente)
        aLos(10)
        const tercera = await abrir(mesas[1])
        aLos(20.5) // el medio minuto absorbe los ms que avanza el reloj real
        const res = await mesero.get(URL)
        expect(res.status).toBe(200)
        expect(res.body).toMatchObject({ canales: { salon: true, domicilio: true }, truncado: false })
        expect(res.body.cuentas.map((c) => [c.canal, c.id])).toEqual([['salon', primera.id], ['domicilio', pedidoId], ['salon', tercera.id]])
        const [salon, domicilio] = res.body.cuentas
        expect(salon).toMatchObject({
            codigo: primera.codigo, estado: { codigo: 'abierta', nombre: 'Abierta' }, referencia: 'Mesa 1',
            responsable: { id: String(meseroUsuario._id) }, comensales: 2, total: 0, pendiente: 0, minutos: 20,
        })
        expect(domicilio).toMatchObject({
            codigo: expect.stringMatching(/^PED-[0-9A-F]{6}$/), estado: { codigo: 'pendiente', nombre: 'Pendiente' },
            referencia: 'Centro', cliente: 'Ana Pérez', responsable: null, total: 9000, hora: '10:00', minutos: 15,
        })
        // Forma exacta de la fila de domicilio: sin correo, teléfono, dirección, usuario ni indicaciones
        expect(Object.keys(domicilio).sort()).toEqual(CLAVES_FILA_DOMICILIO)
        // El código es el mismo que en el panel de pedidos del staff
        const enPedidos = (await mesero.get('/api/v1/staff/pedidos')).body.find((p) => String(p.id) === pedidoId)
        expect(domicilio.codigo).toBe(enPedidos.codigo)
    })

    it('incluye la cuenta pedida; no incluye domicilios entregados o cancelados ni cuentas canceladas', async () => {
        const entregado = await crearPedido(cliente)
        const cancelado = await crearPedido(cliente)
        const { sesion: admin } = await crearConSesion('admin')
        for (const codigo of ['confirmado', 'en_preparacion', 'listo', 'en_camino', 'entregado']) {
            expect((await admin.patch(`/api/v1/staff/pedidos/${entregado}/estado`).send({ codigo })).status).toBe(200)
        }
        expect((await admin.patch(`/api/v1/staff/pedidos/${cancelado}/cancelar`).send({ motivo: 'Prueba' })).status).toBe(200)
        const cancelada = await abrir(mesas[0])
        expect((await mesero.post(`/api/v1/staff/salon/cuentas/${cancelada.id}/cancelar`)
            .send({ motivo: 'Se fueron', versionEsperada: cancelada.version })).status).toBe(200)
        // Cuenta pedida: un ítem enviado y «solicitar cuenta»
        const pedidaId = await cuentaPedida(mesas[1])
        const abierta = await abrir(mesas[2])
        const res = await mesero.get(URL)
        expect(res.body.cuentas.map((c) => [c.id, c.estado.codigo])).toEqual([[pedidaId, 'cuenta_pedida'], [abierta.id, 'abierta']])
        expect(res.body.cuentas[0].estado.nombre).toBe('Cuenta pedida')
    })

    it('cada parte según su permiso: solo pedido:ver → solo domicilio; solo cuenta:ver → solo salón', async () => {
        await crearPedido(cliente)
        await abrir(mesas[0])
        await Rol.create({ nombre: 'solo-pedidos', permisos: ['pedido:ver'] })
        await Rol.create({ nombre: 'solo-cuentas', permisos: ['cuenta:ver'] })
        const { sesion: soloPedidos } = await crearConSesion('solo-pedidos')
        const { sesion: soloCuentas } = await crearConSesion('solo-cuentas')
        const dePedidos = (await soloPedidos.get(URL)).body
        expect(dePedidos.canales).toEqual({ salon: false, domicilio: true })
        expect(dePedidos.cuentas.map((c) => c.canal)).toEqual(['domicilio'])
        const deCuentas = (await soloCuentas.get(URL)).body
        expect(deCuentas.canales).toEqual({ salon: true, domicilio: false })
        expect(deCuentas.cuentas.map((c) => c.canal)).toEqual(['salon'])
    })

    it('al llegar al límite avisa con «truncado» y conserva las más nuevas', async () => {
        aLos(0)
        await abrir(mesas[0])
        aLos(5)
        const nueva = await abrir(mesas[1])
        const sesion = { id: String(meseroUsuario._id), permisos: ['cuenta:ver'] }
        const resultado = await listarCuentasAbiertas(sesion, { limite: 1 })
        expect(resultado.truncado).toBe(true)
        expect(resultado.cuentas.map((c) => c.id)).toEqual([nueva.id])
        expect((await listarCuentasAbiertas(sesion, { limite: 5 })).truncado).toBe(false)
    })

    it('sin cuenta:ver ni pedido:ver → 403 FORBIDDEN; un cliente → 403; sin sesión → 401', async () => {
        await Rol.create({ nombre: 'sin-nada', permisos: ['mesa:ver'] })
        const { sesion: sinNada } = await crearConSesion('sin-nada')
        const prohibido = await sinNada.get(URL)
        expect(prohibido.status).toBe(403)
        expect(prohibido.body.error.code).toBe('FORBIDDEN')
        expect((await cliente.get(URL)).body.error.code).toBe('FORBIDDEN')
        const anonimo = await api().get(URL)
        expect(anonimo.status).toBe(401)
        expect(anonimo.body.error.code).toEqual(expect.any(String))
    })
})

// Cuenta en «cuenta pedida»: un ítem enviado y solicitar (como en salon-staff-api)
async function cuentaPedida(mesa) {
    const { categoriaDePrueba } = await import('./helpers/datos.js')
    const Producto = (await import('../src/modulos/catalogo/producto.model.js')).default
    const bebidas = await categoriaDePrueba('Cafés de cuentas')
    const latte = await Producto.create({ codigo: 901, nombre: 'Latte cuentas', precio: 9000, categoria: bebidas._id })
    const cuenta = await abrir(mesa)
    const conItem = (await mesero.post(`/api/v1/staff/salon/cuentas/${cuenta.id}/items`).send({ productoId: String(latte._id), cantidad: 1 })).body.cuenta
    const enviada = (await mesero.post(`/api/v1/staff/salon/cuentas/${cuenta.id}/rondas/${conItem.ultimaRonda + 1}/enviar`)
        .send({ versionEsperada: conItem.version })).body
    const pedida = await mesero.post(`/api/v1/staff/salon/cuentas/${cuenta.id}/solicitar`).send({ versionEsperada: enviada.version })
    expect(pedida.status, JSON.stringify(pedida.body)).toBe(200)
    return cuenta.id
}
