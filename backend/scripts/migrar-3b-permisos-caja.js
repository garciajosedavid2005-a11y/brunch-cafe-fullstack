// Migración 3b (permisos de la caja completa para el cajero y el repartidor, Fase 3b). Reversible.
//   npm run migrate:3b -- --dry-run         simulacro (no escribe)
//   npm run migrate:3b                      aplica
//   npm run migrate:3b -- --down --dry-run  simulacro de la reversión
//   npm run migrate:3b -- --down            revierte (solo lo que agregó up)
// Antes de aplicar en una BD con datos: respaldo con mongodump (ver README). Las sesiones abiertas
// ven el cambio en ≤ 30 s (caché de sesiones).
import mongoose from 'mongoose'
import { config } from '../src/config.js'
import { up, down, PERMISOS_FASE_3B } from '../src/migraciones/m3b-permisos-caja.js'
import { leerArgumentos } from '../src/migraciones/argumentos.js'

// Un argumento desconocido (una errata como --dryrun) detiene el script sin escribir
const { dryRun, reversa } = leerArgumentos(process.argv.slice(2))

const EXPLICACION = {
    agregar: 'le faltan permisos de la Fase 3b: se agregan',
    'ya-aplicada': 'la migración ya se aplicó',
    'sin-cambios': 'ya tiene los permisos de la Fase 3b',
    personalizado: 'ya tiene algunos permisos de la Fase 3b (el admin decidió): no se toca; asigna los que falten en Admin › Roles si hacen falta',
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
            if (r.accion === 'personalizado') console.log(`    permisos de la Fase 3b previstos: ${PERMISOS_FASE_3B[r.nombre].join(', ')}`)
        }
        const pendientes = roles.filter((r) => ['personalizado', 'cambio-concurrente'].includes(r.accion))
        if (pendientes.length) {
            console.log(`\n⚠ Requiere acción en: ${pendientes.map((r) => r.nombre).join(', ')} (ver arriba).`)
            // Un cambio concurrente no se aplicó: código de salida distinto de 0 para quien lo automatice
            if (roles.some((r) => r.accion === 'cambio-concurrente')) process.exitCode = 1
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
