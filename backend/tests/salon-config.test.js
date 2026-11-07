import { describe, it, expect, beforeEach, vi } from 'vitest'
import mongoose from 'mongoose'
import { crearConSesion } from './helpers/usuarios.js'
import { api } from './helpers/app.js'
import Zona from '../src/modulos/salon/zona.model.js'
import Mesa from '../src/modulos/salon/mesa.model.js'

// 1.2 · Zonas y mesas (configuración del salón, permiso salon:configurar). F1-1, F1-2.
const ZONAS = '/api/v1/admin/zonas'
const MESAS = '/api/v1/admin/mesas'
const idFalso = () => String(new mongoose.Types.ObjectId())

let admin
beforeEach(async () => {
    await Promise.all([Zona.init(), Mesa.init()]) // índices únicos listos antes de probar duplicados
    admin = (await crearConSesion('admin')).sesion
})

const crearZona = async (datos = {}) => {
    const res = await admin.post(ZONAS).send({ nombre: 'Interior', orden: 1, ...datos })
    expect(res.status, JSON.stringify(res.body)).toBe(201)
    return res.body
}
const crearMesa = async (zona, datos = {}) => {
    const res = await admin.post(MESAS).send({ numero: 1, zona: zona.id, capacidad: 4, ...datos })
    expect(res.status, JSON.stringify(res.body)).toBe(201)
    return res.body
}
const ocupar = (mesa) => Mesa.updateOne({ _id: mesa.id }, { estado: 'ocupada' })

describe('Permisos de la configuración del salón', () => {
    const rutas = [
        ['get', ZONAS], ['post', ZONAS], ['put', `${ZONAS}/${idFalso()}`], ['delete', `${ZONAS}/${idFalso()}`],
        ['get', MESAS], ['post', MESAS], ['put', `${MESAS}/${idFalso()}`], ['delete', `${MESAS}/${idFalso()}`],
    ]

    it.each(rutas)('%s %s sin sesión → 401', async (metodo, ruta) => {
        expect((await api()[metodo](ruta).send({})).status).toBe(401)
    })

    it.each(rutas)('%s %s como mesero o anfitrión (sin salon:configurar) → 403', async (metodo, ruta) => {
        for (const rol of ['mesero', 'anfitrion']) {
            const { sesion } = await crearConSesion(rol)
            const res = await sesion[metodo](ruta).send({})
            expect(res.status).toBe(403)
            expect(res.body.error.code).toBe('FORBIDDEN')
        }
    })
})

