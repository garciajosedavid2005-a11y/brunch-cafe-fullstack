import { config } from './config.js'
import { connectDB } from './db.js'
import { createApp } from './app.js'
import { logger } from './libs/logger.js'
import { sembrarRoles } from './seeds/base.js'
import { sembrarEstados, MigracionPendienteError } from './seeds/estados.js'

const start = async () => {
    await connectDB()
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
    const app = createApp()
    app.listen(config.PORT, () => {
        logger.info(`Servidor corriendo en http://localhost:${config.PORT}`)
    })
}

process.on('unhandledRejection', (reason) => {
    logger.error({ err: reason }, 'Promesa rechazada sin manejar')
})

start()
