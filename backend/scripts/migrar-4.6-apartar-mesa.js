// Migración 4.6 (mesa apartada): solo agrega `reservas.apartarMesaMin: 60` a los horarios sin el campo; reversible.
//   npm run migrate:4.6 -- --dry-run         simulacro (no escribe)
//   npm run migrate:4.6                      aplica
//   npm run migrate:4.6 -- --down --dry-run  simulacro de la reversión
//   npm run migrate:4.6 -- --down            revierte (quita el campo solo donde vale 60)
// Antes de aplicar en una BD con datos: respaldo con mongodump.
import mongoose from 'mongoose'
import { config } from '../src/config.js'
import { up, down } from '../src/migraciones/m46-apartar-mesa.js'
import { leerArgumentos } from '../src/migraciones/argumentos.js'

const { dryRun, reversa } = leerArgumentos(process.argv.slice(2))

try {
    await mongoose.connect(config.MONGO_URI)
    const db = mongoose.connection.db
    console.log(`BD: ${db.databaseName} · ${reversa ? 'DOWN' : 'UP'}${dryRun ? ' · SIMULACRO (no escribe)' : ''}`)
    const r = reversa ? await down(db, { dryRun }) : await up(db, { dryRun })
    const n = reversa ? r.quitar : r.agregar
    const verbo = reversa ? (dryRun ? 'se quitaría' : 'quitado') : (dryRun ? 'se agregaría' : 'agregado')
    console.log(n ? `Horarios: apartarMesaMin ${verbo} en ${n} documento(s).` : 'Nada que cambiar.')
    console.log(dryRun ? '\n✓ Simulacro sin problemas.' : '\n✓ Listo.')
} catch (error) {
    console.error('La migración falló:', error.message)
    process.exitCode = 1
} finally {
    await mongoose.disconnect()
}