describe('Zonas', () => {
    it('crea y lista por orden, con el número de mesas', async () => {
        const terraza = await crearZona({ nombre: 'Terraza', orden: 2 })
        const interior = await crearZona({ nombre: 'Interior', orden: 1 })
        expect(interior).toMatchObject({ nombre: 'Interior', orden: 1, activa: true, ejemplo: false, mesas: 0 })
        await crearMesa(terraza)

        const res = await admin.get(ZONAS)
        expect(res.status).toBe(200)
        expect(res.body.map((z) => [z.nombre, z.mesas])).toEqual([['Interior', 0], ['Terraza', 1]])
    })

    it('el nombre es único sin importar mayúsculas ni tildes → 409 ZONA_DUPLICADA', async () => {
        await crearZona({ nombre: 'Salón' })
        for (const nombre of ['salon', 'SALÓN']) {
            const res = await admin.post(ZONAS).send({ nombre })
            expect(res.status).toBe(409)
            expect(res.body.error.code).toBe('ZONA_DUPLICADA')
        }
        const otra = await crearZona({ nombre: 'Barra' })
        const renombrar = await admin.put(`${ZONAS}/${otra.id}`).send({ nombre: 'salón' })
        expect(renombrar.status).toBe(409)
    })

    it('dos altas simultáneas con el mismo nombre: una 201 y otra 409 ZONA_DUPLICADA (nunca 500)', async () => {
        const [a, b] = await Promise.all([admin.post(ZONAS).send({ nombre: 'Salón' }), admin.post(ZONAS).send({ nombre: 'salon' })])
        expect([a.status, b.status].sort()).toEqual([201, 409])
        expect([a, b].find((r) => r.status === 409).body.error.code).toBe('ZONA_DUPLICADA')
    })

    it('valida los datos (400 con detalles)', async () => {
        for (const datos of [{}, { nombre: 'A' }, { nombre: 'Patio', orden: -1 }, { nombre: 'Patio', orden: 1.5 }, { nombre: 'x'.repeat(41) }]) {
            const res = await admin.post(ZONAS).send(datos)
            expect(res.status, JSON.stringify(datos)).toBe(400)
            expect(res.body.error.code).toBe('VALIDATION_ERROR')
        }
    })

    it('no se borra una zona con mesas (409 ZONA_CON_MESAS); sin mesas sí', async () => {
        const zona = await crearZona()
        await crearMesa(zona)
        const res = await admin.delete(`${ZONAS}/${zona.id}`)
        expect(res.status).toBe(409)
        expect(res.body.error.code).toBe('ZONA_CON_MESAS')

        const vacia = await crearZona({ nombre: 'Patio' })
        expect((await admin.delete(`${ZONAS}/${vacia.id}`)).status).toBe(200)
        expect(await Zona.exists({ _id: vacia.id })).toBeNull()
    })

    it('se desactiva si sus mesas están libres; con una mesa en uso → 409 ZONA_CON_MESAS_EN_USO', async () => {
        const zona = await crearZona()
        const mesa = await crearMesa(zona)
        await ocupar(mesa)
        const res = await admin.put(`${ZONAS}/${zona.id}`).send({ activa: false })
        expect(res.status).toBe(409)
        expect(res.body.error.code).toBe('ZONA_CON_MESAS_EN_USO')

        await Mesa.updateOne({ _id: mesa.id }, { estado: 'libre' })
        const ok = await admin.put(`${ZONAS}/${zona.id}`).send({ activa: false })
        expect(ok.status).toBe(200)
        expect(ok.body.activa).toBe(false)
    })

    it('id mal formado o inexistente → 404', async () => {
        expect((await admin.put(`${ZONAS}/no-es-id`).send({ nombre: 'Patio' })).status).toBe(404)
        expect((await admin.delete(`${ZONAS}/${idFalso()}`)).status).toBe(404)
    })
})

