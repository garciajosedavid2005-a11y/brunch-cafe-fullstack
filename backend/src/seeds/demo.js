// 3.5 · Datos de demostración (npm run seed:demo). SOLO para desarrollo: el script se niega en producción
// y esta función solo trabaja sobre el salón de ejemplo (mesas con `ejemplo: true`): si la base de datos ya
// tiene un salón real (alguna mesa que no es de ejemplo), sale sin tocar NADA (ni las semillas base, ni el
// catálogo, ni reservas o pedidos). No borra ni reemplaza nada: solo crea lo que falta (idempotente).
//
// Todo pasa por los mismos servicios que usa la API (permisos, máquinas de estado, transacciones y
// Eventos), así la demo queda coherente con lo que haría el personal:
//   Mesa 1 ocupada con dos rondas (un ítem servido, uno listo, uno en preparación y uno por empezar)
//   Mesa 2 libre (se cobró con tarjeta y se marcó limpia: comprobante 1)
//   Mesa 3 con la cuenta pedida, lista para cobrar en la Caja
//   Mesa 4 libre
//   Mesas 5 + 6 unidas, con una ronda en preparación
//   Mesa 7 por limpiar (se cobró en efectivo con propina: comprobante 2)
//   Un producto agotado, una reserva pendiente para mañana y un pedido a domicilio confirmado.
import { sembrarBase } from './base.js'
import { sembrarMenu } from './menu.js'
import { sembrarModificadoresEjemplo } from './modificadores.js'
import { sembrarSalonEjemplo } from './salon.js'
import { sembrarUsuariosDev } from './dev.js'
import { sembrarMetodosPago } from './metodosPago.js'
import Usuario from '../modulos/identidad/usuario.model.js'
import Producto from '../modulos/catalogo/producto.model.js'
import Mesa from '../modulos/salon/mesa.model.js'
import Zona from '../modulos/salon/zona.model.js'
import Contador from '../modulos/compartido/contador.model.js'
import { conTransaccion } from '../modulos/compartido/transacciones.js'
import Cuenta from '../modulos/salon/cuenta.model.js'
import Comanda from '../modulos/salon/comanda.model.js'
import Reserva from '../modulos/salon/reserva.model.js'
import Pedido from '../modulos/pedidos/pedido.model.js'
import DetallePedido from '../modulos/pedidos/detallePedido.model.js'
import MetodoPago from '../modulos/pedidos/metodoPago.model.js'
import { estadoPorCodigo, registrarEvento, cambiarEstado } from '../modulos/compartido/estados.service.js'
import { fechaLocal, instanteLocal } from '../modulos/compartido/fechas.js'
import {
    abrirCuenta, agregarItem, enviarRonda, solicitarCuenta, cobrarCuenta, cambiarEstadoMesa, unirMesas,
} from '../modulos/salon/cuentas.service.js'
import { cambiarEstadoItem } from '../modulos/cocina/cocina.service.js'
import { cambiarDisponibilidadProducto } from '../modulos/catalogo/agotados.service.js'

const MOTIVO = 'Demostración (seed:demo)'
const CORREO = (rol) => `${rol}.dev@brunchcafe.test`

/** Se niega fuera de desarrollo (lo usa el script antes de conectarse). */
export const exigirEntornoDemo = (env = process.env) => {
    if (env.NODE_ENV === 'production') throw new Error('seed:demo no se ejecuta en producción.')
}

const sesionDe = async (rol) => {
    const u = await Usuario.findOne({ correo: CORREO(rol) }).populate('rol', 'nombre permisos').lean()
    return { id: String(u._id), rol: u.rol.nombre, permisos: u.rol.permisos, estaciones: [] }
}
const version = async (cuentaId) => (await Cuenta.findById(cuentaId).select('version').lean()).version
const itemsDe = async (cuentaId, numeroRonda) =>
    (await Comanda.findOne({ cuenta: cuentaId, numeroRonda }).lean()).items.map((i) => String(i._id))

