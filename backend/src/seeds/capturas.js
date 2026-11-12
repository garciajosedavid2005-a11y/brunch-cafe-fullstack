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
import Mesa from '../modulos/salon/mesa.model.js'
import Cuenta from '../modulos/salon/cuenta.model.js'
import Comanda from '../modulos/salon/comanda.model.js'
import Evento from '../modulos/compartido/evento.model.js'
import { conTransaccion } from '../modulos/compartido/transacciones.js'
import Producto from '../modulos/catalogo/producto.model.js'
import { abrirCuenta, agregarItem, enviarRonda, solicitarCuenta, cancelarCuenta, cambiarEstadoMesa } from '../modulos/salon/cuentas.service.js'

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
 * Solo para la BD de capturas (la llama prepararBdCapturas, que lo comprueba) y los tests, cada uno
 * con su BD: no la llames directamente sobre otra base, porque también abre cuentas y cambia mesas.
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
    await sembrarSalonEnServicio()
    return { usuarios }
}

/**
 * 1.6 · Salón en servicio para las capturas del plano, con el mismo servicio que usa la API:
 * mesa 1 abierta con una ronda enviada (hace 35 min), mesa 3 con la cuenta pedida (hace 80 min),
 * mesa 6 abierta sin pedir, mesa 4 bloqueada y mesa 7 por limpiar (cuenta cancelada).
 */
const sembrarSalonEnServicio = async () => {
    const mesero = await Usuario.findOne({ correo: 'mesero.dev@brunchcafe.test' }).populate('rol', 'nombre permisos').lean()
    const admin = await Usuario.findOne({ correo: 'admin.dev@brunchcafe.test' }).select('_id').lean()
    const sesion = { id: String(mesero._id), rol: mesero.rol.nombre, permisos: mesero.rol.permisos }
    const sesionAdmin = { id: String(admin._id), rol: 'admin', permisos: ['*'] }
    const mesa = async (numero) => {
        const encontrada = await Mesa.findOne({ numero }).select('_id').lean()
        if (!encontrada) throw new Error(`Capturas: falta la mesa ${numero} del salón de ejemplo.`)
        return String(encontrada._id)
    }
    const productos = await Producto.find({ disponible: { $ne: false }, 'gruposModificadores.0': { $exists: false } }).sort({ codigo: 1 }).limit(2).lean()
    if (productos.length < 2) throw new Error('Capturas: hacen falta 2 productos disponibles sin modificadores (seed:menu).')

    // «Hace N minutos»: corre a la vez la apertura, la ronda y sus Eventos (el historial sigue
    // coherente con la cuenta) y toca la versión, como cualquier cambio de la cuenta
    const atrasar = (cuentaId, mesaId, minutos) => conTransaccion(async (session) => {
        const ms = minutos * 60_000
        const menos = (campo) => ({ $subtract: [`$${campo}`, ms] })
        await Cuenta.updateOne({ _id: cuentaId }, [{ $set: { abiertaEn: menos('abiertaEn'), version: { $add: ['$version', 1] } } }], { session, updatePipeline: true })
        await Comanda.updateMany({ cuenta: cuentaId }, [{ $set: { enviadaEn: menos('enviadaEn') } }], { session, updatePipeline: true })
        await Evento.updateMany(
            { $or: [{ entidad: 'cuenta', entidadId: cuentaId }, { entidad: 'mesa', entidadId: mesaId }] },
            [{ $set: { createdAt: menos('createdAt') } }], { session, updatePipeline: true },
        )
    })

    const conRonda = async (numero, comensales, minutos) => {
        const mesaId = await mesa(numero)
        const cuenta = await abrirCuenta({ mesaId, comensales }, sesion)
        for (const p of productos) await agregarItem(cuenta.id, { productoId: String(p._id), cantidad: 1 }, sesion)
        const actual = await Cuenta.findById(cuenta.id).lean()
        await enviarRonda(cuenta.id, { numeroRonda: 1, versionEsperada: actual.version }, sesion)
        await atrasar(new mongoose.Types.ObjectId(cuenta.id), new mongoose.Types.ObjectId(mesaId), minutos)
        const { version } = await Cuenta.findById(cuenta.id).select('version').lean()
        return { id: cuenta.id, version }
    }
    await conRonda(1, 2, 35)
    const pedida = await conRonda(3, 4, 80)
    await solicitarCuenta(pedida.id, { versionEsperada: pedida.version }, sesion)
    await abrirCuenta({ mesaId: await mesa(6), comensales: 3 }, sesion)
    await cambiarEstadoMesa(await mesa(4), { a: 'bloqueada', motivo: 'Mantenimiento' }, sesionAdmin)
    const cancelada = await abrirCuenta({ mesaId: await mesa(7), comensales: 2 }, sesion)
    await cancelarCuenta(cancelada.id, { motivo: 'Se fueron sin pedir', versionEsperada: cancelada.version }, sesion)
}

/** Vacía la BD de capturas (solo esa) y la vuelve a sembrar. */
export const prepararBdCapturas = async ({ password }) => {
    exigirBdCapturas(mongoose.connection.db.databaseName)
    await mongoose.connection.dropDatabase()
    await mongoose.connection.syncIndexes() // índices únicos antes de sembrar
    return sembrarDatosCapturas({ password })
}
