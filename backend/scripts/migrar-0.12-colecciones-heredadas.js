// Migración 0.12: elimina las colecciones heredadas (users, orders, reservations, reviews). Reversible.
//   npm run migrate:0.12 -- --dry-run                         simulacro (conteos, no escribe)
//   npm run migrate:0.12 -- --respaldo ../backups/<carpeta>   aplica: guarda EJSON en la carpeta y elimina
//   npm run migrate:0.12 -- --down --respaldo <carpeta> [--dry-run]   restaura desde esa carpeta
// Antes de aplicar: mongodump completo a backups/ (ver README).
import { resolve } from 'node:path'
import mongoose from 'mongoose'
import { config } from '../src/config.js'
import { up, down } from '../src/migraciones/m12-colecciones-heredadas.js'

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const reversa = args.includes('--down')
const i = args.indexOf('--respaldo')
const dir = i >= 0 && args[i + 1] ? resolve(args[i + 1]) : undefined

try {
    await mongoose.connect(config.MONGO_URI)
    const db = mongoose.connection.db
    console.log(`BD: ${db.databaseName} · ${reversa ? 'DOWN' : 'UP'}${dryRun ? ' · SIMULACRO (no escribe)' : ''}${dir ? ` · respaldo: ${dir}` : ''}`)
    if (reversa) {
        const r = await down(db, { dryRun, dir })
        console.log('\nDocumentos a restaurar por colección:')
        console.table(r.restaurar)
        console.log(r.aplicado ? '\n✓ Restaurado.' : '\n(simulacro: no se escribió nada)')
    } else {
        const r = await up(db, { dryRun, dir })
        console.log('\nDocumentos por colección (vacío = no existe):')
        console.table(Object.fromEntries(Object.entries(r.conteos).map(([c, n]) => [c, { documentos: n ?? '' }])))
        console.log(r.aplicado
            ? `\n✓ Eliminadas: ${r.eliminadas.join(', ') || 'ninguna'}. Respaldo EJSON en ${r.dir}`
            : '\n(simulacro: no se escribió ni eliminó nada)')
    }
} catch (error) {
    console.error('No se pudo ejecutar la migración 0.12:', error.message)
    process.exitCode = 1
} finally {
    await mongoose.disconnect()
}
