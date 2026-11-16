import mongoose from 'mongoose'
import { sembrarBase } from './base.js'
import { sembrarMenu } from './menu.js'
import { sembrarModificadoresEjemplo } from './modificadores.js'
import { sembrarSalonEjemplo } from './salon.js'
import { sembrarUsuariosDev } from './dev.js'
import { sembrarInventarioEjemplo, sembrarComprasEjemplo } from './inventario.js'
import Usuario from '../modulos/identidad/usuario.model.js'
import Reserva from '../modulos/salon/reserva.model.js'
import Espera from '../modulos/salon/espera.model.js'
import { fechaLocal, instanteLocal } from '../modulos/compartido/fechas.js'
import { estadoPorCodigo, registrarEvento } from '../modulos/compartido/estados.service.js'
import Mesa from '../modulos/salon/mesa.model.js'
import Cuenta from '../modulos/salon/cuenta.model.js'
import Comanda from '../modulos/salon/comanda.model.js'
import Evento from '../modulos/compartido/evento.model.js'
import { conTransaccion } from '../modulos/compartido/transacciones.js'
import Producto from '../modulos/catalogo/producto.model.js'
import { abrirCuenta, agregarItem, enviarRonda, solicitarCuenta, cancelarCuenta, cambiarEstadoMesa, cobrarCuenta } from '../modulos/salon/cuentas.service.js'
import Comprobante from '../modulos/caja/comprobante.model.js'
import { abrirTurno, cerrarTurno } from '../modulos/caja/turno.service.js'

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
    await sembrarInventarioEjemplo() // Fase 5
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
    await sembrarReservasDeHoy()
    // Fase 5 · Compras con lotes por vencer (alertas) y ventas de la última semana (reportes)
    await sembrarComprasEjemplo(await Usuario.findOne({ correo: 'admin.dev@brunchcafe.test' }).select('_id').lean())
    await sembrarVentasDeEjemplo()
    return { usuarios }
}

/**
 * Fase 4 · Agenda de hoy (las capturas corren a las 6:00 a. m.): Laura (8:00, 2 personas, confirmada, en la
 * mesa 2, libre) y Martín (9:00, 3 personas, pendiente y sin mesa). Registradas por el mesero (sin correo).
 */
