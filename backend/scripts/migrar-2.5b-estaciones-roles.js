// Migración 2.5b (estaciones del KDS en los roles existentes: cocina → Cocina, barista → Barra). Reversible.
//   npm run migrate:2.5b -- --dry-run         simulacro (no escribe)
//   npm run migrate:2.5b                      aplica
//   npm run migrate:2.5b -- --down --dry-run  simulacro de la reversión
//   npm run migrate:2.5b -- --down            revierte (solo lo que puso up, si nadie lo cambió después)
// Antes de aplicar en una BD con datos: respaldo con mongodump (ver README). Las sesiones abiertas
// ven el cambio en ≤ 30 s (caché de sesiones).
import mongoose from 'mongoose'
import { config } from '../src/config.js'
import { up, down, ESTACIONES_ROLES } from '../src/migraciones/m25b-estaciones-roles.js'
import { leerArgumentos } from '../src/migraciones/argumentos.js'

const { dryRun, reversa } = leerArgumentos(process.argv.slice(2))

const EXPLICACION = {
    asignar: 'sin estaciones asignadas: se asignan',
    'ya-aplicada': 'la migración ya se aplicó',
    'sin-cambios': 'ya tiene las estaciones previstas',
    personalizado: 'ya tiene estaciones decididas por el admin (o ninguna a propósito): no se toca',
    'sin-estacion': 'la estación prevista no existe en esta BD: no se asigna; asígnala en Admin › Roles',
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
            if (r.accion === 'modificado-despues') console.log(`Rol ${r.nombre}: el admin cambió sus estaciones después (${(r.actuales || []).join(', ') || 'ninguna'}): no se toca`)
            else console.log(`Rol ${r.nombre}: ${r.quitar.length ? `se ${dryRun ? 'quitarían' : 'quitaron'} ${r.quitar.join(', ')}` : 'nada que revertir'}`)
        }
        console.log(dryRun ? '\n✓ Simulacro sin problemas.' : '\n✓ Reversión aplicada.')
    } else {
        const { roles, otrosSinEstaciones } = await up(db, { dryRun })
        for (const r of roles) {
            const actuales = r.actuales === null || r.actuales === undefined ? '(sin el campo)' : (r.actuales.join(', ') || '(ninguna)')
            console.log(`Rol ${r.nombre} · estaciones actuales: ${actuales} · previstas: ${ESTACIONES_ROLES[r.nombre].join(', ')}`)
            console.log(`  → ${EXPLICACION[r.accion]}${r.asignar.length ? `: ${r.asignar.join(', ')}` : ''}${r.aplicado ? ' (hecho)' : ''}`)
        }
        if (otrosSinEstaciones.length) {
            console.log(`\nℹ Otros roles con kds:ver sin estaciones (no verán el KDS hasta asignarlas en Admin › Roles): ${otrosSinEstaciones.join(', ')}`)
        }
        if (roles.some((r) => r.accion === 'cambio-concurrente')) {
            process.exitCode = 1
            console.log('\n⚠ Migración incompleta: algún rol cambió mientras se aplicaba; vuelve a ejecutarla.')
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
