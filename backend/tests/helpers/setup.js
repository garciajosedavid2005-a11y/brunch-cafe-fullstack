import { inject, beforeAll, beforeEach, afterAll, afterEach } from 'vitest'
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

// Datos base que el servidor siembra al arrancar (roles)
beforeEach(async () => {
    const { sembrarRoles } = await import('../../src/seeds/base.js')
    await sembrarRoles()
})

afterEach(async () => {
    const colecciones = await mongoose.connection.db.collections()
    await Promise.all(colecciones.map((c) => c.deleteMany({})))
})

afterAll(async () => {
    await mongoose.connection.dropDatabase()
    await mongoose.disconnect()
})
