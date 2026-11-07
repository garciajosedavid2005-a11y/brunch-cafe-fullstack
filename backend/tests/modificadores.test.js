import { describe, it, expect, beforeEach, vi } from 'vitest'
import mongoose from 'mongoose'
import { crearConSesion } from './helpers/usuarios.js'
import { api } from './helpers/app.js'
import GrupoModificadores from '../src/modulos/catalogo/grupoModificadores.model.js'
import Categoria from '../src/modulos/catalogo/categoria.model.js'
import Producto from '../src/modulos/catalogo/producto.model.js'
import Estacion from '../src/modulos/catalogo/estacion.model.js'

// 1.3 · Grupos de modificadores reutilizables (F1-4), permiso catalogo:gestionar.
// Reglas: min ≤ max, max ≤ número de opciones, obligatorio ⇔ min ≥ 1, recargo entero COP ≥ 0.
const GRUPOS = '/api/v1/admin/grupos-modificadores'
const PRODUCTOS = '/api/v1/admin/productos'
const idFalso = () => String(new mongoose.Types.ObjectId())

const LECHE = {
    nombre: 'Leche',
    obligatorio: false,
    min: 0,
    max: 1,
    opciones: [
        { nombre: 'Entera' },
        { nombre: 'Deslactosada' },
        { nombre: 'Almendra', precioExtra: 2000 },
    ],
}

let admin
let categoria
beforeEach(async () => {
    await GrupoModificadores.init()
    admin = (await crearConSesion('admin')).sesion
    const barra = await Estacion.findOne({ codigo: 'barra' })
    categoria = await Categoria.create({ nombre: 'Bebidas', estacion: barra._id })
})

const crearGrupo = async (datos = {}) => {
    const res = await admin.post(GRUPOS).send({ ...LECHE, ...datos })
    expect(res.status, JSON.stringify(res.body)).toBe(201)
    return res.body
}

describe('Permisos de los grupos de modificadores', () => {
    const rutas = [['get', GRUPOS], ['post', GRUPOS], ['put', `${GRUPOS}/${idFalso()}`], ['delete', `${GRUPOS}/${idFalso()}`]]
    it.each(rutas)('%s %s sin sesión → 401', async (metodo, ruta) => {
        expect((await api()[metodo](ruta).send({})).status).toBe(401)
    })
    it.each(rutas)('%s %s como mesero (sin catalogo:gestionar) → 403', async (metodo, ruta) => {
        const { sesion } = await crearConSesion('mesero')
        expect((await sesion[metodo](ruta).send({})).status).toBe(403)
    })
})

