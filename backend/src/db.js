import mongoose from 'mongoose'
import { config } from './config.js'
import { logger } from './libs/logger.js'

export const connectDB = async () => {
  try {
    await mongoose.connect(config.MONGO_URI)
    logger.info('Conectado a MongoDB')
  } catch (error) {
    logger.fatal({ err: error }, 'Error al conectar a MongoDB')
    process.exit(1)
  }
}