const sembrarReservasDeHoy = async () => {
    const mesero = await Usuario.findOne({ correo: 'mesero.dev@brunchcafe.test' }).select('_id').lean()
    const hoy = fechaLocal()
    const mesa2 = await Mesa.findOne({ numero: 2 }).select('_id').lean()
    const datos = [
        { nombre: 'Laura Gómez', telefono: '3001112233', cantidadPersonas: 2, hora: '08:00', estado: 'confirmada', mesa: mesa2?._id ?? null, motivo: 'Desayuno de trabajo' },
        { nombre: 'Martín Ruiz', telefono: '3004445566', cantidadPersonas: 3, hora: '09:00', estado: 'pendiente', mesa: null, motivo: 'Cumpleaños' },
    ]
    for (const { estado, hora, ...resto } of datos) {
        const reserva = await Reserva.create({
            ...resto, usuario: null, registradaPor: mesero._id, estado: (await estadoPorCodigo('reserva', estado))._id,
            fecha: new Date(`${hoy}T12:00:00Z`), hora, inicio: instanteLocal(hoy, hora),
        })
        await registrarEvento({ entidad: 'reserva', entidadId: reserva._id, a: estado, actor: 'sistema', motivo: 'capturas' })
    }
    // 4.4 · Lista de espera de hoy: Pedro (3, llegó hace 12 min) y Sofía (2, hace 5 min)
    for (const [nombre, personas, telefono, minutos] of [['Pedro Gómez', 3, '3105556677', 12], ['Sofía Vargas', 2, '3157778899', 5]]) {
        const llegada = new Date(Date.now() - minutos * 60_000)
        const [espera] = await Espera.create([{ nombre, personas, telefono, estado: 'esperando', dia: hoy, creadaPor: mesero._id, createdAt: llegada, updatedAt: llegada }], { timestamps: false })
        await registrarEvento({ entidad: 'espera', entidadId: espera._id, tipo: 'espera_agregada', actor: 'sistema', motivo: 'capturas', datos: { personas } })
    }
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
            [{ $set: { createdAt: menos('createdAt') } }],
            // Solo la BD de capturas: los Eventos son inmutables (1.15) y esto es explícito
            { session, updatePipeline: true, modificarEventos: 'capturas: salón de ejemplo «hace N minutos»' },
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

/**
 * Fase 5 · Ventas de los últimos 7 días para las capturas de Admin › Reportes (solo la BD de capturas): un turno
 * que se abre y se cierra, y 9 cuentas en la mesa 5 cobradas con el servicio de la caja (efectivo y tarjeta, con
 * propina), con ítems listos para los tiempos de preparación. Después se «atrasan» días y horas con el driver
 * directo (los comprobantes son inmutables: esto solo existe en la BD de capturas).
 */
const sembrarVentasDeEjemplo = async () => {
    const mesero = await Usuario.findOne({ correo: 'mesero.dev@brunchcafe.test' }).populate('rol', 'nombre permisos').lean()
    const cajero = await Usuario.findOne({ correo: 'cajero.dev@brunchcafe.test' }).populate('rol', 'nombre permisos').lean()
    const sesion = { id: String(mesero._id), rol: mesero.rol.nombre, permisos: mesero.rol.permisos }
    const caja = { id: String(cajero._id), rol: cajero.rol.nombre, permisos: cajero.rol.permisos }
    const mesa5 = String((await Mesa.findOne({ numero: 5 }).select('_id').lean())._id)
    const productos = await Producto.find({ disponible: { $ne: false }, 'gruposModificadores.0': { $exists: false } }).sort({ codigo: 1 }).limit(4).lean()
    // [días atrás, hora de Bogotá, ítems (índice de producto × cantidad), método, propina, minutos de preparación]
    const ventas = [
        [6, '08:15', [[0, 2], [1, 1]], 'efectivo', 3000, 9], [5, '09:40', [[2, 1]], 'tarjeta', 0, 14], [4, '10:30', [[0, 1], [3, 2]], 'tarjeta', 2000, 11],
        [3, '08:50', [[1, 2]], 'efectivo', 0, 7], [2, '11:20', [[0, 3], [2, 1]], 'tarjeta', 5000, 18], [2, '12:45', [[3, 1]], 'efectivo', 0, 6],
        [1, '09:05', [[1, 1], [2, 2]], 'efectivo', 2500, 12], [1, '10:10', [[0, 2]], 'tarjeta', 0, 10], [0, '07:30', [[3, 2], [1, 1]], 'efectivo', 1000, 8],
    ]
    const contado = { efectivo: 100000, tarjeta: 0, transferencia: 0 }
    await abrirTurno({ base: 100000 }, caja)
    for (const [dias, hora, items, metodo, propina, prep] of ventas) {
        const cuenta = await abrirCuenta({ mesaId: mesa5, comensales: 2 }, sesion)
        for (const [i, cantidad] of items) await agregarItem(cuenta.id, { productoId: String(productos[i]._id), cantidad }, sesion)
        await enviarRonda(cuenta.id, { numeroRonda: 1, versionEsperada: (await Cuenta.findById(cuenta.id).lean()).version }, sesion)
        await solicitarCuenta(cuenta.id, { versionEsperada: (await Cuenta.findById(cuenta.id).lean()).version }, sesion)
        const { version, total } = await Cuenta.findById(cuenta.id).lean()
        const monto = total + propina
        const { comprobante } = await cobrarCuenta(cuenta.id, { versionEsperada: version, propina, pagos: [{ metodo, monto, ...(metodo === 'efectivo' ? { recibido: monto } : {}) }] }, caja)
        contado[metodo] += monto
        await cambiarEstadoMesa(mesa5, { a: 'libre' }, sesion)

        // Llevar la cuenta a ese día y hora: abierta 50 min antes del cobro; ronda enviada 5 min después de abrir
        const cobro = instanteLocal(fechaLocal(new Date(Date.now() - dias * 86_400_000)), hora)
        const abierta = new Date(cobro.getTime() - 50 * 60_000)
        const enviada = new Date(abierta.getTime() + 5 * 60_000)
        const listo = new Date(enviada.getTime() + (prep + 3) * 60_000)
        const id = new mongoose.Types.ObjectId(cuenta.id)
        await Cuenta.collection.updateOne({ _id: id }, { $set: { abiertaEn: abierta, cerradaEn: cobro } })
        const comanda = await Comanda.findOne({ cuenta: id }).lean()
        const tiempos = {}
        comanda.items.forEach((_, n) => Object.assign(tiempos, {
            [`items.${n}.estado`]: 'servido', [`items.${n}.iniciadoEn`]: new Date(listo.getTime() - prep * 60_000), [`items.${n}.iniciadoPor`]: mesero._id,
            [`items.${n}.listoEn`]: listo, [`items.${n}.listoPor`]: mesero._id, [`items.${n}.servidoEn`]: new Date(listo.getTime() + 2 * 60_000), [`items.${n}.servidoPor`]: mesero._id,
        }))
        await Comanda.collection.updateOne({ _id: comanda._id }, { $set: { enviadaEn: enviada, ...tiempos } })
        await Comprobante.collection.updateOne({ _id: new mongoose.Types.ObjectId(comprobante.id) }, { $set: { emitidoEn: cobro } })
    }
    await cerrarTurno({ contado, nota: 'Turno de ejemplo de las capturas' }, caja)
}

/** Vacía la BD de capturas (solo esa) y la vuelve a sembrar. */
export const prepararBdCapturas = async ({ password }) => {
    exigirBdCapturas(mongoose.connection.db.databaseName)
    await mongoose.connection.dropDatabase()
    await mongoose.connection.syncIndexes() // índices únicos antes de sembrar
    return sembrarDatosCapturas({ password })
}
