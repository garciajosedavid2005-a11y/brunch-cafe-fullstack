// 3.5 · npm run seed:demo: datos de demostración sobre el salón de ejemplo, idempotente, sin borrar
// nada y nunca en producción. Todo pasa por los servicios de la API (el verificador del salón lo valida).
import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import Usuario from '../src/modulos/identidad/usuario.model.js'
import Rol from '../src/modulos/identidad/rol.model.js'
import Producto from '../src/modulos/catalogo/producto.model.js'
import Zona from '../src/modulos/salon/zona.model.js'
import Mesa from '../src/modulos/salon/mesa.model.js'
import Cuenta from '../src/modulos/salon/cuenta.model.js'
import Comanda from '../src/modulos/salon/comanda.model.js'
import Comprobante from '../src/modulos/caja/comprobante.model.js'
import Reserva from '../src/modulos/salon/reserva.model.js'
import Pedido from '../src/modulos/pedidos/pedido.model.js'
import Evento from '../src/modulos/compartido/evento.model.js'
import Estado from '../src/modulos/compartido/estado.model.js'
import Contador from '../src/modulos/compartido/contador.model.js'
import Espera from '../src/modulos/salon/espera.model.js'
import Insumo from '../src/modulos/inventario/insumo.model.js'
import TurnoCaja from '../src/modulos/caja/turno.model.js'
import { fechaLocal } from '../src/modulos/compartido/fechas.js'
import { verificarConsistenciaSalon } from '../src/modulos/salon/consistencia.js'
import { exigirEntornoDemo, sembrarDemo } from '../src/seeds/demo.js'

const CLAVE = 'clave-de-prueba-123'

beforeEach(async () => {
    await Promise.all([Cuenta.createIndexes(), Comanda.createIndexes(), Mesa.createIndexes(), Comprobante.createIndexes()])
})

const mesaN = async (numero) => Mesa.findOne({ numero }).lean()
const conteos = async () => Object.fromEntries(await Promise.all(
    Object.entries({ Usuario, Producto, Mesa, Cuenta, Comanda, Comprobante, Reserva, Pedido, Evento, Insumo, Espera, TurnoCaja })
        .map(async ([nombre, Modelo]) => [nombre, await Modelo.countDocuments()]),
))

