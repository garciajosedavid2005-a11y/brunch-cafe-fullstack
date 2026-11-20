// Migración 6.7 (cumpleaños): crea los índices de usos_cumpleanos. Reversible.
//   npm run migrate:6.7 -- --dry-run         simulacro (no escribe)
//   npm run migrate:6.7                      aplica
//   npm run migrate:6.7 -- --down --dry-run  simulacro de la reversión
//   npm run migrate:6.7 -- --down            revierte (solo si la colección está vacía)
// Antes de aplicar en una BD con datos: respaldo con mongodump.
import mongoose from 'mongoose'
import { config } from '../src/config.js'
import { up, down } from '../src/migraciones/m67-cumpleanos.js'
import { leerArgumentos } from '../src/migraciones/argumentos.js'

const { dryRun, reversa } = leerArgumentos(process.argv.slice(2))

try {
    await mongoose.connect(config.MONGO_URI)
    const db = mongoose.connection.db
    console.log(`BD: ${db.databaseName} · ${reversa ? 'DOWN' : 'UP'}${dryRun ? ' · SIMULACRO (no escribe)' : ''}`)
    const r = reversa ? await down(db, { dryRun }) : await up(db, { dryRun })
    console.log(`Índices de usos_cumpleanos: ${(reversa ? r.quitar : r.crear).join(', ') || 'nada'}${r.bloqueo ? ` (${r.bloqueo})` : ''}${r.aplicado ? ' · aplicado' : ''}`)
    if (r.bloqueo) {
        console.log('\n✗ No se revirtió: la colección tiene usos.')
        process.exitCode = 1
    } else console.log(dryRun ? '\n✓ Simulacro sin problemas.' : '\n✓ Listo.')
} catch (error) {
    console.error('La migración falló:', error.message)
    process.exitCode = 1
} finally {
    await mongoose.disconnect()
}
