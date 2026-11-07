// Migración 0.15 (reserva:ver y reserva:crear para el mesero en BDs existentes). Reversible.
//   npm run migrate:0.15 -- --dry-run         simulacro (no escribe)
//   npm run migrate:0.15                      aplica
//   npm run migrate:0.15 -- --down --dry-run  simulacro de la reversión
//   npm run migrate:0.15 -- --down            revierte (solo lo que agregó up)
// Antes de aplicar en una BD con datos: respaldo con mongodump (ver README).
// Las sesiones abiertas ven el cambio en ≤ 30 s (caché de sesiones).
import mongoose from 'mongoose'
import { config } from '../src/config.js'
import { up, down } from '../src/migraciones/m15-permisos-mesero.js'

const args = new Set(process.argv.slice(2))
const dryRun = args.has('--dry-run')
const reversa = args.has('--down')

const EXPLICACION = {
    agregar: 'tiene los permisos antiguos: se agregan los nuevos',
    'ya-aplicada': 'la migración ya se aplicó',
    'sin-cambios': 'ya tiene reserva:ver y reserva:crear',
    personalizado: 'el admin personalizó sus permisos: no se toca (asígnalos en Admin › Roles si hacen falta)',
    'sin-rol': 'no existe el rol mesero',
}

try {
    await mongoose.connect(config.MONGO_URI)
    const db = mongoose.connection.db
    console.log(`BD: ${db.databaseName} · ${reversa ? 'DOWN' : 'UP'}${dryRun ? ' · SIMULACRO (no escribe)' : ''}`)
    if (reversa) {
        const r = await down(db, { dryRun })
        console.log(r.quitar.length ? `Rol mesero: se quitarían ${r.quitar.join(', ')}` : 'Nada que revertir (up no marcó el rol).')
        console.log(r.aplicado ? '\n✓ Reversión aplicada.' : '\n✓ Simulacro sin problemas.')
    } else {
        const r = await up(db, { dryRun })
        console.log(`Rol mesero · permisos actuales: ${r.permisos.join(', ') || '(ninguno)'}`)
        console.log(`→ ${EXPLICACION[r.accion]}${r.agregar.length ? `: ${r.agregar.join(', ')}` : ''}`)
        console.log(r.aplicado ? '\n✓ Migración aplicada.' : '\n✓ Simulacro sin problemas.')
    }
} catch (error) {
    console.error('La migración falló:', error.message)
    process.exitCode = 1
} finally {
    await mongoose.disconnect()
}
