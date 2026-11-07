// Migración 1.1 (permisos de salón para mesero y anfitrión en BDs existentes). Reversible.
//   npm run migrate:1.1 -- --dry-run         simulacro (no escribe)
//   npm run migrate:1.1                      aplica
//   npm run migrate:1.1 -- --down --dry-run  simulacro de la reversión
//   npm run migrate:1.1 -- --down            revierte (solo lo que agregó up)
// Requiere la migración 0.15 aplicada; para revertir ambas, primero 1.1 --down y luego 0.15 --down. Antes de aplicar en una BD con datos: respaldo con
// mongodump (ver README). Las sesiones abiertas ven el cambio en ≤ 30 s (caché de sesiones).
import mongoose from 'mongoose'
import { config } from '../src/config.js'
import { up, down, PERMISOS_SALON } from '../src/migraciones/m11-permisos-salon.js'

const args = new Set(process.argv.slice(2))
const dryRun = args.has('--dry-run')
const reversa = args.has('--down')

const EXPLICACION = {
    agregar: 'tiene los permisos anteriores a 1.1: se agregan los de salón',
    'ya-aplicada': 'la migración ya se aplicó',
    'sin-cambios': 'ya tiene los permisos de salón',
    personalizado: 'el admin personalizó sus permisos: no se toca (asígnalos en Admin › Roles si hacen falta)',
    'falta-0.15': 'le falta la migración 0.15: aplica primero npm run migrate:0.15',
    'cambio-concurrente': 'el rol cambió durante la migración: no se tocó; vuelve a ejecutarla',
    'sin-rol': 'no existe el rol',
}

try {
    await mongoose.connect(config.MONGO_URI)
    const db = mongoose.connection.db
    console.log(`BD: ${db.databaseName} · ${reversa ? 'DOWN' : 'UP'}${dryRun ? ' · SIMULACRO (no escribe)' : ''}`)
    if (reversa) {
        const { roles } = await down(db, { dryRun })
        for (const r of roles) {
            console.log(`Rol ${r.nombre}: ${r.quitar.length ? `se ${dryRun ? 'quitarían' : 'quitaron'} ${r.quitar.join(', ')}` : 'nada que revertir (up no lo marcó)'}`)
        }
        console.log(dryRun ? '\n✓ Simulacro sin problemas.' : '\n✓ Reversión aplicada.')
    } else {
        const { roles } = await up(db, { dryRun })
        for (const r of roles) {
            console.log(`Rol ${r.nombre} · permisos actuales: ${r.permisos.join(', ') || '(ninguno)'}`)
            console.log(`  → ${EXPLICACION[r.accion]}${r.agregar.length ? `: ${r.agregar.join(', ')}` : ''}`)
            if (['personalizado', 'falta-0.15'].includes(r.accion)) {
                console.log(`    permisos de salón previstos: ${PERMISOS_SALON[r.nombre].join(', ')}`)
            }
        }
        const pendientes = roles.filter((r) => ['personalizado', 'falta-0.15', 'cambio-concurrente'].includes(r.accion))
        if (pendientes.length) {
            console.log(`\n⚠ Requiere acción en: ${pendientes.map((r) => r.nombre).join(', ')} (ver arriba).`)
        } else {
            console.log(dryRun ? '\n✓ Simulacro sin problemas.' : '\n✓ Migración aplicada.')
        }
    }
} catch (error) {
    console.error('La migración falló:', error.message)
    process.exitCode = 1
} finally {
    await mongoose.disconnect()
}
