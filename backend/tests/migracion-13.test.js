import { describe, it, expect, beforeEach, vi } from 'vitest'
import mongoose from 'mongoose'
import { up, down, MARCA } from '../src/migraciones/m13-estaciones.js'

// 1.3 · Migración: estación por defecto en las categorías existentes (bebidas → Barra, el resto →
// Cocina) y Cocina/Barra si faltan. Reversible: down solo deshace lo que marcó up.
const db = () => mongoose.connection.db
const categorias = () => db().collection('categorias')
const estaciones = () => db().collection('estaciones')
const porNombre = (lista) => Object.fromEntries(lista.map((x) => [x.nombre ?? x.codigo, x]))
const codigoDe = async (nombre) => {
    const cat = await categorias().findOne({ nombre })
    if (!cat.estacion) return null
    return (await estaciones().findOne({ _id: cat.estacion }))?.codigo ?? 'borrada'
}

// BD anterior a 1.3: categorías sin estación (insertadas sin Mongoose) y, según el caso, sin estaciones
beforeEach(async () => {
    await categorias().insertMany([
        { nombre: 'Desayunos' }, { nombre: 'Bebidas' }, { nombre: 'Bebidas calientes' }, { nombre: 'Postres', estacion: null },
    ])
})

describe('Migración 1.3 (estaciones en categorías existentes)', () => {
    it('--dry-run informa sin escribir (también si faltan las estaciones)', async () => {
        await estaciones().deleteMany({})
        const r = await up(db(), { dryRun: true })
        const porCodigo = Object.fromEntries(r.estaciones.map((e) => [e.codigo, e]))
        expect(porCodigo).toMatchObject({ cocina: { accion: 'crear', aplicado: false }, barra: { accion: 'crear', aplicado: false } })
        expect(porNombre(r.categorias)).toMatchObject({
            Desayunos: { accion: 'asignar', estacion: 'cocina', aplicado: false },
            Bebidas: { accion: 'asignar', estacion: 'barra', aplicado: false },
            'Bebidas calientes': { accion: 'asignar', estacion: 'barra' },
            Postres: { accion: 'asignar', estacion: 'cocina' },
        })
        expect(await estaciones().countDocuments()).toBe(0)
        expect(await categorias().countDocuments({ estacion: { $ne: null } })).toBe(0)
    })

    it('up asigna, es idempotente y down deja las categorías como estaban', async () => {
        const antes = await categorias().find().sort({ nombre: 1 }).toArray()
        const r = await up(db())
        expect(r.categorias.every((c) => c.aplicado)).toBe(true)
        expect(r.estaciones.map((e) => e.accion)).toEqual(['existe', 'existe']) // el setup ya las sembró
        expect(await codigoDe('Bebidas')).toBe('barra')
        expect(await codigoDe('Desayunos')).toBe('cocina')

        const otra = await up(db())
        expect(otra.categorias.every((c) => c.accion === 'ya-tiene' && !c.aplicado)).toBe(true)

        const plan = await down(db(), { dryRun: true })
        expect(plan.categorias.filter((c) => c.accion === 'quitar')).toHaveLength(4)
        expect(await codigoDe('Bebidas')).toBe('barra')

        await down(db())
        const despues = await categorias().find().sort({ nombre: 1 }).toArray()
        expect(despues).toEqual(antes)
        expect(await estaciones().countDocuments()).toBe(2) // no las creó up: no se borran
    })

    it('si faltan las estaciones las crea (marcadas) y down las borra si nadie más las usa', async () => {
        await estaciones().deleteMany({})
        await up(db())
        const creadas = await estaciones().find().sort({ codigo: 1 }).toArray()
        expect(creadas.map((e) => [e.codigo, e.nombre, e.activa, e[MARCA]])).toEqual([['barra', 'Barra', true, true], ['cocina', 'Cocina', true, true]])

        // Un producto que sobrescribe con Barra la mantiene en uso: down no la borra
        await db().collection('productos').insertOne({ nombre: 'Croissant', estacion: creadas[0]._id })
        const r = await down(db())
        expect(porNombre(r.estaciones)).toMatchObject({ barra: { accion: 'en-uso', aplicado: false }, cocina: { accion: 'borrar', aplicado: true } })
        expect((await estaciones().find().toArray()).map((e) => e.codigo)).toEqual(['barra'])
    })

    it('no toca una categoría que ya tiene estación, y down no revierte una que el admin cambió', async () => {
        const cocina = await estaciones().findOne({ codigo: 'cocina' })
        const barra = await estaciones().findOne({ codigo: 'barra' })
        await categorias().updateOne({ nombre: 'Bebidas calientes' }, { $set: { estacion: cocina._id } })
        const r = porNombre((await up(db())).categorias)
        expect(r['Bebidas calientes']).toMatchObject({ accion: 'ya-tiene', aplicado: false })
        expect(await codigoDe('Bebidas calientes')).toBe('cocina')

        await categorias().updateOne({ nombre: 'Postres' }, { $set: { estacion: barra._id } }) // el admin la cambió
        const d = porNombre((await down(db())).categorias)
        expect(d.Postres).toMatchObject({ accion: 'cambiada', aplicado: true }) // solo quitó la marca
        expect(await codigoDe('Postres')).toBe('barra')
        expect((await categorias().findOne({ nombre: 'Postres' }))[MARCA]).toBeUndefined()
        expect(await codigoDe('Desayunos')).toBeNull()
    })

    it('up no escribe si la categoría recibió una estación entre la lectura y la escritura', async () => {
        const coleccion = categorias()
        const cocina = await estaciones().findOne({ codigo: 'cocina' })
        const original = coleccion.updateOne.bind(coleccion)
        const espia = vi.spyOn(Object.getPrototypeOf(coleccion), 'updateOne').mockImplementationOnce(async function (filtro, cambio) {
            await original({ _id: filtro._id }, { $set: { estacion: cocina._id } })
            return original(filtro, cambio)
        })
        const r = await up(db())
        espia.mockRestore()
        const cambiada = r.categorias.find((c) => c.accion === 'cambio-concurrente')
        expect(cambiada).toBeDefined()
        expect((await categorias().findOne({ nombre: cambiada.nombre }))[MARCA]).toBeUndefined()
    })

    it('una estación Cocina o Barra existente pero inactiva no se usa: lo informa y no asigna nada', async () => {
        await estaciones().updateOne({ codigo: 'barra' }, { $set: { activa: false } })
        const r = await up(db())
        expect(r.bloqueo).toMatch(/barra.*inactiva/i)
        expect(r.categorias).toEqual([])
        expect(await categorias().countDocuments({ estacion: { $ne: null } })).toBe(0)
        expect((await up(db(), { dryRun: true })).bloqueo).toMatch(/inactiva/)
    })

    it('si el nombre «Barra» ya lo usa otra estación con otro código, no escribe nada y lo informa (sin E11000)', async () => {
        await estaciones().deleteMany({})
        await estaciones().insertOne({ codigo: 'bar', nombre: 'BARRA', activa: true })
        for (const dryRun of [true, false]) {
            const r = await up(db(), { dryRun })
            expect(r.bloqueo).toMatch(/Barra.*bar/)
            expect(r.categorias).toEqual([])
        }
        expect(await estaciones().countDocuments()).toBe(1)
        expect(await categorias().countDocuments({ estacion: { $ne: null } })).toBe(0)
    })

    it('asegura los índices únicos de estaciones antes de crearlas (dos up a la vez no duplican)', async () => {
        await estaciones().drop()
        await Promise.all([up(db()), up(db())])
        expect(await estaciones().countDocuments()).toBe(2)
        const indices = await estaciones().indexes()
        expect(indices.find((i) => i.key.codigo === 1)?.unique).toBe(true)
        expect(indices.find((i) => i.key.nombre === 1)).toMatchObject({ unique: true, collation: expect.objectContaining({ locale: 'es', strength: 1 }) })
    })

    it('el simulacro avisa de una categoría con una estación que ya no existe', async () => {
        await categorias().updateOne({ nombre: 'Desayunos' }, { $set: { estacion: new mongoose.Types.ObjectId() } })
        const r = porNombre((await up(db(), { dryRun: true })).categorias)
        expect(r.Desayunos).toMatchObject({ accion: 'estacion-inexistente', aplicado: false })
    })

    it('el script rechaza argumentos desconocidos (una errata como --dryrun no aplica la migración)', async () => {
        const { leerArgumentos } = await import('../src/migraciones/argumentos.js')
        expect(leerArgumentos(['--dry-run'])).toEqual({ dryRun: true, reversa: false })
        expect(leerArgumentos(['--down', '--dry-run'])).toEqual({ dryRun: true, reversa: true })
        expect(leerArgumentos([])).toEqual({ dryRun: false, reversa: false })
        for (const malo of [['--dryrun'], ['--Down'], ['--dry-run', 'x']]) expect(() => leerArgumentos(malo)).toThrow(/desconocido/)
    })

    it('reconoce «bebidas» sin mayúsculas ni tildes', async () => {
        await categorias().insertOne({ nombre: 'BEBÍDAS FRÍAS' })
        const r = porNombre((await up(db(), { dryRun: true })).categorias)
        expect(r['BEBÍDAS FRÍAS'].estacion).toBe('barra')
    })
})
