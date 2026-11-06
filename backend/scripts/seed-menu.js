// Seed idempotente del menú inicial. Uso: npm run seed:menu
// Lee backend/seed-data/menu.json y backend/seed-data/imagenes/. Crea lo que falta
// y no modifica productos, categorías ni imágenes que ya existan.
import mongoose from 'mongoose'
import { config } from '../src/config.js'
import { sembrarMenu } from '../src/seeds/menu.js'

try {
    await mongoose.connect(config.MONGO_URI)
    const { categorias, imagenes, productos } = await sembrarMenu()
    console.log(`Categorías: ${categorias.creadas} creadas, ${categorias.existentes} ya existían.`)
    console.log(`Imágenes: ${imagenes.creadas} creadas, ${imagenes.existentes} ya existían.`)
    console.log(`Productos: ${productos.creados} creados, ${productos.existentes} ya existían (no se modificaron).`)
} catch (error) {
    console.error('No se pudo sembrar el menú:', error.message)
    process.exitCode = 1
} finally {
    await mongoose.disconnect()
}
