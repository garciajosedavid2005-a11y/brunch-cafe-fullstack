// Migración 6.2b: corrige solo la descripción del permiso `pedido:cobrar`; reversible.
//   npm run migrate:6.2b -- --dry-run         simulacro (no escribe)
//   npm run migrate:6.2b                      aplica
//   npm run migrate:6.2b -- --down --dry-run  simulacro de la reversión
//   npm run migrate:6.2b -- --down            revierte (vuelve al texto anterior)
// Antes de aplicar en una BD con datos: respaldo con mongodump.
import mongoose from 'mongoose'
import { config } from '../src/config.js'
import { up, down, DESCRIPCION_ANTERIOR, DESCRIPCION_NUEVA } from '../src/migraciones/m62b-descripcion-cobro.js'
import { leerArgumentos } from '../src/migraciones/argumentos.js'

try {
    const { dryRun, reversa } = leerArgumentos(process.argv.slice(2))
    await mongoose.connect(config.MONGO_URI)
    const db = mongoose.connection.db
    console.log(`BD: ${db.databaseName} · ${reversa ? 'DOWN' : 'UP'}${dryRun ? ' · SIMULACRO (no escribe)' : ''}`)
    const r = reversa ? await down(db, { dryRun }) : await up(db, { dryRun })
    const [de, a] = reversa ? [DESCRIPCION_NUEVA, DESCRIPCION_ANTERIOR] : [DESCRIPCION_ANTERIOR, DESCRIPCION_NUEVA]
    console.log(r.cambiar
        ? `Permiso pedido:cobrar: «${de}» → «${a}» ${dryRun ? '(se cambiaría)' : '(cambiado)'}.`
        : 'Nada que cambiar (la descripción no es la esperada: ya está aplicada o se editó).')
    console.log(dryRun ? '\n✓ Simulacro sin problemas.' : '\n✓ Listo.')
} catch (error) {
    console.error('La migración falló:', error.message)
    process.exitCode = 1
} finally {
    await mongoose.disconnect()
}
