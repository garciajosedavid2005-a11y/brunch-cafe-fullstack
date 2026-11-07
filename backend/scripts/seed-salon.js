// Salón de ejemplo (1.2, F1-1): zonas Interior y Terraza con mesas de 2 y 4 personas, marcadas
// como ejemplo. Solo actúa si todavía no hay zonas; los datos reales se cargan en Admin › Salón.
// Uso: npm run seed:salon
import mongoose from 'mongoose'
import { config } from '../src/config.js'
import { sembrarSalonEjemplo } from '../src/seeds/salon.js'

try {
    await mongoose.connect(config.MONGO_URI)
    const r = await sembrarSalonEjemplo()
    console.log(r.creado
        ? `Salón de ejemplo creado: ${r.zonas} zonas y ${r.mesas} mesas (marcadas como ejemplo).`
        : 'Ya hay zonas configuradas: no se siembra el salón de ejemplo.')
} catch (error) {
    console.error('No se pudo sembrar el salón de ejemplo:', error.message)
    process.exitCode = 1
} finally {
    await mongoose.disconnect()
}
