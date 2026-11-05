// Migración 0.6 (referencias a productos por ObjectId). Reversible.
//   npm run migrate:0.6 -- --dry-run         simulacro (no escribe)
//   npm run migrate:0.6                      aplica
//   npm run migrate:0.6 -- --down --dry-run  simulacro de la reversión
//   npm run migrate:0.6 -- --down            revierte (solo lo que marcó up)
// Antes de aplicar en una BD con datos: respaldo con mongodump (ver README).
import mongoose from 'mongoose'
import { config } from '../src/config.js'
import { up, down } from '../src/migraciones/m06-referencias.js'

const args = new Set(process.argv.slice(2))
const dryRun = args.has('--dry-run')
const reversa = args.has('--down')

try {
    await mongoose.connect(config.MONGO_URI)
    const db = mongoose.connection.db
    console.log(`BD: ${db.databaseName} · ${reversa ? 'DOWN' : 'UP'}${dryRun ? ' · SIMULACRO (no escribe)' : ''}`)

    const r = reversa ? await down(db, { dryRun }) : await up(db, { dryRun })
    if (reversa) {
        console.log('\nDocumentos a los que se quitaría la referencia puesta por la migración:')
        console.table({ detallepedidos: { quitar: r.detallepedidos }, comentarios: { quitar: r.comentarios } })
    } else {
        console.log('\nDocumentos por colección:')
        console.table(Object.fromEntries(['detallepedidos', 'comentarios'].map((c) => [c, {
            'completar producto': r[c].completar, 'ya tenían': r[c].yaTenian, 'sin código': r[c].sinCodigo, 'código sin producto': r[c].sinProducto.length,
        }])))
        for (const c of ['detallepedidos', 'comentarios']) {
            if (r[c].sinProducto.length) {
                console.log(`\nCÓDIGOS SIN PRODUCTO en ${c} (no se adivinan):`)
                console.table(r[c].sinProducto)
            }
        }
        console.log('  (no se borra nada; productoId se conserva; reviews heredada no se toca)')
    }
    if (!r.puedeAplicar) {
        console.log('\n✗ No se puede aplicar: revisa las filas marcadas arriba. No se escribió nada.')
        process.exitCode = 2
    } else {
        console.log(r.aplicado ? '\n✓ Migración aplicada.' : '\n✓ Simulacro sin problemas.')
    }
} catch (error) {
    console.error('La migración falló:', error.message)
    process.exitCode = 1
} finally {
    await mongoose.disconnect()
}