describe('Grupos de modificadores (CRUD)', () => {
    it('crea con opciones (recargo 0 por defecto, disponibles) y lista con el número de productos', async () => {
        const grupo = await crearGrupo()
        expect(grupo).toMatchObject({ nombre: 'Leche', obligatorio: false, min: 0, max: 1, activo: true, ejemplo: false, productos: 0 })
        expect(grupo.opciones).toEqual([
            { id: expect.stringMatching(/^[0-9a-f]{24}$/), nombre: 'Entera', precioExtra: 0, disponible: true },
            { id: expect.any(String), nombre: 'Deslactosada', precioExtra: 0, disponible: true },
            { id: expect.any(String), nombre: 'Almendra', precioExtra: 2000, disponible: true },
        ])
        await Producto.create({ codigo: 1, nombre: 'Latte', precio: 9000, categoria: categoria._id, gruposModificadores: [grupo.id] })
        const lista = await admin.get(GRUPOS)
        expect(lista.status).toBe(200)
        expect(lista.body.map((g) => [g.nombre, g.productos])).toEqual([['Leche', 1]])
    })

    it.each([
        ['min > max', { min: 2, max: 1, obligatorio: true }, 'min'],
        ['max > número de opciones', { max: 4 }, 'max'],
        ['obligatorio con min 0', { obligatorio: true, min: 0 }, 'min'],
        ['opcional con min ≥ 1', { obligatorio: false, min: 1 }, 'obligatorio'],
        ['recargo con decimales', { opciones: [{ nombre: 'Entera', precioExtra: 1500.5 }] }, 'opciones.0.precioExtra'],
        ['recargo negativo', { opciones: [{ nombre: 'Entera', precioExtra: -1 }] }, 'opciones.0.precioExtra'],
        ['sin opciones', { opciones: [], max: 0 }, 'opciones'],
        ['opciones repetidas (sin mayúsculas ni tildes)', { opciones: [{ nombre: 'Almendra' }, { nombre: 'ALMENDRA' }] }, 'opciones'],
        ['max 0', { max: 0 }, 'max'],
    ])('rechaza %s (400 VALIDATION_ERROR)', async (_caso, datos, campo) => {
        const res = await admin.post(GRUPOS).send({ ...LECHE, ...datos })
        expect(res.status).toBe(400)
        expect(res.body.error.code).toBe('VALIDATION_ERROR')
        expect(res.body.error.details.map((d) => d.campo)).toContain(campo)
    })

    it('el nombre es único sin mayúsculas ni tildes → 409 GRUPO_DUPLICADO', async () => {
        await crearGrupo()
        const res = await admin.post(GRUPOS).send({ ...LECHE, nombre: 'LECHE' })
        expect(res.status).toBe(409)
        expect(res.body.error.code).toBe('GRUPO_DUPLICADO')
    })

    it('al editar, las opciones con id conservan su id; las nuevas reciben uno; un id ajeno → 400', async () => {
        const grupo = await crearGrupo()
        const [entera, , almendra] = grupo.opciones
        const res = await admin.put(`${GRUPOS}/${grupo.id}`).send({
            opciones: [
                { id: entera.id, nombre: 'Entera' },
                { id: almendra.id, nombre: 'Almendra', precioExtra: 2500, disponible: false },
                { nombre: 'Avena', precioExtra: 2000 },
            ],
        })
        expect(res.status, JSON.stringify(res.body)).toBe(200)
        expect(res.body.opciones.map((o) => [o.nombre, o.precioExtra, o.disponible])).toEqual([
            ['Entera', 0, true], ['Almendra', 2500, false], ['Avena', 2000, true],
        ])
        expect(res.body.opciones[0].id).toBe(entera.id)
        expect(res.body.opciones[1].id).toBe(almendra.id)

        const ajeno = await admin.put(`${GRUPOS}/${grupo.id}`).send({ opciones: [{ id: idFalso(), nombre: 'Entera' }] })
        expect(ajeno.status).toBe(400)
        expect(ajeno.body.error.code).toBe('OPCION_NO_VALIDA')
    })

    it('editar una opción existente sin recargo ni disponibilidad conserva los que tenía', async () => {
        const grupo = await crearGrupo()
        const almendra = grupo.opciones[2]
        await admin.put(`${GRUPOS}/${grupo.id}`).send({ opciones: grupo.opciones.map((o) => (o.id === almendra.id ? { ...o, disponible: false } : o)) })
        const res = await admin.put(`${GRUPOS}/${grupo.id}`).send({
            opciones: grupo.opciones.map((o) => (o.id === almendra.id ? { id: o.id, nombre: 'Leche de almendra' } : { id: o.id, nombre: o.nombre })),
        })
        expect(res.status).toBe(200)
        expect(res.body.opciones[2]).toEqual({ id: almendra.id, nombre: 'Leche de almendra', precioExtra: 2000, disponible: false })
    })

    it('un id de opción repetido → 400 OPCION_NO_VALIDA (el id debe seguir siendo único)', async () => {
        const grupo = await crearGrupo()
        const [entera] = grupo.opciones
        const res = await admin.put(`${GRUPOS}/${grupo.id}`).send({ opciones: [{ id: entera.id, nombre: 'A' }, { id: entera.id, nombre: 'B' }] })
        expect(res.status).toBe(400)
        expect(res.body.error.code).toBe('OPCION_NO_VALIDA')
    })

    it('las reglas se comprueban sobre el grupo resultante al editar parcialmente', async () => {
        const grupo = await crearGrupo()
        const res = await admin.put(`${GRUPOS}/${grupo.id}`).send({ max: 5 })
        expect(res.status).toBe(400)
        expect(res.body.error.details.map((d) => d.campo)).toContain('max')
        const obligatorio = await admin.put(`${GRUPOS}/${grupo.id}`).send({ obligatorio: true, min: 1 })
        expect(obligatorio.status).toBe(200)
        expect(obligatorio.body).toMatchObject({ obligatorio: true, min: 1, max: 1 })
    })

    it('marcar una opción como agotada no invalida el grupo (max cuenta todas las opciones)', async () => {
        const grupo = await crearGrupo({ max: 3 })
        const opciones = grupo.opciones.map((o) => ({ ...o, disponible: false }))
        const res = await admin.put(`${GRUPOS}/${grupo.id}`).send({ opciones })
        expect(res.status).toBe(200)
        expect(res.body.max).toBe(3)
    })

    it('un grupo en uso no se borra (409 GRUPO_EN_USO) pero sí se desactiva; sin uso se borra', async () => {
        const grupo = await crearGrupo()
        await Producto.create({ codigo: 1, nombre: 'Latte', precio: 9000, categoria: categoria._id, gruposModificadores: [grupo.id] })
        const borrar = await admin.delete(`${GRUPOS}/${grupo.id}`)
        expect(borrar.status).toBe(409)
        expect(borrar.body.error.code).toBe('GRUPO_EN_USO')
        expect(borrar.body.error.message).toMatch(/1 producto/)

        const desactivar = await admin.put(`${GRUPOS}/${grupo.id}`).send({ activo: false })
        expect(desactivar.status).toBe(200)
        expect(desactivar.body.activo).toBe(false)

        await Producto.deleteMany({})
        expect((await admin.delete(`${GRUPOS}/${grupo.id}`)).status).toBe(200)
        expect(await GrupoModificadores.exists({ _id: grupo.id })).toBeNull()
    })

    it('la marca de ejemplo no se asigna desde la API', async () => {
        const grupo = await crearGrupo({ ejemplo: true })
        expect(grupo.ejemplo).toBe(false)
    })

    it('dos ediciones sobre la misma versión: la segunda no pisa la primera (concurrencia optimista)', async () => {
        const grupo = await crearGrupo()
        const { actualizarGrupo } = await import('../src/modulos/catalogo/modificadores.service.js')
        const leido = await GrupoModificadores.findById(grupo.id)
        await actualizarGrupo(grupo.id, { nombre: 'Leche vegetal' })
        leido.set({ nombre: 'Leches' })
        await expect(leido.save()).rejects.toThrow(/version/i)
        expect((await GrupoModificadores.findById(grupo.id)).nombre).toBe('Leche vegetal')
    })

    it('si el grupo cambia entre la lectura y la escritura del servicio → 409 GRUPO_MODIFICADO', async () => {
        const grupo = await crearGrupo()
        const servicio = await import('../src/modulos/catalogo/modificadores.service.js')
        const original = GrupoModificadores.findById.bind(GrupoModificadores)
        const espia = vi.spyOn(GrupoModificadores, 'findById').mockImplementationOnce(async (id) => {
            const doc = await original(id)
            await GrupoModificadores.updateOne({ _id: id }, { $inc: { __v: 1 }, $set: { nombre: 'Otra edición' } })
            return doc
        })
        await expect(servicio.actualizarGrupo(grupo.id, { nombre: 'Leches' })).rejects.toMatchObject({ status: 409, code: 'GRUPO_MODIFICADO' })
        espia.mockRestore()
        expect((await GrupoModificadores.findById(grupo.id)).nombre).toBe('Otra edición')
    })

    it('id mal formado o inexistente → 404', async () => {
        expect((await admin.put(`${GRUPOS}/abc`).send({ nombre: 'Xyz' })).status).toBe(404)
        expect((await admin.delete(`${GRUPOS}/${idFalso()}`)).status).toBe(404)
    })
})

