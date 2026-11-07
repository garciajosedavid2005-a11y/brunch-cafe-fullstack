import { describe, it, expect, afterEach } from 'vitest'
import mongoose from 'mongoose'
import Usuario from '../src/modulos/identidad/usuario.model.js'
import Categoria from '../src/modulos/catalogo/categoria.model.js'
import GrupoModificadores from '../src/modulos/catalogo/grupoModificadores.model.js'
import Zona from '../src/modulos/salon/zona.model.js'
import Pedido from '../src/modulos/pedidos/pedido.model.js'
import Reserva from '../src/modulos/salon/reserva.model.js'
import { BD_CAPTURAS, uriDeCapturas, exigirBdCapturas, prepararBdCapturas, sembrarDatosCapturas } from '../src/seeds/capturas.js'

// 1.3b · `npm run capturas` usa su propia BD (brunch-cafe-capturas), preparada desde cero con los
// seeds y sin datos personales. Nunca toca la BD de trabajo.
const CLAVE = 'clave-de-prueba-123'

describe('URI de la BD de capturas', () => {
    it.each([
        ['mongodb://localhost:27017/brunch-cafe', 'mongodb://localhost:27017/brunch-cafe-capturas'],
        ['mongodb://127.0.0.1:27017/brunch-cafe?replicaSet=rs0&directConnection=true', 'mongodb://127.0.0.1:27017/brunch-cafe-capturas?replicaSet=rs0&directConnection=true'],
        ['mongodb://localhost:27018', 'mongodb://localhost:27018/brunch-cafe-capturas'],
        ['mongodb://localhost:27018/?replicaSet=rs0', 'mongodb://localhost:27018/brunch-cafe-capturas?replicaSet=rs0'],
        ['mongodb+srv://u:p@cluster.x.mongodb.net/cafe?retryWrites=true', 'mongodb+srv://u:p@cluster.x.mongodb.net/brunch-cafe-capturas?retryWrites=true'],
    ])('%s → %s', (entrada, salida) => {
        expect(uriDeCapturas(entrada)).toBe(salida)
    })

    it('solo acepta la BD de capturas', () => {
        expect(() => exigirBdCapturas(BD_CAPTURAS)).not.toThrow()
        for (const nombre of ['brunch-cafe', 'test_0', 'capturas', '']) expect(() => exigirBdCapturas(nombre)).toThrow(/capturas/)
    })
})

describe('Preparar la BD de capturas', () => {
    const adminAntes = process.env.ADMIN_EMAIL
    afterEach(() => {
        if (adminAntes === undefined) delete process.env.ADMIN_EMAIL
        else process.env.ADMIN_EMAIL = adminAntes
    })

    it('se niega a vaciar una BD que no es la de capturas (no borra nada)', async () => {
        await Usuario.collection.insertOne({ correo: 'persona@real.co' })
        await expect(prepararBdCapturas({ password: CLAVE })).rejects.toThrow(/capturas/)
        expect(await Usuario.countDocuments({ correo: 'persona@real.co' })).toBe(1)
        expect(mongoose.connection.db.databaseName).not.toBe(BD_CAPTURAS)
    })

    it('siembra catálogo con estaciones, modificadores, salón y los usuarios *.dev, sin el admin real del .env', async () => {
        process.env.ADMIN_EMAIL = 'admin.real@empresa.co'
        process.env.ADMIN_PASSWORD = 'contraseña-real-123'
        process.env.ADMIN_NOMBRE = 'Admin Real'
        const r = await sembrarDatosCapturas({ password: CLAVE })
        delete process.env.ADMIN_PASSWORD
        delete process.env.ADMIN_NOMBRE

        const correos = (await Usuario.find().lean()).map((u) => u.correo).sort()
        expect(correos).toEqual(['admin.dev@brunchcafe.test', 'cliente.dev@brunchcafe.test', 'mesero.dev@brunchcafe.test'])
        expect(await Categoria.countDocuments({ estacion: { $type: 'objectId' } })).toBe(await Categoria.countDocuments())
        expect(await Categoria.countDocuments()).toBeGreaterThan(0)
        expect(await GrupoModificadores.countDocuments()).toBe(4)
        expect(await Zona.countDocuments()).toBe(2)
        // Un pedido y una reserva del cliente de prueba (las vistas de detalle los necesitan)
        expect(await Pedido.countDocuments()).toBe(1)
        expect(await Reserva.countDocuments()).toBe(1)
        expect(r.usuarios).toBe(3)
    })

    it('sin contraseña de prueba siembra solo los datos públicos (sin usuarios)', async () => {
        await sembrarDatosCapturas({ password: '' })
        expect(await Usuario.countDocuments()).toBe(0)
        expect(await Categoria.countDocuments()).toBeGreaterThan(0)
    })
})