describe('Mesas', () => {
    it('crea la mesa libre y la lista con su zona; filtra por zona', async () => {
        const interior = await crearZona()
        const terraza = await crearZona({ nombre: 'Terraza', orden: 2 })
        const mesa = await crearMesa(interior, { numero: 3, nombre: 'Ventana', combinable: true, posicion: { x: 10, y: 20 } })
        expect(mesa).toMatchObject({
            numero: 3, nombre: 'Ventana', capacidad: 4, estado: 'libre', combinable: true, activa: true, ejemplo: false,
            posicion: { x: 10, y: 20 }, zona: { id: interior.id, nombre: 'Interior' },
        })
        await crearMesa(terraza, { numero: 1 })

        const todas = await admin.get(MESAS)
        expect(todas.body.map((m) => m.numero)).toEqual([1, 3])
        const soloInterior = await admin.get(`${MESAS}?zona=${interior.id}`)
        expect(soloInterior.body.map((m) => m.numero)).toEqual([3])
        const filtroMalo = await admin.get(`${MESAS}?zona=no-es-id`)
        expect(filtroMalo.status).toBe(400)
        expect(filtroMalo.body.error).toMatchObject({ code: 'VALIDATION_ERROR', details: [{ campo: 'zona' }] })
    })

    it('el número es único → 409 MESA_NUMERO_DUPLICADO (al crear y al editar)', async () => {
        const zona = await crearZona()
        await crearMesa(zona, { numero: 1 })
        const otra = await crearMesa(zona, { numero: 2 })
        const res = await admin.post(MESAS).send({ numero: 1, zona: zona.id, capacidad: 2 })
        expect(res.status).toBe(409)
        expect(res.body.error.code).toBe('MESA_NUMERO_DUPLICADO')
        const editar = await admin.put(`${MESAS}/${otra.id}`).send({ numero: 1 })
        expect(editar.status).toBe(409)
        expect(editar.body.error.code).toBe('MESA_NUMERO_DUPLICADO')
    })

    it('valida número, capacidad, zona y posición', async () => {
        const zona = await crearZona()
        const invalidos = [
            { numero: 0, zona: zona.id, capacidad: 2 },
            { numero: 1.5, zona: zona.id, capacidad: 2 },
            { numero: 1000, zona: zona.id, capacidad: 2 },
            { numero: 1, zona: zona.id, capacidad: 0 },
            { numero: 1, zona: zona.id, capacidad: 21 },
            { numero: 1, zona: 'no-es-id', capacidad: 2 },
            { numero: 1, capacidad: 2 },
            { numero: 1, zona: zona.id, capacidad: 2, posicion: { x: -1, y: 0 } },
        ]
        for (const datos of invalidos) {
            const res = await admin.post(MESAS).send(datos)
            expect(res.status, JSON.stringify(datos)).toBe(400)
            expect(res.body.error.code, JSON.stringify(datos)).toBe('VALIDATION_ERROR')
            expect(res.body.error.details.length).toBeGreaterThan(0)
        }
    })

    it('la zona debe existir y estar activa → 400 ZONA_NO_VALIDA', async () => {
        const zona = await crearZona()
        await admin.put(`${ZONAS}/${zona.id}`).send({ activa: false })
        for (const id of [idFalso(), zona.id]) {
            const res = await admin.post(MESAS).send({ numero: 1, zona: id, capacidad: 2 })
            expect(res.status).toBe(400)
            expect(res.body.error.code).toBe('ZONA_NO_VALIDA')
        }
    })

    it('el estado no se asigna desde la configuración (se ignora; lo cambian las operaciones de 1.5)', async () => {
        const zona = await crearZona()
        const mesa = await crearMesa(zona, { estado: 'bloqueada' })
        expect(mesa.estado).toBe('libre')
        const res = await admin.put(`${MESAS}/${mesa.id}`).send({ estado: 'ocupada', capacidad: 6 })
        expect(res.status).toBe(200)
        expect(res.body).toMatchObject({ estado: 'libre', capacidad: 6 })
    })

    it('una mesa en uso no se borra, no se desactiva, no cambia de zona, número ni «combinable» (409 MESA_EN_USO); sí se edita su capacidad', async () => {
        const zona = await crearZona()
        const otraZona = await crearZona({ nombre: 'Terraza' })
        const mesa = await crearMesa(zona)
        await ocupar(mesa)
        const cambios = [['delete'], ['put', { activa: false }], ['put', { zona: otraZona.id }], ['put', { numero: 50 }], ['put', { combinable: true }]]
        for (const [metodo, datos] of cambios) {
            const res = await admin[metodo](`${MESAS}/${mesa.id}`).send(datos)
            expect(res.status, `${metodo} ${JSON.stringify(datos)}`).toBe(409)
            expect(res.body.error.code).toBe('MESA_EN_USO')
        }
        expect((await admin.put(`${MESAS}/${mesa.id}`).send({ capacidad: 6 })).status).toBe(200)
        expect(await Mesa.findById(mesa.id).lean()).toMatchObject({ estado: 'ocupada', activa: true, capacidad: 6, numero: 1, combinable: false })
        // Enviar el mismo valor que ya tiene no cuenta como cambio
        expect((await admin.put(`${MESAS}/${mesa.id}`).send({ numero: 1, combinable: false, zona: zona.id })).status).toBe(200)
    })

    it('una mesa libre se borra, se desactiva y cambia de zona (a una activa)', async () => {
        const zona = await crearZona()
        const otraZona = await crearZona({ nombre: 'Terraza' })
        const mesa = await crearMesa(zona)
        const mover = await admin.put(`${MESAS}/${mesa.id}`).send({ zona: otraZona.id, activa: false })
        expect(mover.status).toBe(200)
        expect(mover.body).toMatchObject({ activa: false, zona: { id: otraZona.id } })
        await admin.put(`${ZONAS}/${zona.id}`).send({ activa: false })
        const aInactiva = await admin.put(`${MESAS}/${mesa.id}`).send({ zona: zona.id })
        expect(aInactiva.status).toBe(400)
        expect(aInactiva.body.error.code).toBe('ZONA_NO_VALIDA')
        expect((await admin.delete(`${MESAS}/${mesa.id}`)).status).toBe(200)
        expect(await Mesa.exists({ _id: mesa.id })).toBeNull()
    })

    it('si la mesa se borró entre la lectura y la escritura → 404 (no 409)', async () => {
        const zona = await crearZona()
        const mesa = await crearMesa(zona)
        const original = Mesa.deleteOne.bind(Mesa)
        const espia = vi.spyOn(Mesa, 'deleteOne').mockImplementationOnce(async (filtro, ...resto) => {
            await original({ _id: mesa.id })
            return original(filtro, ...resto)
        })
        const res = await admin.delete(`${MESAS}/${mesa.id}`)
        espia.mockRestore()
        expect(res.status).toBe(404)
    })

    it('id mal formado o inexistente → 404', async () => {
        expect((await admin.put(`${MESAS}/no-es-id`).send({ capacidad: 2 })).status).toBe(404)
        expect((await admin.delete(`${MESAS}/${idFalso()}`)).status).toBe(404)
    })

    it('serialización determinista: crear una mesa escribe la zona, así que un borrado de la zona en curso entra en conflicto', async () => {
        const zona = await crearZona()
        const { crearMesa: crearMesaServicio } = await import('../src/modulos/salon/salonConfig.service.js')
        const session = await mongoose.startSession()
        session.startTransaction()
        try {
            // El borrado ve la zona sin mesas (snapshot)…
            expect(await Mesa.countDocuments({ zona: zona.id }).session(session)).toBe(0)
            // …mientras otra transacción crea una mesa en esa zona y confirma
            await crearMesaServicio({ numero: 77, zona: zona.id, capacidad: 2 })
            // Al intentar borrar la zona, Mongo detecta el conflicto de escritura
            await expect(Zona.deleteOne({ _id: zona.id }, { session })).rejects.toThrow(/WriteConflict|Write conflict/i)
        } finally {
            await session.abortTransaction().catch(() => {})
            await session.endSession()
        }
        expect(await Zona.exists({ _id: zona.id })).not.toBeNull()
    })

    it('crear una mesa y borrar su zona a la vez nunca deja una mesa sin zona', async () => {
        for (let i = 0; i < 5; i++) {
            const zona = await crearZona({ nombre: `Zona ${i}` })
            const [borrar, crear] = await Promise.all([
                admin.delete(`${ZONAS}/${zona.id}`),
                admin.post(MESAS).send({ numero: 100 + i, zona: zona.id, capacidad: 2 }),
            ])
            const zonaExiste = await Zona.exists({ _id: zona.id })
            const mesas = await Mesa.countDocuments({ zona: zona.id })
            expect(Boolean(zonaExiste) || mesas === 0, `iteración ${i}`).toBe(true)
            // Exactamente una de las dos gana: la otra recibe 409 (zona con mesas) o 400 (zona no válida)
            expect([borrar.status, crear.status].sort(), `iteración ${i}`).toEqual(borrar.status === 200 ? [200, 400] : [201, 409])
        }
    })
})

