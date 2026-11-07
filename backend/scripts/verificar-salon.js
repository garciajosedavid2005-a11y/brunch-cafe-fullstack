// Verificador de consistencia del salón (1.4): cuentas, rondas y mesas. Solo lectura.
// Uso: npm run verificar:salon            (cuentas abiertas + cerradas en las últimas 48 h)
//      npm run verificar:salon -- --horas 720
// Sale con código 1 si encuentra problemas. Solo muestra ids, números de mesa y montos.
import mongoose from 'mongoose'
import { config } from '../src/config.js'
import { verificarConsistenciaSalon } from '../src/modulos/salon/consistencia.js'

// Solo se admite --horas N (un argumento desconocido es un error, no se ignora)
const leerHoras = (argv) => {
    if (argv.length === 0) return null
    const horas = Number(argv[1])
    if (argv.length !== 2 || argv[0] !== '--horas' || !Number.isInteger(horas) || horas < 1) {
        throw new Error('Uso: npm run verificar:salon [-- --horas N] (N entero ≥ 1).')
    }
    return horas
}

try {
    const horas = leerHoras(process.argv.slice(2))
    const opciones = horas ? { desde: new Date(Date.now() - horas * 3600_000) } : {}
    await mongoose.connect(config.MONGO_URI)
    const { ok, revisadas, problemas } = await verificarConsistenciaSalon(opciones)
    console.log(`Revisadas: ${revisadas.cuentas} cuentas, ${revisadas.comandas} rondas, ${revisadas.mesas} mesas.`)
    if (ok) {
        console.log('Sin problemas de consistencia.')
    } else {
        console.log(`${problemas.length} problema(s):`)
        for (const p of problemas) console.log(`- ${p.codigo} · ${p.entidad} ${p.id} · ${p.detalle}`)
        process.exitCode = 1
    }
} catch (error) {
    console.error('No se pudo verificar el salón:', error.message)
    process.exitCode = 1
} finally {
    await mongoose.disconnect()
}
