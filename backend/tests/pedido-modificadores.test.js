// 1.12 · Modificadores en el pedido a domicilio: el MISMO validador que las cuentas (obligatorio,
// mín./máx., opción disponible, grupo activo y del producto), copia en DetallePedido y precio en el servidor.
import { describe, it, expect, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { crearConSesion } from './helpers/usuarios.js'
import { categoriaDePrueba } from './helpers/datos.js'
import Producto from '../src/modulos/catalogo/producto.model.js'
import GrupoModificadores from '../src/modulos/catalogo/grupoModificadores.model.js'
import DetallePedido from '../src/modulos/pedidos/detallePedido.model.js'
import Pedido from '../src/modulos/pedidos/pedido.model.js'
import { validarModificadores } from '../src/modulos/catalogo/modificadores.validacion.js'
import { validarModificadores as validadorDeCuentas } from '../src/modulos/salon/cuentas.service.js'

let cliente
let staff
let termino
let extras
let inactivo
let huevos
let jugo
let metodoPagoId

beforeEach(async () => {
    ;({ sesion: cliente } = await crearConSesion('cliente'))
    ;({ sesion: staff } = await crearConSesion('mesero'))
    termino = await GrupoModificadores.create({
        nombre: 'Término del huevo', obligatorio: true, min: 1, max: 1,
        opciones: [{ nombre: 'Revueltos' }, { nombre: 'Fritos' }, { nombre: 'Pochados', disponible: false }],
    })
    extras = await GrupoModificadores.create({
        nombre: 'Extras', obligatorio: false, min: 0, max: 2,
        opciones: [{ nombre: 'Tocineta', precioExtra: 3000 }, { nombre: 'Aguacate', precioExtra: 2500 }, { nombre: 'Queso', precioExtra: 2000 }],
    })
    inactivo = await GrupoModificadores.create({ nombre: 'Salsas', obligatorio: false, min: 0, max: 1, opciones: [{ nombre: 'Picante' }], activo: false })
    const desayunos = await categoriaDePrueba('Desayunos')
    huevos = await Producto.create({
        codigo: 501, nombre: 'Huevos al gusto', precio: 15000, categoria: desayunos._id, gruposModificadores: [termino._id, extras._id, inactivo._id],
    })
    jugo = await Producto.create({ codigo: 502, nombre: 'Jugo de naranja', precio: 7000, categoria: desayunos._id })
    metodoPagoId = (await cliente.get('/api/v1/cliente/metodos-pago')).body[0].id
})

const opcion = (grupo, nombre) => String(grupo.opciones.find((o) => o.nombre === nombre)._id)
const elegir = (grupo, ...nombres) => ({ grupoId: String(grupo._id), opcionIds: nombres.map((n) => opcion(grupo, n)) })
const pedir = (items) => cliente.post('/api/v1/cliente/pedidos').send({
    items, nombre: 'Ana Pérez', telefono: '3001234567', direccion: 'Cra 36b Oriente #30-06', hora: '10:00', barrio: 'Centro', metodoPagoId,
})
const huevosCon = (modificadores, extra = {}) => ({ productoRef: String(huevos._id), cantidad: 1, modificadores, ...extra })

describe('DetallePedido: montos coherentes (1.12)', () => {
    const linea = (extra) => ({
        pedido: new mongoose.Types.ObjectId(), producto: huevos._id, nombreProducto: 'Huevos al gusto', precioProducto: 15000,
        modificadores: [{ grupo: extras._id, grupoNombre: 'Extras', opcion: extras.opciones[0]._id, opcionNombre: 'Tocineta', precioExtra: 3000 }],
        precioUnitario: 18000, cantidad: 2, subtotal: 36000, ...extra,
    })

    it('rechaza un unitario que no es base + recargos o un subtotal que no es unitario × cantidad (también con insertMany)', async () => {
        await expect(DetallePedido.insertMany([linea({ precioUnitario: 15000, subtotal: 30000 })])).rejects.toThrow(/precio base más los recargos/)
        await expect(DetallePedido.insertMany([linea({ subtotal: 30000 })])).rejects.toThrow(/precio unitario por la cantidad/)
        await expect(DetallePedido.create(linea({ subtotal: 36000.5 }))).rejects.toThrow()
        await expect(DetallePedido.create(linea())).resolves.toBeDefined()
    })

    it('una línea nueva exige precioUnitario; una anterior a 1.12 sin él se sigue leyendo', async () => {
        await expect(DetallePedido.create(linea({ precioUnitario: undefined, modificadores: [] }))).rejects.toThrow(/precioUnitario/)
        const { insertedId } = await DetallePedido.collection.insertOne({
            pedido: new mongoose.Types.ObjectId(), producto: jugo._id, nombreProducto: 'Jugo', precioProducto: 7000, cantidad: 1, subtotal: 7000,
        })
        const antigua = await DetallePedido.findById(insertedId)
        expect(antigua.modificadores).toEqual([])
        expect(antigua.nota).toBe('')
    })
})

describe('POST /api/v1/cliente/pedidos con modificadores (1.12)', () => {
    it('guarda la copia de modificadores, recargos y nota; el precio y el total los calcula el servidor', async () => {
        const res = await pedir([
            huevosCon([elegir(termino, 'Fritos'), elegir(extras, 'Tocineta', 'Aguacate')], { cantidad: 2, nota: 'Sin sal' }),
            { productoRef: String(jugo._id), cantidad: 1 },
        ])
        expect(res.status, JSON.stringify(res.body)).toBe(201)
        const pedido = await Pedido.findById(res.body.order._id).lean()
        expect(pedido.total).toBe((15000 + 3000 + 2500) * 2 + 7000)
        const [linea, sinOpciones] = await DetallePedido.find({ pedido: pedido._id }).sort({ _id: 1 }).lean()
        expect(linea).toMatchObject({
            nombreProducto: 'Huevos al gusto', precioProducto: 15000, precioUnitario: 20500, cantidad: 2, subtotal: 41000, nota: 'Sin sal',
        })
        expect(linea.modificadores.map((m) => [m.grupoNombre, m.opcionNombre, m.precioExtra])).toEqual([
            ['Término del huevo', 'Fritos', 0], ['Extras', 'Tocineta', 3000], ['Extras', 'Aguacate', 2500],
        ])
        expect(sinOpciones).toMatchObject({ precioUnitario: 7000, subtotal: 7000, modificadores: [], nota: '' })
    })

    it('un precio enviado por el cliente se ignora (campos desconocidos no cuentan)', async () => {
        const res = await pedir([huevosCon([elegir(termino, 'Revueltos')], { precio: 1 })])
        expect(res.status).toBe(201)
        expect(res.body.order.total).toBe(15000)
    })

    it('el mismo producto con opciones distintas va en líneas separadas', async () => {
        const res = await pedir([huevosCon([elegir(termino, 'Fritos')]), huevosCon([elegir(termino, 'Revueltos')])])
        expect(res.status).toBe(201)
        const lineas = await DetallePedido.find({ pedido: res.body.order._id }).sort({ _id: 1 }).lean()
        expect(lineas.map((l) => l.modificadores[0].opcionNombre)).toEqual(['Fritos', 'Revueltos'])
    })

    it.each([
        ['sin el obligatorio', () => [], 400, 'MODIFICADOR_REQUERIDO'],
        ['más del máximo', () => [elegir(termino, 'Fritos'), elegir(extras, 'Tocineta', 'Aguacate', 'Queso')], 400, 'MODIFICADORES_FUERA_DE_RANGO'],
        ['una opción agotada', () => [elegir(termino, 'Pochados')], 409, 'OPCION_NO_DISPONIBLE'],
        ['un grupo inactivo', () => [elegir(termino, 'Fritos'), elegir(inactivo, 'Picante')], 400, 'GRUPO_NO_VALIDO'],
        ['una opción de otro grupo', () => [{ grupoId: String(termino._id), opcionIds: [opcion(extras, 'Queso')] }], 400, 'OPCION_NO_VALIDA'],
    ])('rechaza %s y no crea nada', async (_caso, modificadores, status, codigo) => {
        const res = await pedir([huevosCon(modificadores())])
        expect(res.status, JSON.stringify(res.body)).toBe(status)
        expect(res.body.error.code).toBe(codigo)
        expect(await Pedido.countDocuments()).toBe(0)
        expect(await DetallePedido.countDocuments()).toBe(0)
    })

    it('rechaza un grupo repetido y dice qué línea y qué plato fallan', async () => {
        const res = await pedir([
            { productoRef: String(jugo._id), cantidad: 1 },
            huevosCon([elegir(termino, 'Fritos'), elegir(termino, 'Revueltos')]),
        ])
        expect(res.status).toBe(400)
        expect(res.body.error).toMatchObject({ code: 'GRUPO_NO_VALIDO', details: { linea: 1, producto: 'Huevos al gusto' } })
        // Es el mismo validador de las cuentas del salón
        expect(validadorDeCuentas).toBe(validarModificadores)
    })

    it('rechaza un grupo que no es del producto', async () => {
        const res = await pedir([{ productoRef: String(jugo._id), cantidad: 1, modificadores: [elegir(extras, 'Queso')] }])
        expect(res.status).toBe(400)
        expect(res.body.error.code).toBe('GRUPO_NO_VALIDO')
    })

    it('una nota de más de 140 caracteres → 400 con el mensaje en español y sin crear nada', async () => {
        const res = await pedir([huevosCon([elegir(termino, 'Fritos')], { nota: 'x'.repeat(141) })])
        expect(res.status).toBe(400)
        expect(res.body.error.code).toBe('VALIDATION_ERROR')
        expect(JSON.stringify(res.body.error.details)).toMatch(/La nota no puede superar 140 caracteres/)
        expect(await Pedido.countDocuments()).toBe(0)
    })
})

describe('Lectura: staff y «Mis pedidos» (1.12)', () => {
    it('el staff ve modificadores, nota y precio unitario en el detalle; el cliente, en Mis pedidos', async () => {
        const res = await pedir([huevosCon([elegir(termino, 'Fritos'), elegir(extras, 'Queso')], { nota: 'Bien cocidos' })])
        const id = res.body.order._id
        const detalle = (await staff.get(`/api/v1/staff/pedidos/${id}`)).body
        expect(detalle.items[0]).toMatchObject({
            nombre: 'Huevos al gusto', cantidad: 1, precio: 17000, precioBase: 15000, subtotal: 17000, nota: 'Bien cocidos',
            modificadores: [{ grupo: 'Término del huevo', opcion: 'Fritos', precioExtra: 0 }, { grupo: 'Extras', opcion: 'Queso', precioExtra: 2000 }],
        })
        const [mio] = (await cliente.get('/api/v1/cliente/pedidos')).body.orders
        expect(mio.items[0]).toMatchObject({
            name: 'Huevos al gusto', quantity: 1, unitPrice: 17000, note: 'Bien cocidos',
            options: [{ group: 'Término del huevo', option: 'Fritos', extraPrice: 0 }, { group: 'Extras', option: 'Queso', extraPrice: 2000 }],
        })
    })

    it('una línea anterior a 1.12 (sin modificadores, nota ni precioUnitario) se sigue viendo igual', async () => {
        const res = await pedir([{ productoRef: String(jugo._id), cantidad: 2 }])
        const id = res.body.order._id
        await DetallePedido.collection.updateMany({ pedido: new mongoose.Types.ObjectId(id) }, { $unset: { modificadores: '', nota: '', precioUnitario: '' } })
        const detalle = (await staff.get(`/api/v1/staff/pedidos/${id}`)).body
        expect(detalle.items[0]).toMatchObject({ nombre: 'Jugo de naranja', cantidad: 2, precio: 7000, subtotal: 14000, modificadores: [], nota: '' })
        const [mio] = (await cliente.get('/api/v1/cliente/pedidos')).body.orders
        expect(mio.items[0]).toMatchObject({ name: 'Jugo de naranja', quantity: 2, unitPrice: 7000, options: [], note: '' })
    })
})
