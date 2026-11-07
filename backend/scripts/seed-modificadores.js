// Grupos de modificadores de ejemplo (1.3, F1-4): Leche, Tamaño, Término del huevo y Extras,
// marcados como ejemplo, y su asignación a los productos del menú inicial que aún no tienen grupos.
// Uso: npm run seed:modificadores
import mongoose from 'mongoose'
import { config } from '../src/config.js'
import { sembrarModificadoresEjemplo } from '../src/seeds/modificadores.js'

try {
    await mongoose.connect(config.MONGO_URI)
    const { grupos, productos } = await sembrarModificadoresEjemplo()
    console.log(`Grupos de modificadores: ${grupos.creados} creados, ${grupos.existentes} ya existían (no se modificaron).`)
    console.log(`Productos: ${productos.asignados} con grupos asignados, ${productos.conGrupos} ya tenían grupos (sin cambios).`)
    if (productos.noEncontrados.length) console.log(`No encontrados (se omiten): ${productos.noEncontrados.join(', ')}`)
} catch (error) {
    console.error('No se pudo sembrar los modificadores de ejemplo:', error.message)
    process.exitCode = 1
} finally {
    await mongoose.disconnect()
}
