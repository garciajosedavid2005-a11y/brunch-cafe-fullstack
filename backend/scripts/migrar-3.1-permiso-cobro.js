// Migración 3.1 (permiso de cobro cuenta:cobrar para el rol cajero, Fase 3). Reversible.
//   npm run migrate:3.1 -- --dry-run         simulacro (no escribe)
//   npm run migrate:3.1                      aplica
//   npm run migrate:3.1 -- --down --dry-run  simulacro de la reversión
//   npm run migrate:3.1 -- --down            revierte (solo lo que agregó up)
// Antes de aplicar en una BD con datos: respaldo con mongodump (ver README). Las sesiones abiertas
// ven el cambio en ≤ 30 s (caché de sesiones).
import mongoose from 'mongoose'
import { config } from '../src/config.js'
import { up, down, PERMISOS_FASE_3 } from '../src/migraciones/m31-permiso-cobro.js'
import { leerArgumentos } from '../src/migraciones/argumentos.js'

// Un argumento desconocido (una errata como --dryrun) detiene el script sin escribir
const { dryRun, reversa } = leerArgumentos(process.argv.slice(2))

const EXPLICACION = {
    agregar: 'le faltan permisos de la Fase 3: se agregan',
    'ya-aplicada': 'la migración ya se aplicó',
    'sin-cambios': 'ya tiene los permisos de la Fase 3',
    personalizado: 'ya tiene algunos permisos de la Fase 3 (el admin decidió): no se toca; asigna los que falten en Admin › Roles si hacen falta',
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
            if (r.accion === 'personalizado') console.log(`    permisos de la Fase 3 previstos: ${PERMISOS_FASE_3[r.nombre].join(', ')}`)
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
