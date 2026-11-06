// Inicia el replica set de un solo nodo (rs0) en el Mongo de MONGO_URI (0.9: transacciones).
// Uso: npm run mongo:replica-set [-- --dry-run]
// Requisito: mongod arrancado con replSetName (Windows: scripts/activar-replica-set-windows.ps1).
// Idempotente: si ya está iniciado no hace nada. No modifica datos.
import mongoose from 'mongoose'
import { config } from '../src/config.js'

const simulacro = process.argv.includes('--dry-run')
const url = new URL(config.MONGO_URI)
const host = url.host // p. ej. 127.0.0.1:27017 (el miembro debe ser alcanzable con este nombre)

// Conexión directa: antes del initiate el nodo todavía no es primario de ningún set
const cliente = new mongoose.mongo.MongoClient(`mongodb://${host}/?directConnection=true`, { serverSelectionTimeoutMS: 5000 })
try {
    await cliente.connect()
    const admin = cliente.db('admin')
    const hola = await admin.command({ hello: 1 })
    if (hola.setName) {
        console.log(`Replica set ya iniciado: ${hola.setName} (primario: ${hola.isWritablePrimary ? 'sí' : 'no'}).`)
    } else {
        const configuracion = { _id: 'rs0', members: [{ _id: 0, host }] }
        console.log(`Se iniciará el replica set: ${JSON.stringify(configuracion)}`)
        if (simulacro) {
            console.log('--dry-run: no se aplicó nada.')
        } else {
            try {
                await admin.command({ replSetInitiate: configuracion })
            } catch (error) {
                if (/replSet|replication/i.test(error.message)) {
                    throw new Error(`mongod no se arrancó con replSetName (${error.message}). En Windows ejecuta antes scripts/activar-replica-set-windows.ps1 como administrador.`)
                }
                throw error
            }
            for (let i = 0; i < 30; i += 1) {
                if ((await admin.command({ hello: 1 })).isWritablePrimary) break
                await new Promise((r) => setTimeout(r, 1000))
            }
            const final = await admin.command({ hello: 1 })
            console.log(`Replica set ${final.setName} iniciado; primario: ${final.isWritablePrimary ? 'sí' : 'todavía no'}.`)
        }
    }
} catch (error) {
    console.error('No se pudo iniciar el replica set:', error.message)
    process.exitCode = 1
} finally {
    await cliente.close()
}
