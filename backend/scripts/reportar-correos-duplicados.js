// Reporta usuarios cuyo correo coincide al normalizarlo (trim + minúsculas)
// y correos guardados sin normalizar. NO modifica datos.
// Uso: npm run report:correos
import mongoose from 'mongoose'
import { config } from '../src/config.js'

const normalizar = (correo) => String(correo || '').trim().toLowerCase()

const reportar = async () => {
    await mongoose.connect(config.MONGO_URI)
    const usuarios = await mongoose.connection.db
        .collection('usuarios')
        .find({}, { projection: { correo: 1, nombre: 1, apellido: 1, createdAt: 1 } })
        .toArray()

    const grupos = new Map()
    for (const usuario of usuarios) {
        const clave = normalizar(usuario.correo)
        grupos.set(clave, [...(grupos.get(clave) || []), usuario])
    }

    const duplicados = [...grupos.entries()].filter(([, lista]) => lista.length > 1)
    const sinNormalizar = usuarios.filter((u) => u.correo !== normalizar(u.correo))

    console.log(`Usuarios revisados: ${usuarios.length}`)
    console.log(`Grupos duplicados al normalizar: ${duplicados.length}`)
    for (const [clave, lista] of duplicados) {
        console.log(`\n  ${clave}`)
        for (const u of lista) {
            console.log(`    - ${u._id}  "${u.correo}"  ${[u.nombre, u.apellido].filter(Boolean).join(' ')}  creado ${u.createdAt?.toISOString?.() || '¿?'}`)
        }
    }
    console.log(`\nCorreos guardados sin normalizar (no duplicados incluidos): ${sinNormalizar.length}`)
    for (const u of sinNormalizar) console.log(`  - ${u._id}  "${u.correo}"`)
    if (duplicados.length) {
        console.log('\n⚠ Hay duplicados: decide manualmente cuál conservar antes de normalizar. Este script no fusiona nada.')
    }
}

try {
    await reportar()
} catch (error) {
    console.error('No se pudo generar el reporte:', error.message)
    process.exitCode = 1
} finally {
    await mongoose.disconnect()
}