// ── Salón en servicio ──────────────────────────────────────────────────────────────────
const sembrarSalon = async ({ admin, mesero, cajero }, productos, { alEmpezar, alTerminar }) => {
    const mesas = new Map((await Mesa.find({ ejemplo: true }).lean()).map((m) => [m.numero, String(m._id)]))
    const faltan = [1, 2, 3, 4, 5, 6, 7].filter((n) => !mesas.has(n))
    if (faltan.length) return { salon: 'sin-salon-ejemplo', faltan }
    // Ya hay servicio (de una demo anterior o de uso real): no se toca nada
    if (await Mesa.exists({ estado: { $ne: 'libre' } }) || await Cuenta.exists({ estado: { $in: ['abierta', 'cuenta_pedida'] } })) {
        return { salon: 'con-actividad' }
    }
    const [a, b, c, d] = productos.map((p) => String(p._id))
    await alEmpezar()

    /** Abre la mesa, agrega los productos (uno de cada) y envía la ronda. */
    const ronda = async (cuentaId, ids, numeroRonda) => {
        for (const productoId of ids) await agregarItem(cuentaId, { productoId, cantidad: 1 }, mesero)
        await enviarRonda(cuentaId, { numeroRonda, versionEsperada: await version(cuentaId) }, mesero)
        return itemsDe(cuentaId, numeroRonda)
    }
    const preparar = async (itemId, hasta) => {
        await cambiarEstadoItem(itemId, { de: 'enviado', a: 'en_preparacion' }, admin)
        if (hasta === 'en_preparacion') return
        await cambiarEstadoItem(itemId, { de: 'en_preparacion', a: 'listo' }, admin)
        if (hasta === 'servido') await cambiarEstadoItem(itemId, { de: 'listo', a: 'servido' }, mesero)
    }
    const cobrada = async (numero, comensales, ids, pagos, propina) => {
        const cuenta = await abrirCuenta({ mesaId: mesas.get(numero), comensales }, mesero)
        for (const itemId of await ronda(cuenta.id, ids, 1)) await preparar(itemId, 'servido')
        await solicitarCuenta(cuenta.id, { versionEsperada: await version(cuenta.id) }, mesero)
        const { total } = await Cuenta.findById(cuenta.id).select('total').lean()
        await cobrarCuenta(cuenta.id, { versionEsperada: await version(cuenta.id), propina, pagos: pagos(total + propina) }, cajero)
    }

    // Comprobante 1 (tarjeta, sin propina) y la mesa 2 ya limpia
    await cobrada(2, 2, [a, b], (total) => [{ metodo: 'tarjeta', monto: total }], 0)
    await cambiarEstadoMesa(mesas.get(2), { a: 'libre' }, mesero)
    // Comprobante 2 (efectivo con el 10 % de propina y cambio): la mesa 7 queda por limpiar
    await cobrada(7, 3, [c, d], (total) => [{ metodo: 'efectivo', monto: total, recibido: Math.ceil(total / 10000) * 10000 + 10000 }],
        Math.round(((productos[2].precio + productos[3].precio) * 0.1)))

    // Mesa 1: dos rondas con los ítems en estados distintos
    const uno = await abrirCuenta({ mesaId: mesas.get(1), comensales: 2 }, mesero)
    const [servido, listo] = await ronda(uno.id, [a, b], 1)
    await preparar(servido, 'servido')
    await preparar(listo, 'listo')
    const [enPreparacion] = await ronda(uno.id, [c, d], 2)
    await preparar(enPreparacion, 'en_preparacion') // el otro queda «enviado» (por empezar)

    // Mesa 3: cuenta pedida
    const tres = await abrirCuenta({ mesaId: mesas.get(3), comensales: 4 }, mesero)
    for (const itemId of await ronda(tres.id, [a, c, d], 1)) await preparar(itemId, 'servido')
    await solicitarCuenta(tres.id, { versionEsperada: await version(tres.id) }, mesero)

    // Mesas 5 + 6 unidas (la 6 es la principal) con una ronda en preparación
    const seis = await abrirCuenta({ mesaId: mesas.get(6), comensales: 5 }, mesero)
    await unirMesas({ principalId: mesas.get(6), mesaIds: [mesas.get(5)], versionEsperada: await version(seis.id) }, mesero)
    for (const itemId of await ronda(seis.id, [b, d], 1)) await preparar(itemId, 'en_preparacion')

    await alTerminar()
    return { salon: 'creado', comprobantes: 2 }
}

// ── Reserva y pedido a domicilio del cliente de prueba ─────────────────────────────────
const sembrarReserva = async (cliente) => {
    if (await Reserva.exists({ usuario: cliente._id, motivo: MOTIVO })) return 'existente'
    const manana = fechaLocal(new Date(Date.now() + 86_400_000))
    const pendiente = await estadoPorCodigo('reserva', 'pendiente')
    // Directa al modelo, sin correo (como en las capturas); reserva y Evento en una transacción
    await conTransaccion(async (session) => {
        const [reserva] = await Reserva.create([{
            usuario: cliente._id, estado: pendiente._id, cantidadPersonas: 4,
            fecha: new Date(`${manana}T12:00:00Z`), hora: '10:00', inicio: instanteLocal(manana, '10:00'),
            nombre: 'Cliente Prueba', telefono: '3000000000', motivo: MOTIVO,
        }], { session })
        await registrarEvento({ entidad: 'reserva', entidadId: reserva._id, a: 'pendiente', actor: 'sistema', motivo: MOTIVO, session })
    })
    return 'creada'
}