describe('Grupos asignados a productos', () => {
    it('se asignan por id en orden; se devuelven con nombre; [] los quita', async () => {
        const leche = await crearGrupo()
        const tamano = await crearGrupo({ nombre: 'Tamaño', opciones: [{ nombre: 'Normal' }, { nombre: 'Grande', precioExtra: 3000 }] })
        const creado = await admin.post(PRODUCTOS).send({
            nombre: 'Latte', precio: 9000, categoriaId: String(categoria._id), gruposModificadoresIds: [tamano.id, leche.id],
        })
        expect(creado.status, JSON.stringify(creado.body)).toBe(201)
        expect(creado.body.gruposModificadores).toEqual([
            { id: tamano.id, nombre: 'Tamaño', activo: true },
            { id: leche.id, nombre: 'Leche', activo: true },
        ])
        const quitar = await admin.put(`${PRODUCTOS}/${creado.body.id}`).send({ gruposModificadoresIds: [] })
        expect(quitar.body.gruposModificadores).toEqual([])
    })

    it('un grupo inactivo, inexistente o repetido no se asigna (400)', async () => {
        const leche = await crearGrupo()
        const inactivo = await crearGrupo({ nombre: 'Extras' })
        await admin.put(`${GRUPOS}/${inactivo.id}`).send({ activo: false })
        for (const ids of [[inactivo.id], [idFalso()], [leche.id, leche.id], ['abc']]) {
            const res = await admin.post(PRODUCTOS).send({ nombre: 'Latte', precio: 9000, categoriaId: String(categoria._id), gruposModificadoresIds: ids })
            expect(res.status, JSON.stringify(ids)).toBe(400)
        }
        expect(await Producto.countDocuments()).toBe(0)
    })

    it('un grupo desactivado después de asignarlo sigue asignado (el producto deja de ofrecerlo)', async () => {
        const leche = await crearGrupo()
        const creado = await admin.post(PRODUCTOS).send({
            nombre: 'Latte', precio: 9000, categoriaId: String(categoria._id), gruposModificadoresIds: [leche.id],
        })
        await admin.put(`${GRUPOS}/${leche.id}`).send({ activo: false })
        const lista = await admin.get(PRODUCTOS)
        expect(lista.body.find((p) => p.id === creado.body.id).gruposModificadores).toEqual([{ id: leche.id, nombre: 'Leche', activo: false }])
    })

    it('asignar y borrar a la vez nunca deja un producto con un grupo borrado', async () => {
        for (let i = 0; i < 4; i++) {
            const grupo = await crearGrupo({ nombre: `Grupo ${i}` })
            const [borrar, crear] = await Promise.all([
                admin.delete(`${GRUPOS}/${grupo.id}`),
                admin.post(PRODUCTOS).send({ nombre: `Prod ${i}`, precio: 1000, categoriaId: String(categoria._id), gruposModificadoresIds: [grupo.id] }),
            ])
            const existe = await GrupoModificadores.exists({ _id: grupo.id })
            const usan = await Producto.countDocuments({ gruposModificadores: grupo.id })
            expect(Boolean(existe) || usan === 0, `iteración ${i}`).toBe(true)
            expect([borrar.status, crear.status].sort(), `iteración ${i}`).toEqual(borrar.status === 200 ? [200, 400] : [201, 409])
        }
    })
})
