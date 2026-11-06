// Cambia #b78103 → #7a5000 en los estados que aún tengan el color anterior exacto.
//   npm run recolorear:estados -- --dry-run   (muestra qué cambiaría)
//   npm run recolorear:estados                (aplica; idempotente)
import mongoose from 'mongoose'
import { config } from '../src/config.js'
import { recolorearAmarillo, COLOR_ANTERIOR, COLOR_NUEVO } from '../src/migraciones/recolorear-amarillo.js'

const dryRun = process.argv.includes('--dry-run')
try {
    await mongoose.connect(config.MONGO_URI)
    const { afectados, sinColor } = await recolorearAmarillo(mongoose.connection.db, { dryRun })
    console.log(`${dryRun ? 'SIMULACRO · ' : ''}${COLOR_ANTERIOR} → ${COLOR_NUEVO}: ${afectados.length} estado(s)`)
    if (sinColor) console.log(`${sinColor} estado(s) sin color guardado: usan el del catálogo (no se modifican).`)
    if (afectados.length) console.table(afectados.map(({ tipo, codigo, nombre, color }) => ({ tipo, codigo, nombre, color })))
} catch (error) {
    console.error('No se pudo recolorear:', error.message)
    process.exitCode = 1
} finally {
    await mongoose.disconnect()
}
