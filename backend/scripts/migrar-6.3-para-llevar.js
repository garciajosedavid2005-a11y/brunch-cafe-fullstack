// Migración 6.3 (para llevar): agrega cuenta:para_llevar al mesero y al cajero y deja el índice «una mesa en una sola
// cuenta abierta» solo para el salón. Reversible; no toca documentos de cuentas.
//   npm run migrate:6.3 -- --dry-run         simulacro (no escribe)
//   npm run migrate:6.3                      aplica
//   npm run migrate:6.3 -- --down --dry-run  simulacro de la reversión
//   npm run migrate:6.3 -- --down            revierte (solo lo que agregó up)
// Antes de aplicar en una BD con datos: respaldo con mongodump y el servidor detenido.
import mongoose from 'mongoose'
import { config } from '../src/config.js'
import { up, down, INDICE_NUEVO, INDICE_VIEJO } from '../src/migraciones/m63-para-llevar.js'
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
    const i = r.indice
    const [nuevo, viejo] = reversa ? [INDICE_VIEJO, INDICE_NUEVO] : [INDICE_NUEVO, INDICE_VIEJO]
    if (i.bloqueo) console.log(`Índices de cuentas: sin cambios (${i.bloqueo})`)
    else console.log(`Índice cuentas.${nuevo.nombre}: ${i.crear ? 'crear' : 'ya existe'} · cuentas.${viejo.nombre}: ${i.quitar ? 'quitar' : 'no existe'}${i.aplicado ? ' · aplicado' : ''}`)
    console.log(dryRun ? '\n✓ Simulacro sin problemas.' : '\n✓ Listo.')
} catch (error) {
    console.error('La migración falló:', error.message)
    process.exitCode = 1
} finally {
    await mongoose.disconnect()
}
