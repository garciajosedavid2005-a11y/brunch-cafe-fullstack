import { MongoMemoryReplSet } from 'mongodb-memory-server'

// Un único replica set en memoria para toda la suite (permite transacciones).
// La primera ejecución descarga el binario de mongod (~100 MB) y queda en caché.
let replSet

export async function setup({ provide }) {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } })
    provide('mongoUri', replSet.getUri())
}

export async function teardown() {
    await replSet?.stop()
}
