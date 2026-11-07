import { config } from './config.js'
import { connectDB, exigirReplicaSet, ReplicaSetRequeridoError } from './db.js'
import { createApp } from './app.js'
import { logger } from './modulos/compartido/logger.js'
import { sembrarRoles } from './seeds/base.js'
import { sembrarEstados, MigracionPendienteError } from './seeds/estados.js'
import { sembrarHorarios } from './modulos/configuracion/horarios.service.js'
import Cuenta from './modulos/salon/cuenta.model.js'
import Comanda from './modulos/salon/comanda.model.js'

const start = async () => {
    await connectDB()
    // Pedidos, cambios de estado y usuarios usan transacciones (0.9): sin replica set no se arranca
    try {
        await exigirReplicaSet()
    } catch (error) {
        if (error instanceof ReplicaSetRequeridoError) {
            logger.fatal(error.message)
            process.exit(1)
        }
        throw error
    }
    // Roles base idempotentes (el primer admin se crea con `npm run seed:base`)
    await sembrarRoles()
    try {
        await sembrarEstados()
    } catch (error) {
        if (error instanceof MigracionPendienteError) {
            logger.fatal(error.message)
            process.exit(1)
        }
        throw error
    }
    // Horarios por defecto si la BD no los tiene (no pisa los editados en el admin)
    await sembrarHorarios()
    // 1.4 · Índices únicos de cuentas y rondas (una mesa en una sola cuenta abierta, un borrador por
    // cuenta) listos antes de atender: crean las colecciones si aún no existen
    try {
        await Promise.all([Cuenta.init(), Comanda.init()])
    } catch (error) {
        logger.fatal({ err: error }, 'No se pudieron crear los índices de cuentas y comandas (¿datos duplicados?). Revisa con npm run verificar:salon.')
        process.exit(1)
    }
    const app = createApp()
    app.listen(config.PORT, () => {
        logger.info(`Servidor corriendo en http://localhost:${config.PORT}`)
    })
}

process.on('unhandledRejection', (reason) => {
    logger.error({ err: reason }, 'Promesa rechazada sin manejar')
})

start()
