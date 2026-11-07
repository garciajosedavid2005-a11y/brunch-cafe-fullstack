import mongoose from 'mongoose'
import { sembrarBase } from './base.js'
import { sembrarMenu } from './menu.js'
import { sembrarModificadoresEjemplo } from './modificadores.js'
import { sembrarSalonEjemplo } from './salon.js'
import { sembrarUsuariosDev } from './dev.js'
import Usuario from '../modulos/identidad/usuario.model.js'
import Reserva from '../modulos/salon/reserva.model.js'
import { instanteLocal } from '../modulos/compartido/fechas.js'
import { estadoPorCodigo, registrarEvento } from '../modulos/compartido/estados.service.js'

// 1.3b · BD propia de `npm run capturas` (decisión de Brayan, 2026-11-07): se prepara desde cero en
// cada ejecución con los seeds y los usuarios *.dev, sin datos personales. Nunca toca la BD de
// trabajo: solo se vacía una BD que se llame exactamente BD_CAPTURAS.
export const BD_CAPTURAS = 'brunch-cafe-capturas'

/** Misma conexión (host, opciones) que la BD de trabajo, con otra base de datos. */
export const uriDeCapturas = (uri) => {
    const m = String(uri).match(/^(mongodb(?:\+srv)?:\/\/[^/?]+)(?:\/[^?]*)?(\?.*)?$/)
    if (!m) throw new Error('MONGO_URI no tiene el formato mongodb://host[:puerto]/base[?opciones].')
    return `${m[1]}/${BD_CAPTURAS}${m[2] || ''}`
}

export const exigirBdCapturas = (nombre) => {
    if (nombre !== BD_CAPTURAS) {
        throw new Error(`Solo se prepara la BD «${BD_CAPTURAS}» (conectada a «${nombre}»): las capturas nunca tocan la BD de trabajo.`)
    }
}

// Próximo día hábil a una semana, en Bogotá (fecha de calendario YYYY-MM-DD)
const diaHabilEnUnaSemana = () => {
    const d = new Date(Date.now() + 7 * 86400000)
    while ([0, 6].includes(d.getUTCDay())) d.setUTCDate(d.getUTCDate() + 1)
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(d)
}

/**
 * Siembra la BD conectada: base sin el admin del .env (nunca el admin real), menú con estaciones,
 * modificadores y salón de ejemplo, y con contraseña los usuarios *.dev con un pedido y una reserva.
 */
export const sembrarDatosCapturas = async ({ password }) => {
    await sembrarBase({}) // sin ADMIN_*: el primer admin se omite
    await sembrarMenu()
    await sembrarModificadoresEjemplo()
    await sembrarSalonEjemplo()
    if (!password) return { usuarios: 0 }

    const { usuarios } = await sembrarUsuariosDev(password)
    // Reserva pendiente del cliente de prueba. Directa al modelo (no por el servicio): así no se
    // envía ningún correo de confirmación al preparar las capturas
    const cliente = await Usuario.findOne({ correo: 'cliente.dev@brunchcafe.test' }).select('_id').lean()
    const fecha = diaHabilEnUnaSemana()
    const pendiente = await estadoPorCodigo('reserva', 'pendiente')
    const reserva = await Reserva.create({
        usuario: cliente._id, estado: pendiente._id, cantidadPersonas: 2,
        fecha: new Date(`${fecha}T12:00:00Z`), hora: '10:00', inicio: instanteLocal(fecha, '10:00'),
        nombre: 'Cliente Prueba', telefono: '3000000000', motivo: 'Desayuno de prueba',
    })
    await registrarEvento({ entidad: 'reserva', entidadId: reserva._id, a: 'pendiente', actor: 'sistema', motivo: 'capturas' })
    return { usuarios }
}

/** Vacía la BD de capturas (solo esa) y la vuelve a sembrar. */
export const prepararBdCapturas = async ({ password }) => {
    exigirBdCapturas(mongoose.connection.db.databaseName)
    await mongoose.connection.dropDatabase()
    await mongoose.connection.syncIndexes() // índices únicos antes de sembrar
    return sembrarDatosCapturas({ password })
}
