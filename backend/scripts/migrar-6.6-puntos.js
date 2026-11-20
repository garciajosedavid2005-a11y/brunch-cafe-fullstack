// Migración 6.6 (puntos): agrega puntos:canjear al cajero y los índices de movimientos_puntos. Reversible.
//   npm run migrate:6.6 -- --dry-run         simulacro (no escribe)
//   npm run migrate:6.6                      aplica
//   npm run migrate:6.6 -- --down --dry-run  simulacro de la reversión
//   npm run migrate:6.6 -- --down            revierte (solo lo que agregó up)
// Antes de aplicar en una BD con datos: respaldo con mongodump.
import mongoose from 'mongoose'
import { config } from '../src/config.js'
import { up, down } from '../src/migraciones/m66-puntos.js'
import { leerArgumentos } from '../src/migraciones/argumentos.js'

const { dryRun, reversa } = leerArgumentos(process.argv.slice(2))

try {
    await mongoose.connect(config.MONGO_URI)
    const db = mongoose.connection.db
    console.log(`BD: ${db.databaseName} · ${reversa ? 'DOWN' : 'UP'}${dryRun ? ' · SIMULACRO (no escribe)' : ''}`)
    const r = reversa ? await down(db, { dryRun }) : await up(db, { dryRun })
    for (const rol of r.roles) {
        const lista = (reversa ? rol.quitar : rol.agregar) || []
        console.log(`Rol ${rol.nombre}: ${rol.accion || (lista.length ? 'quitar' : 'nada')}${lista.length ? ` (${lista.join(', ')})` : ''}${rol.aplicado ? ' · aplicado' : ''}`)
    }
    const i = r.indices
    console.log(`Índices de movimientos_puntos: ${(reversa ? i.quitar : i.crear).join(', ') || 'nada'}${i.bloqueo ? ` (${i.bloqueo})` : ''}${i.aplicado ? ' · aplicado' : ''}`)
    console.log(dryRun ? '\n✓ Simulacro sin problemas.' : '\n✓ Listo.')
} catch (error) {
    console.error('La migración falló:', error.message)
    process.exitCode = 1
} finally {
    await mongoose.disconnect()
}
