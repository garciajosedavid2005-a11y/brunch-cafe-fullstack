// Migración 0.10 (instantes UTC: Reserva.inicio y Pedido.entregaEn). Reversible.
//   npm run migrate:0.10 -- --dry-run         simulacro (no escribe)
//   npm run migrate:0.10                      aplica
//   npm run migrate:0.10 -- --down --dry-run  simulacro de la reversión
//   npm run migrate:0.10 -- --down            revierte (solo lo que marcó up)
// Antes de aplicar en una BD con datos: respaldo con mongodump (ver README).
import mongoose from 'mongoose'
import { config } from '../src/config.js'
import { up, down } from '../src/migraciones/m10-fechas.js'

const args = new Set(process.argv.slice(2))
const dryRun = args.has('--dry-run')
const reversa = args.has('--down')

try {
    await mongoose.connect(config.MONGO_URI)
    const db = mongoose.connection.db
    console.log(`BD: ${db.databaseName} · ${reversa ? 'DOWN' : 'UP'}${dryRun ? ' · SIMULACRO (no escribe)' : ''}`)
    const r = reversa ? await down(db, { dryRun }) : await up(db, { dryRun })
    if (reversa) {
        console.log('\nDocumentos a los que se quitaría el instante puesto por la migración:')
        console.table({ reservas: { quitar: r.reservas }, pedidos: { quitar: r.pedidos } })
    } else {
        console.log('\nDocumentos por colección:')
        console.table({
            'reservas (inicio)': { completar: r.reservas.completar, 'ya tenían': r.reservas.yaTenian, 'sin hora': r.reservas.sinHora, inválidos: r.reservas.invalidos.length },
            'pedidos (entregaEn)': { completar: r.pedidos.completar, 'ya tenían': r.pedidos.yaTenian, 'sin hora': r.pedidos.sinHora, inválidos: r.pedidos.invalidos.length },
        })
        for (const c of ['reservas', 'pedidos']) {
            if (r[c].invalidos.length) {
                console.log(`\nINVÁLIDOS en ${c} (no se adivinan):`)
                console.table(r[c].invalidos.map((d) => ({ ...d, _id: String(d._id) })))
            }
        }
        console.log('  (no se borra nada; fecha, hora y horaEntrega se conservan)')
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
