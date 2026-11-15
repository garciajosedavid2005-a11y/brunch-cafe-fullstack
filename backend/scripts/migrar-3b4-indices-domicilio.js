// Migración 3b.4 (índices de comprobantes para el cobro de domicilios). Reversible.
//   npm run migrate:3b.4 -- --dry-run         simulacro (no escribe)
//   npm run migrate:3b.4                      aplica (con el servidor detenido: rehace un índice único)
//   npm run migrate:3b.4 -- --down --dry-run  simulacro de la reversión
//   npm run migrate:3b.4 -- --down            revierte (no, si ya hay comprobantes de domicilios)
// Solo cambia índices (ningún documento). Antes de aplicar en una BD con datos: respaldo con mongodump.
import mongoose from 'mongoose'
import { config } from '../src/config.js'
import { up, down, PARTES, PEDIDO } from '../src/migraciones/m3b4-indices-domicilio.js'
import { leerArgumentos } from '../src/migraciones/argumentos.js'

const { dryRun, reversa } = leerArgumentos(process.argv.slice(2))
const verbo = (hecho, simulado) => (dryRun ? simulado : hecho)

try {
    await mongoose.connect(config.MONGO_URI)
    const db = mongoose.connection.db
    console.log(`BD: ${db.databaseName} · ${reversa ? 'DOWN' : 'UP'}${dryRun ? ' · SIMULACRO (no escribe)' : ''}`)
    const r = reversa ? await down(db, { dryRun }) : await up(db, { dryRun })
    if (r.bloqueo) {
        console.log(`⚠ No se revierte: ${r.bloqueo}.`)
        process.exitCode = 1
    } else if (reversa) {
        console.log(`Índice ${PEDIDO}: ${r.quitarPedido ? verbo('quitado', 'se quitaría') : 'no existe'}`)
        console.log(`Índice ${PARTES}: ${r.rehacerPartes ? verbo('rehecho sin filtro (como en 3b.2)', 'se rehará sin filtro') : 'ya está como en 3b.2'}`)
        console.log(dryRun ? '\n✓ Simulacro sin problemas.' : '\n✓ Listo.')
    } else {
        console.log(`Índice ${PARTES}: ${r.rehacerPartes ? verbo('rehecho como parcial (solo cuentas)', 'se rehará como parcial') : 'ya es parcial'}`)
        console.log(`Índice ${PEDIDO}: ${r.crearPedido ? verbo('creado', 'se crearía') : 'ya existe'}`)
        console.log(dryRun ? '\n✓ Simulacro sin problemas.' : '\n✓ Listo.')
    }
} catch (error) {
    console.error('La migración falló:', error.message)
    process.exitCode = 1
} finally {
    await mongoose.disconnect()
}
