// Migración 3.7 (opción por defecto: Leche → Entera y Tamaño → Normal en los grupos ya guardados). Reversible.
//   npm run migrate:3.7 -- --dry-run         simulacro (no escribe)
//   npm run migrate:3.7                      aplica
//   npm run migrate:3.7 -- --down --dry-run  simulacro de la reversión
//   npm run migrate:3.7 -- --down            revierte (solo lo que marcó up)
// Antes de aplicar en una BD con datos: respaldo con mongodump (ver README).
import mongoose from 'mongoose'
import { config } from '../src/config.js'
import { up, down } from '../src/migraciones/m37-opcion-por-defecto.js'
import { leerArgumentos } from '../src/migraciones/argumentos.js'

// Un argumento desconocido (una errata como --dryrun) detiene el script sin escribir
const { dryRun, reversa } = leerArgumentos(process.argv.slice(2))

const EXPLICACION = {
    asignar: 'se marca como opción por defecto',
    'ya-aplicada': 'la migración ya se aplicó',
    'ya-tiene': 'el grupo ya tiene una opción por defecto (el admin decidió): no se toca',
    'no-unica': 'el grupo admite varias opciones (máximo distinto de 1): no se toca',
    'sin-opcion': 'el grupo no tiene esa opción: no se toca',
    'sin-grupo': 'no existe el grupo',
    'cambio-concurrente': 'el grupo cambió durante la migración: no se tocó; vuelve a ejecutarla',
}

try {
    await mongoose.connect(config.MONGO_URI)
    const db = mongoose.connection.db
    console.log(`BD: ${db.databaseName} · ${reversa ? 'DOWN' : 'UP'}${dryRun ? ' · SIMULACRO (no escribe)' : ''}`)
    if (reversa) {
        const { grupos } = await down(db, { dryRun })
        if (!grupos.length) console.log('Nada que revertir: ningún grupo tiene la marca de esta migración.')
        for (const g of grupos) {
            console.log(`Grupo ${g.grupo}: se ${dryRun ? 'quitaría' : 'quitó'} «${g.opcion}» por defecto`)
        }
        console.log(dryRun ? '\n✓ Simulacro sin problemas.' : '\n✓ Reversión aplicada.')
    } else {
        const { grupos } = await up(db, { dryRun })
        for (const g of grupos) console.log(`Grupo ${g.grupo} → «${g.opcion}»: ${EXPLICACION[g.accion]}`)
        if (grupos.some((g) => g.accion === 'cambio-concurrente')) process.exitCode = 1
        console.log(dryRun ? '\n✓ Simulacro sin problemas.' : '\n✓ Migración aplicada.')
    }
} catch (error) {
    console.error('La migración falló:', error.message)
    process.exitCode = 1
} finally {
    await mongoose.disconnect()
}