describe('seed:demo (3.5)', () => {
    it('deja las mesas en todos los estados, ítems de cocina en cada estado, un agotado, una reserva, un domicilio confirmado y 2 comprobantes', { timeout: 60_000 }, async () => {
        const r = await sembrarDemo({ password: CLAVE })
        expect(r).toMatchObject({ salon: 'creado', comprobantes: 2, agotado: 'creado', reserva: 'creada', domicilio: 'creado' })

        const estados = Object.fromEntries(await Promise.all([1, 2, 3, 4, 5, 6, 7].map(async (n) => [n, (await mesaN(n)).estado])))
        expect(estados).toEqual({ 1: 'ocupada', 2: 'libre', 3: 'cuenta_pedida', 4: 'libre', 5: 'ocupada', 6: 'ocupada', 7: 'por_limpiar' })
        // 5 + 6 unidas: una sola cuenta con las dos mesas
        const [cinco, seis] = [await mesaN(5), await mesaN(6)]
        expect(String(cinco.cuentaActual)).toBe(String(seis.cuentaActual))
        expect((await Cuenta.findById(seis.cuentaActual).lean()).mesas.map((m) => m.numero).sort()).toEqual([5, 6])

        // Mesa 1: dos rondas y un ítem en cada estado de cocina
        const uno = await mesaN(1)
        const items = (await Comanda.find({ cuenta: uno.cuentaActual }).lean()).flatMap((c) => c.items.map((i) => i.estado))
        expect(items.sort()).toEqual(['en_preparacion', 'enviado', 'listo', 'servido'])

        // Caja: dos comprobantes del día (tarjeta; efectivo con propina y cambio)
        const comprobantes = await Comprobante.find().sort({ numero: 1 }).lean()
        expect(comprobantes.map((c) => c.codigo)).toEqual(['CI-000001', 'CI-000002'])
        expect(comprobantes[0].pagos.map((p) => p.metodo)).toEqual(['tarjeta'])
        expect(comprobantes[1]).toMatchObject({ mesas: [7] })
        expect(comprobantes[1].propina).toBeGreaterThan(0)
        expect(comprobantes[1].cambio).toBeGreaterThan(0)

        expect(await Producto.countDocuments({ disponible: false })).toBe(1)
        const pendiente = await Estado.findOne({ tipo: 'reserva', codigo: 'pendiente' }).lean()
        expect(await Reserva.countDocuments({ estado: pendiente._id })).toBe(1)
        const confirmado = await Estado.findOne({ tipo: 'pedido', codigo: 'confirmado' }).lean()
        expect(await Pedido.countDocuments({ estado: confirmado._id })).toBe(1)

        // Coherente con las reglas del salón (cuentas, mesas, comandas y Eventos)
        expect(await verificarConsistenciaSalon()).toMatchObject({ ok: true })
        // Sin el admin real: solo los usuarios *.dev
        expect((await Usuario.find().lean()).every((u) => u.correo.endsWith('@brunchcafe.test'))).toBe(true)
    })

    it('es idempotente: la segunda vez no crea ni cambia nada y dice que el salón ya tiene actividad', { timeout: 60_000 }, async () => {
        await sembrarDemo({ password: CLAVE })
        const foto = async () => ({
            conteos: await conteos(),
            mesas: (await Mesa.find().sort({ numero: 1 }).lean()).map((m) => [m.numero, m.estado, String(m.cuentaActual)]),
            cuentas: (await Cuenta.find().sort({ _id: 1 }).lean()).map((c) => [c.estado, c.version]),
            agotados: (await Producto.find({ disponible: false }).lean()).map((x) => x.nombre),
            // Cierre · Lo nuevo tampoco cambia: existencias, cliente.dev, reserva de hoy y repartidor
            insumos: (await Insumo.find().sort({ nombre: 1 }).lean()).map((i) => [i.nombre, i.existencia]),
            cliente: await Usuario.findOne({ correo: 'cliente.dev@brunchcafe.test' }).select('puntos fechaNacimiento alergias -_id').lean(),
            reservas: (await Reserva.find().sort({ _id: 1 }).lean()).map((x) => [String(x.mesa), x.hora]),
            repartidores: (await Pedido.find().sort({ _id: 1 }).lean()).map((x) => String(x.repartidor)),
        })
        const antes = await foto()
        const r = await sembrarDemo({ password: CLAVE })
        expect(r).toMatchObject({ salon: 'con-actividad', agotado: 'existente', reserva: 'existente', domicilio: 'existente' })
        expect(await foto()).toEqual(antes)
    })

    it('no toca un salón real (sin las mesas de ejemplo) ni borra nada', { timeout: 60_000 }, async () => {
        const zona = await Zona.create({ nombre: 'Salón real' })
        await Mesa.create([{ numero: 10, zona: zona._id, capacidad: 4 }, { numero: 11, zona: zona._id, capacidad: 2 }])
        const antes = await conteos()
        const r = await sembrarDemo({ password: CLAVE })
        expect(r).toEqual({ salon: 'sin-salon-ejemplo' })
        expect((await Mesa.find().sort({ numero: 1 }).lean()).map((m) => [m.numero, m.estado])).toEqual([[10, 'libre'], [11, 'libre']])
        // Nada más: ni el catálogo (agotado, menú), ni reservas, pedidos, usuarios o Eventos
        expect(await conteos()).toEqual(antes)
        expect(await Producto.countDocuments({ disponible: false })).toBe(0)
    })

    it('nunca en producción: la función se niega y el script lo comprueba antes de conectarse', () => {
        expect(() => exigirEntornoDemo({ NODE_ENV: 'production' })).toThrow(/producción/)
        expect(() => exigirEntornoDemo({ NODE_ENV: 'development' })).not.toThrow()
        const script = readFileSync(join(import.meta.dirname, '..', 'scripts', 'seed-demo.js'), 'utf8')
        expect(script.indexOf('exigirEntornoDemo(')).toBeGreaterThan(-1)
        expect(script.indexOf('exigirEntornoDemo(')).toBeLessThan(script.indexOf('mongoose.connect('))
    })
})

