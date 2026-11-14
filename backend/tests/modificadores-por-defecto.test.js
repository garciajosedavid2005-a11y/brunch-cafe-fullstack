// 3.7.1 · Opción por defecto en los grupos de opción única (máximo 1): Leche �  Entera y Tamaño �  Normal.
// La configura el admin; si una línea llega sin ese grupo (o con él vacío), el backend aplica la opción por
// defecto y la guarda en la copia de la línea, de modo que la cocina y el detalle siempre la ven. Si está
// agotada se usa la siguiente disponible; si no queda ninguna, el producto no se puede pedir (409).
import { describe, it, expect, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { crearConSesion } from './helpers/usuarios.js'
import { categoriaDePrueba } from './helpers/datos.js'
import Producto from '../src/modulos/catalogo/producto.model.js'
import GrupoModificadores from '../src/modulos/catalogo/grupoModificadores.model.js'
import DetallePedido from '../src/modulos/pedidos/detallePedido.model.js'
import Zona from '../src/modulos/salon/zona.model.js'
import Mesa from '../src/modulos/salon/mesa.model.js'
import Cuenta from '../src/modulos/salon/cuenta.model.js'
import Comanda from '../src/modulos/salon/comanda.model.js'
import Usuario from '../src/modulos/identidad/usuario.model.js'
import Rol from '../src/modulos/identidad/rol.model.js'
import { PERMISOS_SALON, PERMISOS_COCINA } from '../src/modulos/identidad/permisos.js'
import { validarModificadores } from '../src/modulos/catalogo/modificadores.validacion.js'
import { abrirCuenta, agregarItem, enviarRonda } from '../src/modulos/salon/cuentas.service.js'
import { obtenerCola } from '../src/modulos/cocina/cocina.service.js'

const { ObjectId } = mongoose.Types
const fallo = (promesaOFuncion) => {
    try {
        const r = typeof promesaOFuncion === 'function' ? promesaOFuncion() : promesaOFuncion
        if (r?.then) return r.then(() => { throw new Error('Se esperaba un error') }, (e) => e)
    } catch (e) {
        return e
    }
    throw new Error('Se esperaba un error')
}

let leche
let tamano
let extras
let termino

beforeEach(async () => {
    leche = await GrupoModificadores.create({
        nombre: 'Leche', obligatorio: false, min: 0, max: 1,
        opciones: [{ nombre: 'Entera', porDefecto: true }, { nombre: 'Deslactosada' }, { nombre: 'Almendra', precioExtra: 2000 }],
    })
    tamano = await GrupoModificadores.create({
        nombre: 'Tamaño', obligatorio: false, min: 0, max: 1,
        opciones: [{ nombre: 'Normal', porDefecto: true }, { nombre: 'Grande', precioExtra: 3000 }],
    })
    extras = await GrupoModificadores.create({
        nombre: 'Extras', obligatorio: false, min: 0, max: 2, opciones: [{ nombre: 'Tocineta', precioExtra: 4000 }, { nombre: 'Queso' }],
    })
    termino = await GrupoModificadores.create({
        nombre: 'Término del huevo', obligatorio: true, min: 1, max: 1, opciones: [{ nombre: 'Yema líquida' }, { nombre: 'Bien cocido' }],
    })
})

const lean = (grupo) => grupo.toObject()
const opcionDe = (grupo, nombre) => String(grupo.opciones.find((o) => o.nombre === nombre)._id)
const texto = (copia) => copia.map((m) => `${m.grupoNombre}: ${m.opcionNombre}`)

describe('Modelo: opción por defecto (3.7.1)', () => {
    it('una sola por grupo y solo en grupos de opción única (máximo 1)', async () => {
        const dos = await fallo(GrupoModificadores.create({
            nombre: 'Pan', obligatorio: false, min: 0, max: 1, opciones: [{ nombre: 'Blanco', porDefecto: true }, { nombre: 'Integral', porDefecto: true }],
        }))
        expect(dos.message).toMatch(/Solo una opción puede ir por defecto/)
        const varias = await fallo(GrupoModificadores.create({
            nombre: 'Salsas', obligatorio: false, min: 0, max: 2, opciones: [{ nombre: 'Rosada', porDefecto: true }, { nombre: 'Tártara' }],
        }))
        expect(varias.message).toMatch(/solo aplica a grupos de opción única/)
        expect(leche.opciones.map((o) => o.porDefecto)).toEqual([true, false, false])
    })
})

describe('validarModificadores aplica la opción por defecto (3.7.1)', () => {
    const grupos = () => [lean(leche), lean(tamano), lean(extras)]

    it('sin el grupo, o con el grupo vacío, guarda la opción por defecto; «Extras» (varias) puede quedar en ninguno', () => {
        expect(texto(validarModificadores(grupos(), []))).toEqual(['Leche: Entera', 'Tamaño: Normal'])
        const vacio = [{ grupoId: String(leche._id), opcionIds: [] }]
        expect(texto(validarModificadores(grupos(), vacio))).toEqual(['Leche: Entera', 'Tamaño: Normal'])
    })

    it('lo elegido gana sobre la opción por defecto y conserva su recargo', () => {
        const copia = validarModificadores(grupos(), [{ grupoId: String(leche._id), opcionIds: [opcionDe(leche, 'Almendra')] }])
        expect(texto(copia)).toEqual(['Leche: Almendra', 'Tamaño: Normal'])
        expect(copia[0].precioExtra).toBe(2000)
    })

    it('si la opción por defecto está agotada usa la siguiente disponible; si no queda ninguna �  409', () => {
        const agotada = lean(leche)
        agotada.opciones[0].disponible = false
        expect(texto(validarModificadores([agotada], []))).toEqual(['Leche: Deslactosada'])
        for (const o of agotada.opciones) o.disponible = false
        const error = fallo(() => validarModificadores([agotada], []))
        expect(error).toMatchObject({ status: 409, code: 'OPCION_NO_DISPONIBLE' })
    })

    it('un grupo obligatorio sin opción por defecto («Término del huevo») sigue exigiendo elegir', () => {
        expect(fallo(() => validarModificadores([lean(termino)], []))).toMatchObject({ status: 400, code: 'MODIFICADOR_REQUERIDO' })
    })
})

describe('La ronda del salón y la cocina (3.7.1)', () => {
    let mesero
    let barista
    let latte
    let mesa
    beforeEach(async () => {
        await Promise.all([Cuenta.createIndexes(), Comanda.createIndexes(), Mesa.createIndexes()])
        const rolMesero = await Rol.findOne({ nombre: 'mesero' })
        const persona = await Usuario.create({ nombre: 'Lucía', apellido: 'Gómez', correo: 'lucia37@example.com', contraseña: 'x'.repeat(20), rol: rolMesero._id })
        mesero = { id: String(persona._id), rol: 'mesero', permisos: [...PERMISOS_SALON.mesero, ...PERMISOS_COCINA.mesero] }
        barista = { id: String(new ObjectId()), rol: 'barista', permisos: ['pedido:ver', ...PERMISOS_COCINA.barista], estaciones: ['barra'] }
        const zona = await Zona.create({ nombre: 'Interior' })
        mesa = await Mesa.create({ numero: 1, zona: zona._id, capacidad: 4 })
        const bebidas = await categoriaDePrueba('Bebidas')
        latte = await Producto.create({ codigo: 9371, nombre: 'Latte', precio: 9000, categoria: bebidas._id, gruposModificadores: [leche._id, tamano._id] })
    })

    it('un latte sin Leche ni Tamaño se envía con «Leche: Entera · Tamaño: Normal» y la barra lo ve', async () => {
        const cuenta = await abrirCuenta({ mesaId: String(mesa._id), comensales: 1 }, mesero)
        await agregarItem(cuenta.id, { productoId: String(latte._id), cantidad: 1 }, mesero)
        const { version } = await Cuenta.findById(cuenta.id).lean()
        await enviarRonda(cuenta.id, { numeroRonda: 1, versionEsperada: version }, mesero)
        const ronda = await Comanda.findOne({ cuenta: cuenta.id, numeroRonda: 1 }).lean()
        expect(texto(ronda.items[0].modificadores)).toEqual(['Leche: Entera', 'Tamaño: Normal'])
        const barra = await obtenerCola({ estacion: 'barra' }, barista)
        expect(barra.salon[0].items[0].modificadores).toEqual([{ grupo: 'Leche', opcion: 'Entera' }, { grupo: 'Tamaño', opcion: 'Normal' }])
    })
})

describe('El pedido a domicilio (3.7.1)', () => {
    it('un latte sin Leche ni Tamaño guarda la opción por defecto en la copia de la línea', async () => {
        const { sesion: cliente } = await crearConSesion('cliente')
        const bebidas = await categoriaDePrueba('Bebidas')
        const latte = await Producto.create({ codigo: 9372, nombre: 'Latte', precio: 9000, categoria: bebidas._id, gruposModificadores: [leche._id, tamano._id] })
        const metodoPagoId = (await cliente.get('/api/v1/cliente/metodos-pago')).body[0].id
        const res = await cliente.post('/api/v1/cliente/pedidos').send({
            items: [{ productoRef: String(latte._id), cantidad: 1 }],
            nombre: 'Ana Pérez', telefono: '3001234567', direccion: 'Cra 36b Oriente #30-06', hora: '10:00', barrio: 'Centro', metodoPagoId,
        })
        expect(res.status, JSON.stringify(res.body)).toBe(201)
        const linea = await DetallePedido.findOne({ producto: latte._id }).lean()
        expect(texto(linea.modificadores)).toEqual(['Leche: Entera', 'Tamaño: Normal'])
        expect(linea.precioUnitario).toBe(9000)
    })
})

describe('Admin ⬺ Modificadores: campo «Opción por defecto» (3.7.1)', () => {
    it('se guarda y se lee por la API; en un grupo de varias opciones �  400', async () => {
        const { sesion: admin } = await crearConSesion('admin')
        const creado = await admin.post('/api/v1/admin/grupos-modificadores').send({
            nombre: 'Pan', obligatorio: false, min: 0, max: 1, opciones: [{ nombre: 'Blanco' }, { nombre: 'Integral', porDefecto: true }],
        })
        expect(creado.status, JSON.stringify(creado.body)).toBe(201)
        expect(creado.body.opciones.map((o) => o.porDefecto)).toEqual([false, true])
        // Al editar sin mandar la marca, la opción conserva la suya
        const [blanco, integral] = creado.body.opciones
        const editado = await admin.put(`/api/v1/admin/grupos-modificadores/${creado.body.id}`).send({
            opciones: [{ id: blanco.id, nombre: 'Blanco' }, { id: integral.id, nombre: 'Integral' }],
        })
        expect(editado.status, JSON.stringify(editado.body)).toBe(200)
        expect(editado.body.opciones.map((o) => o.porDefecto)).toEqual([false, true])
        const varias = await admin.post('/api/v1/admin/grupos-modificadores').send({
            nombre: 'Salsas', obligatorio: false, min: 0, max: 2, opciones: [{ nombre: 'Rosada', porDefecto: true }, { nombre: 'Tártara' }],
        })
        expect(varias.status).toBe(400)
    })
})