describe('Seed de ejemplo del salón (F1-1)', () => {
    it('crea Interior y Terraza con mesas de 2 y 4 marcadas como ejemplo, una sola vez', async () => {
        const { sembrarSalonEjemplo } = await import('../src/seeds/salon.js')
        const primera = await sembrarSalonEjemplo()
        expect(primera).toMatchObject({ creado: true })
        const zonas = await Zona.find().sort({ orden: 1 }).lean()
        expect(zonas.map((z) => z.nombre)).toEqual(['Interior', 'Terraza'])
        const mesas = await Mesa.find().lean()
        expect(mesas.length).toBeGreaterThanOrEqual(4)
        expect(new Set(mesas.map((m) => m.capacidad))).toEqual(new Set([2, 4]))
        expect([...zonas, ...mesas].every((d) => d.ejemplo === true)).toBe(true)
        expect(mesas.every((m) => m.estado === 'libre')).toBe(true)

        expect(await sembrarSalonEjemplo()).toMatchObject({ creado: false })
        expect(await Mesa.countDocuments()).toBe(mesas.length)
    })

    it('dos seeds a la vez: uno siembra y el otro informa que no hizo nada (sin error)', async () => {
        const { sembrarSalonEjemplo } = await import('../src/seeds/salon.js')
        const resultados = await Promise.all([sembrarSalonEjemplo(), sembrarSalonEjemplo()])
        expect(resultados.map((r) => r.creado).sort()).toEqual([false, true])
        expect(await Zona.countDocuments()).toBe(2)
    })

    it('si el admin ya creó zonas, no siembra nada', async () => {
        await crearZona({ nombre: 'Patio' })
        const { sembrarSalonEjemplo } = await import('../src/seeds/salon.js')
        expect(await sembrarSalonEjemplo()).toMatchObject({ creado: false })
        expect(await Zona.countDocuments()).toBe(1)
    })
})