const sembrarDomicilio = async (cliente, admin, productos) => {
    const [pendiente, confirmado] = await Promise.all([estadoPorCodigo('pedido', 'pendiente'), estadoPorCodigo('pedido', 'confirmado')])
    let pedido = await Pedido.findOne({ usuario: cliente._id, indicaciones: MOTIVO })
    if (pedido && String(pedido.estado) !== String(pendiente._id)) return 'existente'
    let resultado = 'existente'
    if (!pedido) {
        await sembrarMetodosPago()
        const metodo = await MetodoPago.findOne({ codigo: 'contra-entrega' })
        const lineas = productos.slice(0, 2).map((p) => ({ p, cantidad: 2, subtotal: p.precio * 2 }))
        // Pedido, líneas y Evento en una transacción: o queda completo o no queda
        pedido = await conTransaccion(async (session) => {
            const [creado] = await Pedido.create([{
                usuario: cliente._id, estado: pendiente._id, metodoPago: metodo._id,
                total: lineas.reduce((t, l) => t + l.subtotal, 0),
                nombreEntrega: 'Cliente Prueba', direccion: 'Carrera 36B #30-06', barrio: 'Centro',
                horaEntrega: '11:00', indicaciones: MOTIVO,
            }], { session })
            await DetallePedido.insertMany(lineas.map(({ p, cantidad, subtotal }) => ({
                pedido: creado._id, producto: p._id, productoId: p.codigo, nombreProducto: p.nombre,
                precioProducto: p.precio, precioUnitario: p.precio, cantidad, subtotal,
            })), { session })
            await registrarEvento({ entidad: 'pedido', entidadId: creado._id, a: 'pendiente', actor: 'sistema', motivo: MOTIVO, session })
            return creado
        })
        resultado = 'creado'
    }
    // Confirmado por el personal, por la misma máquina de estados que usa el panel (si quedó
    // pendiente por un corte anterior, aquí se completa)
    await cambiarEstado({ tipo: 'pedido', Modelo: Pedido, documento: pedido, a: confirmado.codigo, sesion: admin, contexto: pedido })
    return resultado
}

// Marca de la demo del salón en la colección de contadores: 1 = empezada, 2 = terminada. Una demo cortada
// a mitad no se repite encima (volvería a cobrar y gastaría consecutivos de comprobante)
const MARCA = 'seed-demo'
const marcar = (seq) => Contador.updateOne({ _id: MARCA }, { $set: { seq } }, { upsert: true })

/** ¿Es una BD con personas reales? (usuarios fuera del dominio de prueba): entonces hace falta confirmar. */
const tienePersonasReales = () => Usuario.exists({ correo: { $not: /@brunchcafe\.test$/i } })

/**
 * Prepara la demo sobre la BD conectada. Devuelve qué hizo con cada parte (creado / existente / con-actividad…),
 * para que el script lo cuente. `password` es la de los usuarios *.dev (DEV_USUARIOS_PASSWORD); `confirmado`
 * (--confirmar en el script) hace falta si la BD tiene usuarios reales. Las comprobaciones van antes de
 * cualquier escritura: si alguna falla, no se escribe nada.
 */
export const sembrarDemo = async ({ password, confirmado = false }) => {
    // Con un salón real (mesas propias, o zonas sin las mesas de ejemplo) no se toca nada
    const ejemplo = await Mesa.countDocuments({ ejemplo: true, numero: { $in: [1, 2, 3, 4, 5, 6, 7] } })
    if (await Mesa.exists({ ejemplo: { $ne: true } }) || (await Zona.exists({}) && ejemplo < 7)) return { salon: 'sin-salon-ejemplo' }
    if ((await Contador.findById(MARCA).lean())?.seq === 1) return { salon: 'incompleta' }
    if (!confirmado && await tienePersonasReales()) return { salon: 'requiere-confirmacion' }

    // Semillas base: solo crean lo que falta (seed:base, seed:menu, modificadores y salón de ejemplo,
    // y los usuarios *.dev, cuya contraseña se vuelve a fijar con DEV_USUARIOS_PASSWORD)
    await sembrarBase({}) // sin ADMIN_* del entorno: nunca crea el admin real
    await sembrarMenu()
    await sembrarModificadoresEjemplo()
    await sembrarSalonEjemplo()
    await sembrarUsuariosDev(password)
    const [admin, mesero, cajero] = await Promise.all(['admin', 'mesero', 'cajero'].map(sesionDe))
    const cliente = await Usuario.findOne({ correo: CORREO('cliente') }).select('_id').lean()

    // Productos sencillos (sin modificadores) para las cuentas, y otro distinto para agotar
    const productos = await Producto.find({ disponible: { $ne: false }, 'gruposModificadores.0': { $exists: false } })
        .sort({ codigo: 1 }).limit(5).lean()
    if (productos.length < 5) throw new Error('Hacen falta 5 productos sin modificadores (npm run seed:menu).')
    const [p1, p2, p3, p4, agotable] = productos

    const resultado = await sembrarSalon({ admin, mesero, cajero }, [p1, p2, p3, p4], {
        alEmpezar: () => marcar(1), alTerminar: () => marcar(2),
    })
    // Un producto agotado (si ya hay alguno, no se agota otro)
    let agotado = 'existente'
    if (!(await Producto.exists({ disponible: false }))) {
        await cambiarDisponibilidadProducto(String(agotable._id), { disponible: false }, admin)
        agotado = 'creado'
    }
    return {
        ...resultado,
        agotado,
        reserva: await sembrarReserva(cliente),
        domicilio: await sembrarDomicilio(cliente, admin, [p1, p2]),
    }
}
