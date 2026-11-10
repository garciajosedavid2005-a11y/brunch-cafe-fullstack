import { describe, it, expect, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { crearConSesion } from './helpers/usuarios.js'
import { api } from './helpers/app.js'
import Estacion from '../src/modulos/catalogo/estacion.model.js'
import Categoria from '../src/modulos/catalogo/categoria.model.js'
import Producto from '../src/modulos/catalogo/producto.model.js'
import Rol from '../src/modulos/identidad/rol.model.js'

// 1.3 · Estaciones (F1-3): CRUD con salon:configurar; asignación en categorías y productos
// con catalogo:gestionar. Una estación en uso no se borra ni se desactiva (409 ESTACION_EN_USO).
const ESTACIONES = '/api/v1/admin/estaciones'
const CATEGORIAS = '/api/v1/admin/categorias'
const PRODUCTOS = '/api/v1/admin/productos'
const idFalso = () => String(new mongoose.Types.ObjectId())

let admin
let cocina
let barra
beforeEach(async () => {
    await Estacion.init()
    admin = (await crearConSesion('admin')).sesion
    // El setup siembra Cocina y Barra (lo que deja seed:base)
    cocina = await Estacion.findOne({ codigo: 'cocina' }).lean()
    barra = await Estacion.findOne({ codigo: 'barra' }).lean()
})

const crearEstacion = async (datos = {}) => {
    const res = await admin.post(ESTACIONES).send({ codigo: 'parrilla', nombre: 'Parrilla', ...datos })
    expect(res.status, JSON.stringify(res.body)).toBe(201)
    return res.body
}

describe('Permisos de estaciones', () => {
    const rutas = [
        ['get', ESTACIONES], ['post', ESTACIONES], ['put', `${ESTACIONES}/${idFalso()}`], ['delete', `${ESTACIONES}/${idFalso()}`],
    ]
    it.each(rutas)('%s %s sin sesión → 401', async (metodo, ruta) => {
        expect((await api()[metodo](ruta).send({})).status).toBe(401)
    })
    it('quien gestiona el catálogo (sin salon:configurar) lista las estaciones para asignarlas, pero no las edita', async () => {
        await Rol.create({ nombre: 'catalogo_prueba', etiqueta: 'Catálogo', permisos: ['catalogo:gestionar'] })
        const { sesion } = await crearConSesion('catalogo_prueba')
        expect((await sesion.get(ESTACIONES)).status).toBe(200)
        expect((await sesion.post(ESTACIONES).send({ codigo: 'horno', nombre: 'Horno' })).status).toBe(403)
        expect((await sesion.put(`${ESTACIONES}/${cocina._id}`).send({ nombre: 'Cocina 2' })).status).toBe(403)
        expect((await sesion.delete(`${ESTACIONES}/${cocina._id}`)).status).toBe(403)
    })

    it.each(rutas)('%s %s como mesero o cocina (sin salon:configurar) → 403', async (metodo, ruta) => {
        for (const rol of ['mesero', 'cocina']) {
            const { sesion } = await crearConSesion(rol)
            expect((await sesion[metodo](ruta).send({})).status).toBe(403)
        }
    })
})

describe('Estaciones (CRUD)', () => {
    it('el seed deja Cocina y Barra activas; se listan con su uso', async () => {
        await Categoria.create({ nombre: 'Bebidas', estacion: barra._id })
        const res = await admin.get(ESTACIONES)
        expect(res.status).toBe(200)
        expect(res.body.map((e) => [e.codigo, e.nombre, e.activa, e.categorias, e.productos])).toEqual([
            ['barra', 'Barra', true, 1, 0],
            ['cocina', 'Cocina', true, 0, 0],
        ])
    })

    it('crea con código en minúsculas; el código es único (409 ESTACION_DUPLICADA) y también el nombre', async () => {
        const creada = await crearEstacion()
        expect(creada).toMatchObject({ codigo: 'parrilla', nombre: 'Parrilla', activa: true })
        const mismoCodigo = await admin.post(ESTACIONES).send({ codigo: 'parrilla', nombre: 'Otra' })
        expect(mismoCodigo.status).toBe(409)
        expect(mismoCodigo.body.error.code).toBe('ESTACION_DUPLICADA')
        const mismoNombre = await admin.post(ESTACIONES).send({ codigo: 'otra', nombre: 'PARRÍLLA' })
        expect(mismoNombre.status).toBe(409)
        expect(mismoNombre.body.error.code).toBe('ESTACION_DUPLICADA')
    })

    it('valida código y nombre (400 con detalles)', async () => {
        for (const datos of [{ codigo: 'Con Espacios', nombre: 'X1' }, { codigo: 'ok', nombre: '' }, { nombre: 'Sin código' }]) {
            const res = await admin.post(ESTACIONES).send(datos)
            expect(res.status, JSON.stringify(datos)).toBe(400)
            expect(res.body.error.code).toBe('VALIDATION_ERROR')
        }
    })

    it('el código no cambia al editar (lo usa el KDS de la Fase 2); el nombre sí', async () => {
        const creada = await crearEstacion()
        const res = await admin.put(`${ESTACIONES}/${creada.id}`).send({ codigo: 'otro', nombre: 'Parrilla y horno' })
        expect(res.status).toBe(200)
        expect(res.body).toMatchObject({ codigo: 'parrilla', nombre: 'Parrilla y horno' })
    })

    it('una estación en uso no se borra ni se desactiva (409 ESTACION_EN_USO); sin uso sí', async () => {
        const parrilla = await crearEstacion()
        const cat = await Categoria.create({ nombre: 'Asados', estacion: parrilla.id })
        for (const res of [
            await admin.delete(`${ESTACIONES}/${parrilla.id}`),
            await admin.put(`${ESTACIONES}/${parrilla.id}`).send({ activa: false }),
        ]) {
            expect(res.status).toBe(409)
            expect(res.body.error.code).toBe('ESTACION_EN_USO')
            expect(res.body.error.message).toMatch(/1 categoría/)
        }
        // También cuenta si solo la usa un producto (sobrescritura)
        await Categoria.updateOne({ _id: cat._id }, { estacion: cocina._id })
        await Producto.create({ codigo: 9, nombre: 'Costilla', precio: 30000, categoria: cat._id, estacion: parrilla.id })
        expect((await admin.delete(`${ESTACIONES}/${parrilla.id}`)).body.error.message).toMatch(/1 producto/)

        await Producto.deleteMany({})
        expect((await admin.put(`${ESTACIONES}/${parrilla.id}`).send({ activa: false })).status).toBe(200)
        expect((await admin.delete(`${ESTACIONES}/${parrilla.id}`)).status).toBe(200)
        expect(await Estacion.exists({ _id: parrilla.id })).toBeNull()
    })

    it('id mal formado o inexistente → 404', async () => {
        expect((await admin.put(`${ESTACIONES}/abc`).send({ nombre: 'Xyz' })).status).toBe(404)
        expect((await admin.delete(`${ESTACIONES}/${idFalso()}`)).status).toBe(404)
    })

    it('serialización determinista: asignar una estación la escribe, así que una desactivación en curso entra en conflicto', async () => {
        const parrilla = await crearEstacion()
        const session = await mongoose.startSession()
        session.startTransaction()
        try {
            // La desactivación ve la estación sin uso (snapshot)…
            expect(await Categoria.countDocuments({ estacion: parrilla.id }).session(session)).toBe(0)
            // …mientras otra petición crea una categoría con esa estación
            expect((await admin.post(CATEGORIAS).send({ nombre: 'Asados', estacionId: parrilla.id })).status).toBe(201)
            await expect(Estacion.updateOne({ _id: parrilla.id }, { activa: false }, { session }))
                .rejects.toThrow(/WriteConflict|Write conflict/i)
        } finally {
            await session.abortTransaction().catch(() => {})
            await session.endSession()
        }
    })

    it('asignar y borrar a la vez nunca deja una categoría con una estación borrada', async () => {
        for (let i = 0; i < 4; i++) {
            const est = await crearEstacion({ codigo: `est${i}`, nombre: `Estación ${i}` })
            const [borrar, crear] = await Promise.all([
                admin.delete(`${ESTACIONES}/${est.id}`),
                admin.post(CATEGORIAS).send({ nombre: `Categoría ${i}`, estacionId: est.id }),
            ])
            const existe = await Estacion.exists({ _id: est.id })
            const usan = await Categoria.countDocuments({ estacion: est.id })
            expect(Boolean(existe) || usan === 0, `iteración ${i}`).toBe(true)
            expect([borrar.status, crear.status].sort(), `iteración ${i}`).toEqual(borrar.status === 200 ? [200, 400] : [201, 409])
        }
    })
})

describe('Estación de la categoría (por defecto) y del producto (sobrescritura)', () => {
    it('una categoría nueva sin estación toma Cocina (F1-3); se puede elegir Barra', async () => {
        const postres = await admin.post(CATEGORIAS).send({ nombre: 'Postres' })
        expect(postres.status).toBe(201)
        expect(postres.body.estacion).toEqual({ id: String(cocina._id), codigo: 'cocina', nombre: 'Cocina' })
        const bebidas = await admin.post(CATEGORIAS).send({ nombre: 'Bebidas', estacionId: String(barra._id) })
        expect(bebidas.body.estacion.codigo).toBe('barra')

        const editada = await admin.put(`${CATEGORIAS}/${postres.body.id}`).send({ estacionId: String(barra._id) })
        expect(editada.status).toBe(200)
        expect(editada.body.estacion.codigo).toBe('barra')

        const lista = await admin.get(CATEGORIAS)
        expect(lista.body.find((c) => c.nombre === 'Postres').estacion.codigo).toBe('barra')
    })

    it('la categoría siempre tiene estación: null o una estación inactiva o inexistente → 400', async () => {
        const parrilla = await crearEstacion()
        await admin.put(`${ESTACIONES}/${parrilla.id}`).send({ activa: false })
        const cat = await admin.post(CATEGORIAS).send({ nombre: 'Postres' })
        for (const estacionId of [null, parrilla.id, idFalso(), 'abc']) {
            const res = await admin.put(`${CATEGORIAS}/${cat.body.id}`).send({ estacionId })
            expect(res.status, String(estacionId)).toBe(400)
        }
        const conInactiva = await admin.post(CATEGORIAS).send({ nombre: 'Asados', estacionId: parrilla.id })
        expect(conInactiva.status).toBe(400)
        expect(conInactiva.body.error.code).toBe('ESTACION_NO_VALIDA')
    })

    it('el producto hereda la estación de su categoría y puede sobrescribirla (null vuelve a heredar)', async () => {
        const bebidas = await admin.post(CATEGORIAS).send({ nombre: 'Bebidas', estacionId: String(barra._id) })
        const creado = await admin.post(PRODUCTOS).send({ nombre: 'Latte', precio: 9000, categoriaId: bebidas.body.id })
        expect(creado.status).toBe(201)
        expect(creado.body).toMatchObject({ estacionId: null, estacionEfectiva: { codigo: 'barra', nombre: 'Barra' } })

        const propia = await admin.put(`${PRODUCTOS}/${creado.body.id}`).send({ estacionId: String(cocina._id) })
        expect(propia.status).toBe(200)
        expect(propia.body).toMatchObject({ estacionId: String(cocina._id), estacionEfectiva: { codigo: 'cocina' } })

        const hereda = await admin.put(`${PRODUCTOS}/${creado.body.id}`).send({ estacionId: null })
        expect(hereda.body).toMatchObject({ estacionId: null, estacionEfectiva: { codigo: 'barra' } })

        const inactiva = await crearEstacion()
        await admin.put(`${ESTACIONES}/${inactiva.id}`).send({ activa: false })
        const res = await admin.put(`${PRODUCTOS}/${creado.body.id}`).send({ estacionId: inactiva.id })
        expect(res.status).toBe(400)
        expect(res.body.error.code).toBe('ESTACION_NO_VALIDA')
    })
})

describe('Categoria.estacion en el esquema', () => {
    it('una categoría nueva exige estación (también fuera de la API); una anterior a 1.3 se sigue pudiendo editar', async () => {
        await expect(Categoria.create({ nombre: 'Sin estación' })).rejects.toThrow(/estaci/i)
        const { insertedId } = await mongoose.connection.db.collection('categorias').insertOne({ nombre: 'Antigua' })
        const antigua = await Categoria.findById(insertedId)
        antigua.descripcion = 'Editada'
        await expect(antigua.save()).resolves.toBeTruthy()
    })
})

describe('estacionEfectiva (función única)', () => {
    it('producto.estacion manda; si no tiene, la de la categoría; si ninguna, null', async () => {
        const { estacionEfectiva } = await import('../src/modulos/catalogo/estaciones.js')
        const a = new mongoose.Types.ObjectId()
        const b = new mongoose.Types.ObjectId()
        expect(String(estacionEfectiva({ estacion: a }, { estacion: b }))).toBe(String(a))
        expect(String(estacionEfectiva({ estacion: null }, { estacion: b }))).toBe(String(b))
        expect(String(estacionEfectiva({}, { estacion: b }))).toBe(String(b))
        expect(estacionEfectiva({}, {})).toBeNull()
        expect(estacionEfectiva({}, null)).toBeNull()
    })
})
