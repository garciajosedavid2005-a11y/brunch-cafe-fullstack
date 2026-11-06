import { inject, beforeAll, beforeEach, afterAll, afterEach, vi } from 'vitest'
import mongoose from 'mongoose'

// Variables de entorno antes de que cualquier módulo importe src/config.js
process.env.NODE_ENV = 'test'
process.env.MONGO_URI = inject('mongoUri')
process.env.JWT_SECRET = 'secreto-de-pruebas-no-usar-en-produccion'
process.env.CLIENT_URL = 'http://localhost:5173'

// Cada worker usa su propia base de datos para poder correr archivos en paralelo
const dbName = `test_${process.env.VITEST_POOL_ID || process.env.VITEST_WORKER_ID || 0}`

beforeAll(async () => {
    await mongoose.connect(process.env.MONGO_URI, { dbName })
})

// Reloj fijo (solo Date, que avanza con el tiempo real): jueves 2026-11-05 a las 07:30 en Bogotá.
// Las reglas de horario (domicilio el mismo día con 1 h de anticipación) no dependen así de la
// hora a la que se ejecuten las pruebas. Un test puede moverlo con vi.setSystemTime().
export const AHORA_PRUEBAS = new Date('2026-11-05T12:30:00Z')

// Datos base: roles, estados y horarios (los siembra el servidor al arrancar) y métodos de pago (seed:base)
beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: AHORA_PRUEBAS, shouldAdvanceTime: true })
    const { sembrarRoles } = await import('../../src/seeds/base.js')
    const { sembrarEstados } = await import('../../src/seeds/estados.js')
    const { sembrarMetodosPago } = await import('../../src/seeds/metodosPago.js')
    await sembrarRoles()
    await sembrarEstados()
    const { sembrarHorarios } = await import('../../src/modulos/configuracion/horarios.service.js')
    await sembrarHorarios()
    // Lo que deja `npm run seed:base` (las peticiones ya no los crean)
    await sembrarMetodosPago()
})

afterEach(async () => {
    vi.useRealTimers()
    const { limpiarCacheSesiones } = await import('../../src/libs/sesiones.js')
    limpiarCacheSesiones()
    const colecciones = await mongoose.connection.db.collections()
    await Promise.all(colecciones.map((c) => c.deleteMany({})))
})

afterAll(async () => {
    await mongoose.connection.dropDatabase()
    await mongoose.disconnect()
})
