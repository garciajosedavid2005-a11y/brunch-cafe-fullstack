// Migración 3b.2 (índice único de comprobantes por cuenta y parte, división de cuenta). Reversible.
//   npm run migrate:3b.2 -- --dry-run         simulacro (no escribe)
//   npm run migrate:3b.2                      aplica
//   npm run migrate:3b.2 -- --down --dry-run  simulacro de la reversión
//   npm run migrate:3b.2 -- --down            revierte (no, si ya hay cuentas cobradas por partes)
// Solo cambia índices (ningún documento). Antes de aplicar en una BD con datos: respaldo con mongodump.
import mongoose from 'mongoose'
import { config } from '../src/config.js'
import { up, down, VIEJO, NUEVO } from '../src/migraciones/m3b2-indice-comprobantes.js'
import { leerArgumentos } from '../src/migraciones/argumentos.js'

const { dryRun, reversa } = leerArgumentos(process.argv.slice(2))

try {
    await mongoose.connect(config.MONGO_URI)
    const db = mongoose.connection.db
    console.log(`BD: ${db.databaseName} · ${reversa ? 'DOWN' : 'UP'}${dryRun ? ' · SIMULACRO (no escribe)' : ''}`)
    const r = reversa ? await down(db, { dryRun }) : await up(db, { dryRun })
    const [crea, quita] = reversa ? [VIEJO, NUEVO] : [NUEVO, VIEJO]
    if (r.bloqueo) {
        console.log(`⚠ No se revierte: ${r.bloqueo}.`)
        process.exitCode = 1
    } else {
        console.log(`Índice ${crea}: ${r.crear ? (dryRun ? 'se crearía' : 'creado') : 'ya existe'}`)
        console.log(`Índice ${quita}: ${r.quitar ? (dryRun ? 'se quitaría' : 'quitado') : 'no existe'}`)
        console.log(dryRun ? '\n✓ Simulacro sin problemas.' : '\n✓ Listo.')
    }
} catch (error) {
    console.error('La migración falló:', error.message)
    process.exitCode = 1
} finally {
    await mongoose.disconnect()
}
