// Migración 4 (índices de la Fase 4: reservas conectadas al salón). Solo agrega índices; reversible.
//   npm run migrate:4 -- --dry-run         simulacro (no escribe)
//   npm run migrate:4                      aplica
//   npm run migrate:4 -- --down --dry-run  simulacro de la reversión
//   npm run migrate:4 -- --down            revierte (quita solo los índices de la lista)
// Antes de aplicar en una BD con datos: respaldo con mongodump.
import mongoose from 'mongoose'
import { config } from '../src/config.js'
import { up, down } from '../src/migraciones/m4-indices-reservas.js'
import { leerArgumentos } from '../src/migraciones/argumentos.js'

const { dryRun, reversa } = leerArgumentos(process.argv.slice(2))

try {
    await mongoose.connect(config.MONGO_URI)
    const db = mongoose.connection.db
    console.log(`BD: ${db.databaseName} · ${reversa ? 'DOWN' : 'UP'}${dryRun ? ' · SIMULACRO (no escribe)' : ''}`)
    const r = reversa ? await down(db, { dryRun }) : await up(db, { dryRun })
    const lista = reversa ? r.quitar : r.crear
    const verbo = reversa ? (dryRun ? 'se quitaría' : 'quitado') : (dryRun ? 'se crearía' : 'creado')
    if (!lista.length) console.log(reversa ? 'Ningún índice de la Fase 4 que quitar.' : 'Todos los índices de la Fase 4 ya existen.')
    for (const nombre of lista) console.log(`Índice ${nombre}: ${verbo}`)
    console.log(dryRun ? '\n✓ Simulacro sin problemas.' : '\n✓ Listo.')
} catch (error) {
    console.error('La migración falló:', error.message)
    process.exitCode = 1
} finally {
    await mongoose.disconnect()
}
