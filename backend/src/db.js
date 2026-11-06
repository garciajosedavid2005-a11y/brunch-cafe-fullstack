import mongoose from 'mongoose'
import { config } from './config.js'
import { logger } from './modulos/compartido/logger.js'

export const connectDB = async () => {
  try {
    await mongoose.connect(config.MONGO_URI)
    logger.info('Conectado a MongoDB')
  } catch (error) {
    if (error.code === 'ECONNREFUSED' && error.syscall === 'querySrv') {
      logger.fatal(
        { err: error },
        'No se pudo consultar el registro DNS SRV de MongoDB. En Windows, usa una URI mongodb:// de Atlas o permite consultas DNS por el puerto 53; el error ocurre antes de autenticar.',
      )
    } else {
      logger.fatal({ err: error }, 'Error al conectar a MongoDB')
    }
    process.exit(1)
  }
}

export class ReplicaSetRequeridoError extends Error {
  constructor() {
    super(
      'MongoDB no está en modo replica set y las transacciones lo requieren (0.9). '
      + 'Mongo local de Windows: ejecuta como administrador backend/scripts/activar-replica-set-windows.ps1 '
      + 'y luego `npm run mongo:replica-set`. Docker: `docker compose up -d mongo`. Detalles en el README.',
    )
    this.name = 'ReplicaSetRequeridoError'
  }
}

/** Falla si la conexión no es a un replica set (o mongos): sin él no hay transacciones. */
export const exigirReplicaSet = async (conexion = mongoose.connection) => {
  const hola = await conexion.db.admin().command({ hello: 1 })
  if (!hola.setName && hola.msg !== 'isdbgrid') throw new ReplicaSetRequeridoError()
}
