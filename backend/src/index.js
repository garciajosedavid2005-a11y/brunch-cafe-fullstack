import { config } from './config.js'
import { connectDB } from './db.js'
import { createApp } from './app.js'
import { logger } from './libs/logger.js'

const start = async () => {
    await connectDB()
    const app = createApp()
    app.listen(config.PORT, () => {
        logger.info(`Servidor corriendo en http://localhost:${config.PORT}`)
    })
}

process.on('unhandledRejection', (reason) => {
    logger.error({ err: reason }, 'Promesa rechazada sin manejar')
})

start()