describe('seed:demo · datos de las Fases 3b a 6 (cierre)', () => {
    it('turno abierto, reserva de hoy con mesa, espera, insumo bajo, domicilio con repartidor, para llevar y cliente con puntos y cumpleaños', { timeout: 90_000 }, async () => {
        const r = await sembrarDemo({ password: CLAVE })
        expect(r).toMatchObject({ salon: 'creado', reservaHoy: 'creada', espera: 'creada', repartidor: 'asignado', paraLlevar: 'creada', cliente: 'preparado' })
        expect(r.insumosBajos).toBeGreaterThanOrEqual(1)

        expect(await TurnoCaja.countDocuments({ estado: 'abierto' })).toBe(1)
        // Reserva de hoy (Bogotá) confirmada y con la mesa 4, que sigue libre
        const confirmada = await Estado.findOne({ tipo: 'reserva', codigo: 'confirmada' }).lean()
        const hoy = await Reserva.findOne({ estado: confirmada._id, mesa: { $ne: null } }).lean()
        expect(fechaLocal(hoy.inicio)).toBe(fechaLocal())
        expect(String(hoy.mesa)).toBe(String((await mesaN(4))._id))
        expect((await mesaN(4)).estado).toBe('libre')
        expect(await Espera.countDocuments({ estado: 'esperando', dia: fechaLocal() })).toBe(1)
        // Inventario de ejemplo con al menos un insumo bajo el mínimo
        expect(await Insumo.countDocuments({ $expr: { $lte: ['$existencia', '$minimo'] } })).toBeGreaterThanOrEqual(1)
        // Domicilio confirmado y asignado al repartidor de prueba
        const repartidor = await Usuario.findOne({ correo: 'repartidor.dev@brunchcafe.test' }).lean()
        expect(await Pedido.countDocuments({ repartidor: repartidor._id })).toBe(1)
        // Cuenta para llevar con su ronda en cocina
        const llevar = await Cuenta.findOne({ canal: 'para_llevar', estado: 'abierta' }).lean()
        expect(llevar.paraLlevar.nombre).toBe('Laura')
        expect((await Comanda.findOne({ cuenta: llevar._id }).lean()).enviadaEn).toBeTruthy()
        // Cliente con puntos para canjear y cumpleaños este mes, identificado en la mesa 3 (cuenta pedida)
        const cliente = await Usuario.findOne({ correo: 'cliente.dev@brunchcafe.test' }).lean()
        expect(cliente.puntos).toBeGreaterThanOrEqual(200)
        expect(cliente.fechaNacimiento.toISOString().slice(5, 7)).toBe(fechaLocal().slice(5, 7))
        expect(cliente.alergias).toBeTruthy()
        const tres = await Cuenta.findById((await mesaN(3)).cuentaActual).lean()
        expect(String(tres.cliente.usuario)).toBe(String(cliente._id))
        expect(await verificarConsistenciaSalon()).toMatchObject({ ok: true })

        // La segunda vez no repite nada
        const r2 = await sembrarDemo({ password: CLAVE })
        expect(r2).toMatchObject({ reservaHoy: 'existente', espera: 'existente', repartidor: 'existente', paraLlevar: 'existente', cliente: 'existente' })
        expect(await Espera.countDocuments()).toBe(1)
        expect(await Cuenta.countDocuments({ canal: 'para_llevar' })).toBe(1)
    })

    it('repetido horas después, crea otra reserva de hoy que todavía se puede sentar; un domicilio ya entregado no aborta la demo', { timeout: 90_000 }, async () => {
        await sembrarDemo({ password: CLAVE })
        // La reserva de hoy ya pasó (su bloque de 90 min terminó) y el domicilio salió sin repartidor
        const hace3h = new Date(Date.now() - 3 * 3_600_000)
        await Reserva.updateOne({ motivo: 'Demostración de hoy (seed:demo)' }, { $set: { inicio: hace3h } })
        const entregado = await Estado.findOne({ tipo: 'pedido', codigo: 'entregado' }).lean()
        await Pedido.updateMany({}, { $set: { estado: entregado._id }, $unset: { repartidor: 1 } })
        const r = await sembrarDemo({ password: CLAVE })
        expect(r).toMatchObject({ reservaHoy: 'creada', repartidor: 'no-asignable' })
        const vigentes = await Reserva.find({ motivo: 'Demostración de hoy (seed:demo)', inicio: { $gt: new Date(Date.now() - 90 * 60_000) } }).lean()
        expect(vigentes).toHaveLength(1)
        expect(vigentes[0].mesa).toBeTruthy()
    })
})

describe('seed:demo · protecciones antes de escribir (3.5)', () => {
    it('con personas reales en la BD no escribe nada sin --confirmar; con él, prepara la demo', { timeout: 60_000 }, async () => {
        const rol = await Rol.findOne({ nombre: 'cliente' })
        await Usuario.create({ nombre: 'Ana', apellido: 'Real', correo: 'ana@cafe.co', contraseña: 'x'.repeat(60), telefono: '3001112233', rol: rol._id })
        const antes = await conteos()
        expect(await sembrarDemo({ password: CLAVE })).toEqual({ salon: 'requiere-confirmacion' })
        expect(await conteos()).toEqual(antes)
        expect(await sembrarDemo({ password: CLAVE, confirmado: true })).toMatchObject({ salon: 'creado' })
    })

    it('una demo cortada a mitad no se repite encima (no vuelve a cobrar ni gasta consecutivos)', { timeout: 60_000 }, async () => {
        await sembrarDemo({ password: CLAVE })
        // Simula el corte: la marca quedó en «empezada»
        await Contador.updateOne({ _id: 'seed-demo' }, { $set: { seq: 1 } })
        const antes = await conteos()
        expect(await sembrarDemo({ password: CLAVE })).toEqual({ salon: 'incompleta' })
        expect(await conteos()).toEqual(antes)
    })

    it('nunca crea el admin real aunque el entorno tenga ADMIN_*', { timeout: 60_000 }, async () => {
        const previo = { ...process.env }
        Object.assign(process.env, { ADMIN_EMAIL: 'admin.real@cafe.co', ADMIN_PASSWORD: 'una-clave-larga-123', ADMIN_NOMBRE: 'Admin Real' })
        try {
            await sembrarDemo({ password: CLAVE })
            expect(await Usuario.exists({ correo: 'admin.real@cafe.co' })).toBeNull()
        } finally {
            for (const k of ['ADMIN_EMAIL', 'ADMIN_PASSWORD', 'ADMIN_NOMBRE']) {
                if (previo[k] === undefined) delete process.env[k]
                else process.env[k] = previo[k]
            }
        }
    })
})
