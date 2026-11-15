// Migración 4.6.5: corrige solo la descripción del estado «No asistió» (reservas); reversible.
//   npm run migrate:4.6.5 -- --dry-run         simulacro (no escribe)
//   npm run migrate:4.6.5                      aplica
//   npm run migrate:4.6.5 -- --down --dry-run  simulacro de la reversión
//   npm run migrate:4.6.5 -- --down            revierte (vuelve al texto anterior)
// Antes de aplicar en una BD con datos: respaldo con mongodump.
import mongoose from 'mongoose'
import { config } from '../src/config.js'
import { up, down, DESCRIPCION_ANTERIOR, DESCRIPCION_NUEVA } from '../src/migraciones/m465-texto-no-show.js'
import { leerArgumentos } from '../src/migraciones/argumentos.js'

const { dryRun, reversa } = leerArgumentos(process.argv.slice(2))

try {
    await mongoose.connect(config.MONGO_URI)
    const db = mongoose.connection.db
    console.log(`BD: ${db.databaseName} · ${reversa ? 'DOWN' : 'UP'}${dryRun ? ' · SIMULACRO (no escribe)' : ''}`)
    const r = reversa ? await down(db, { dryRun }) : await up(db, { dryRun })
    const [de, a] = reversa ? [DESCRIPCION_NUEVA, DESCRIPCION_ANTERIOR] : [DESCRIPCION_ANTERIOR, DESCRIPCION_NUEVA]
    console.log(r.cambiar
        ? `Estado «No asistió»: «${de}» → «${a}» ${dryRun ? '(se cambiaría)' : '(cambiado)'}.`
        : 'Nada que cambiar (la descripción no es la esperada: ya está aplicada o se editó).')
    console.log(dryRun ? '\n✓ Simulacro sin problemas.' : '\n✓ Listo.')
} catch (error) {
    console.error('La migración falló:', error.message)
    process.exitCode = 1
} finally {
    await mongoose.disconnect()
}
