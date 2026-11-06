// Migración 0.7 (estados con código + eventos iniciales). Reversible.
//   npm run migrate:0.7 -- --dry-run         simulacro (no escribe)
//   npm run migrate:0.7                      aplica
//   npm run migrate:0.7 -- --down --dry-run  simulacro de la reversión
//   npm run migrate:0.7 -- --down            revierte
// Antes de aplicar en una BD con datos: respaldo con mongodump (ver README).
import mongoose from 'mongoose'
import { config } from '../src/config.js'
import { up, down } from '../src/migraciones/m07-estados.js'

const args = new Set(process.argv.slice(2))
const dryRun = args.has('--dry-run')
const reversa = args.has('--down')

const tabla = (titulo, filas, columnas) => {
    console.log(`\n${titulo}`)
    if (!filas.length) return console.log('  (ninguno)')
    console.table(filas.map((fila) => Object.fromEntries(columnas.map((c) => [c, fila[c] ?? '']))))
}

const mostrarUp = (r) => {
    tabla('Equivalencias (estado viejo → codigo nuevo)', r.equivalencias.map((e) => ({ ...e, 'renombrar a': e.renombrarA || '—' })),
        ['tipo', 'nombre', 'codigo', 'renombrar a', 'pedidos', 'reservas'])
    if (r.yaMigrados.length) tabla('Ya tenían código (se omiten)', r.yaMigrados, ['tipo', 'nombre', 'codigo'])
    tabla('Estados nuevos a insertar', r.insertar, ['tipo', 'codigo', 'nombre'])
    tabla('SIN EQUIVALENCIA (no se adivinan)', r.sinEquivalencia, ['tipo', 'nombre', 'pedidos', 'reservas'])
    tabla('CONFLICTOS', r.conflictos, ['tipo', 'codigo', 'nombres', 'motivo'])
    const eventosPor = (entidad) => r.eventos.filter((e) => e.entidad === entidad).length
    console.log('\nDocumentos que cambiarían por colección:')
    console.table({
        estados: { actualizar: r.equivalencias.length, insertar: r.insertar.length, borrar: 0 },
        eventos: { actualizar: 0, insertar: r.eventos.length, borrar: 0 },
        pedidos: { actualizar: 0, insertar: 0, borrar: 0 },
        reservas: { actualizar: 0, insertar: 0, borrar: 0 },
    })
    console.log(`  (eventos: ${eventosPor('pedido')} de pedidos, ${eventosPor('reserva')} de reservas; motivo "migracion 0.7", actor "sistema")`)
}

const mostrarDown = (r) => {
    tabla('Estados a restaurar', r.restaurar, ['tipo', 'codigo', 'nombre', 'nombreOriginal'])
    tabla('Estados insertados a borrar', r.borrarEstados, ['tipo', 'codigo', 'nombre'])
    tabla('BLOQUEADOS (insertados y ya en uso)', r.bloqueados, ['tipo', 'codigo', 'nombre', 'pedidos', 'reservas'])
    console.log('\nDocumentos que cambiarían por colección:')
    console.table({
        estados: { actualizar: r.restaurar.length, insertar: 0, borrar: r.borrarEstados.length },
        eventos: { actualizar: 0, insertar: 0, borrar: r.borrarEventos },
        pedidos: { actualizar: 0, insertar: 0, borrar: 0 },
        reservas: { actualizar: 0, insertar: 0, borrar: 0 },
    })
    if (r.eventosDeLaApp) console.log(`  (${r.eventosDeLaApp} evento(s) creados por la app se conservan)`)
}

try {
    await mongoose.connect(config.MONGO_URI)
    const db = mongoose.connection.db
    console.log(`BD: ${db.databaseName} · ${reversa ? 'DOWN' : 'UP'}${dryRun ? ' · SIMULACRO (no escribe)' : ''}`)

    const resultado = reversa ? await down(db, { dryRun }) : await up(db, { dryRun })
    if (reversa) mostrarDown(resultado)
    else mostrarUp(resultado)

    if (!resultado.puedeAplicar) {
        console.log('\n✗ No se puede aplicar: revisa las filas marcadas arriba. No se escribió nada.')
        process.exitCode = 2
    } else if (resultado.aplicado) {
        console.log('\n✓ Migración aplicada.')
    } else {
        console.log('\n✓ Simulacro sin problemas.')
    }
} catch (error) {
    console.error('La migración falló:', error.message)
    process.exitCode = 1
} finally {
    await mongoose.disconnect()
}
