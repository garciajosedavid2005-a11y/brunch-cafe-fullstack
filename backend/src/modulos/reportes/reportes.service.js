// Fase 5 · 5.6 y 5.7 (F5-9, F5-h) · Reportes de Admin › Reportes, solo con `reporte:ver`. Rango de fechas de
// calendario de Bogotá [desde, hasta] (ambos incluidos); en la BD todo es UTC.
//   Ventas del salón  = ítems no anulados de las rondas enviadas de las cuentas COBRADAS (estado «cerrada»), con la
//                       fecha del cobro (cerradaEn). Las cerradas sin cobro y las canceladas no son venta.
//   Ventas a domicilio = líneas de los pedidos ENTREGADOS, con la fecha del pedido (createdAt).
//   Métodos de pago y propinas: de los comprobantes emitidos en el rango; las notas crédito van aparte (restan).
//   Descuentos (6.7): los de los mismos tickets que las ventas (comprobantes de esas cuentas y descuentos de esos
//                     pedidos), por tipo; ventas netas = ventas − descuentos. Las notas crédito siguen aparte.
// Los montos son enteros en COP. Las consultas leen solo el rango (índices por fecha) y el cálculo se hace aquí:
// el volumen de un café (cientos de cuentas al mes) no justifica un pipeline de agregación más complejo.
import { z } from 'zod'
import Cuenta from '../salon/cuenta.model.js'
import Comanda from '../salon/comanda.model.js'
import Pedido from '../pedidos/pedido.model.js'
import DetallePedido from '../pedidos/detallePedido.model.js'
import Estado from '../compartido/estado.model.js'
import Comprobante from '../caja/comprobante.model.js'
import NotaCredito from '../caja/notaCredito.model.js'
import Producto from '../catalogo/producto.model.js'
import Usuario from '../identidad/usuario.model.js'
import Insumo from '../inventario/insumo.model.js'
import { AppError } from '../compartido/errors.js'
import { esFechaValida, fechaLocal, horaLocal, instanteLocal } from '../compartido/fechas.js'
import { tienePermiso } from '../identidad/permisos.js'
import { validar } from '../salon/cuentas.schema.js'
import { cargarRecetas, consumoUnitario } from '../inventario/recetas.service.js'
import { TIPOS_DESCUENTO } from '../caja/comprobante.model.js'

// 6.7 (F6-7) · Descuentos por tipo, en el orden del modelo
const ETIQUETAS_DESCUENTO = { cumpleanos: 'Cumpleaños', puntos: 'Puntos' }

export const MAX_DIAS_REPORTE = 366
const fecha = (campo) => z.string({ error: `${campo} es requerida` }).refine(esFechaValida, { error: `${campo} no es válida (AAAA-MM-DD)` })
// z.object (no strict): un parámetro extra en la URL (p. ej. contra la caché) se ignora
export const rangoSchema = z.object({ desde: fecha('La fecha inicial'), hasta: fecha('La fecha final') })

const diaSiguiente = (f) => {
    const d = new Date(`${f}T12:00:00Z`)
    d.setUTCDate(d.getUTCDate() + 1)
    return d.toISOString().slice(0, 10)
}
const diasEntre = (a, b) => Math.round((new Date(`${b}T12:00:00Z`) - new Date(`${a}T12:00:00Z`)) / 86400000)

/** Valida el rango y devuelve los instantes UTC [inicio, fin). */
export const leerRango = (sesion, consulta) => {
    if (!tienePermiso(sesion?.permisos || [], 'reporte:ver')) {
        throw new AppError(403, 'FORBIDDEN', 'No tienes permiso para realizar esta acción.', { requiere: ['reporte:ver'] })
    }
    const { desde, hasta } = validar(rangoSchema, consulta)
    if (hasta < desde) throw new AppError(400, 'RANGO_INVALIDO', 'La fecha final no puede ser anterior a la inicial.')
    if (diasEntre(desde, hasta) + 1 > MAX_DIAS_REPORTE) throw new AppError(400, 'RANGO_INVALIDO', `El rango admite hasta ${MAX_DIAS_REPORTE} días.`)
    return { desde, hasta, inicio: instanteLocal(desde, '00:00'), fin: instanteLocal(diaSiguiente(hasta), '00:00') }
}

const nombreCorto = (u) => (u ? [u.nombre, u.apellido?.[0] ? `${u.apellido[0]}.` : ''].filter(Boolean).join(' ') : 'Sin mesero')
const sumar = (mapa, clave, valores) => {
    const actual = mapa.get(clave) || {}
    for (const [k, v] of Object.entries(valores)) actual[k] = (actual[k] || 0) + v
    mapa.set(clave, actual)
}
const ordenarPor = (campo) => (a, b) => b[campo] - a[campo]

/** Líneas vendidas del rango (salón y domicilio) con lo necesario para cada reporte. */
const lineasDeVenta = async ({ inicio, fin }) => {
    const cuentas = await Cuenta.find({ estado: 'cerrada', cerradaEn: { $gte: inicio, $lt: fin } })
        .select('codigo canal mesero mesas abiertaEn cerradaEn total').lean()
    const comandas = cuentas.length
        ? await Comanda.find({ cuenta: { $in: cuentas.map((c) => c._id) }, estado: 'enviada' }).select('cuenta items').lean()
        : []
    const porCuenta = new Map(cuentas.map((c) => [String(c._id), c]))
    const lineas = []
    for (const comanda of comandas) {
        const cuenta = porCuenta.get(String(comanda.cuenta))
        for (const item of comanda.items) {
            if (item.estado === 'anulado') continue
            lineas.push({
                canal: cuenta.canal || 'salon', instante: cuenta.cerradaEn, ticket: `c:${cuenta._id}`, mesero: String(cuenta.mesero), // 6.3 · salón o para llevar
                producto: String(item.producto), nombre: item.nombre, cantidad: item.cantidad, subtotal: item.subtotal,
                modificadores: (item.modificadores || []).map((m) => ({ grupo: m.grupo, opcion: m.opcion })),
            })
        }
    }
    const entregado = await Estado.findOne({ tipo: 'pedido', codigo: 'entregado' }).select('_id').lean()
    const pedidos = entregado
        ? await Pedido.find({ estado: entregado._id, createdAt: { $gte: inicio, $lt: fin } }).select('canal createdAt total descuentos').lean()
        : []
    const detalles = pedidos.length ? await DetallePedido.find({ pedido: { $in: pedidos.map((p) => p._id) } }).lean() : []
    const porPedido = new Map(pedidos.map((p) => [String(p._id), p]))
    for (const d of detalles) {
        const pedido = porPedido.get(String(d.pedido))
        lineas.push({
            canal: pedido.canal, instante: pedido.createdAt, ticket: `p:${pedido._id}`, mesero: null,
            producto: String(d.producto), nombre: d.nombreProducto, cantidad: d.cantidad, subtotal: d.subtotal ?? d.precioProducto * d.cantidad,
            modificadores: (d.modificadores || []).map((m) => ({ grupo: m.grupo, opcion: m.opcion })),
        })
    }
    return { cuentas, pedidos, lineas }
}

const CANALES = [['salon', 'Salón'], ['domicilio', 'Domicilio'], ['para_llevar', 'Para llevar']]

/** 5.6 · Ventas: resumen, por día, franja, producto, categoría, canal, mesero y método de pago. */
export const reporteVentas = async (sesion, consulta) => {
    const rango = leerRango(sesion, consulta)
    const { cuentas, pedidos, lineas } = await lineasDeVenta(rango)
    const [comprobantes, notas] = await Promise.all([
        Comprobante.find({ emitidoEn: { $gte: rango.inicio, $lt: rango.fin } }).select('propina pagos mesero total').lean(),
        NotaCredito.find({ emitidaEn: { $gte: rango.inicio, $lt: rango.fin } }).select('total pagos').lean(),
    ])

    const ventas = lineas.reduce((t, l) => t + l.subtotal, 0)
    const tickets = cuentas.length + pedidos.length
    const propinas = comprobantes.reduce((t, c) => t + c.propina, 0)
    const devuelto = notas.reduce((t, n) => t + n.total, 0)
    // 6.7 · Descuentos de los mismos tickets que las ventas: los comprobantes de esas cuentas y los de esos pedidos
    const deCuentas = cuentas.length ? await Comprobante.find({ cuenta: { $in: cuentas.map((c) => c._id) } }).select('descuentos').lean() : []
    const porDescuento = new Map(TIPOS_DESCUENTO.map((t) => [t, { monto: 0, cantidad: 0 }]))
    for (const ticket of [...deCuentas, ...pedidos]) for (const d of ticket.descuentos || []) sumar(porDescuento, d.tipo, { monto: d.monto, cantidad: 1 })
    const descuentos = [...porDescuento.values()].reduce((t, v) => t + v.monto, 0)

    // Por día (todos los días del rango, también los que no vendieron) y por franja horaria
    const porDia = new Map()
    for (let f = rango.desde; f <= rango.hasta; f = diaSiguiente(f)) porDia.set(f, { salon: 0, domicilio: 0, para_llevar: 0, tickets: 0 })
    const porHora = new Map()
    const ticketsVistos = new Set()
    for (const l of lineas) {
        const dia = fechaLocal(l.instante)
        const hora = Number(horaLocal(l.instante).slice(0, 2))
        const nuevo = !ticketsVistos.has(l.ticket)
        ticketsVistos.add(l.ticket)
        sumar(porDia, dia, { [l.canal]: l.subtotal, tickets: nuevo ? 1 : 0 })
        sumar(porHora, hora, { ventas: l.subtotal, tickets: nuevo ? 1 : 0 })
    }

    // Por producto y categoría
    const productos = await Producto.find({ _id: { $in: [...new Set(lineas.map((l) => l.producto))] } }).populate('categoria', 'nombre').select('nombre categoria').lean()
    const categoriaDe = new Map(productos.map((p) => [String(p._id), p.categoria?.nombre || 'Sin categoría']))
    const porProducto = new Map()
    const porCategoria = new Map()
    for (const l of lineas) {
        sumar(porProducto, l.producto, { cantidad: l.cantidad, ventas: l.subtotal })
        porProducto.get(l.producto).nombre ??= l.nombre
        sumar(porCategoria, categoriaDe.get(l.producto) || 'Sin categoría', { cantidad: l.cantidad, ventas: l.subtotal })
    }

    // Por canal
    const porCanal = new Map(CANALES.map(([c]) => [c, { ventas: 0, tickets: 0 }]))
    for (const c of cuentas) sumar(porCanal, c.canal || 'salon', { tickets: 1 }) // 6.3 · salón o para llevar
    for (const p of pedidos) sumar(porCanal, p.canal, { tickets: 1 })
    for (const l of lineas) sumar(porCanal, l.canal, { ventas: l.subtotal })

    // Por mesero (cuentas cobradas; propinas de sus comprobantes)
    const porMesero = new Map()
    for (const c of cuentas) sumar(porMesero, String(c.mesero), { cuentas: 1 })
    for (const l of lineas.filter((x) => x.mesero)) sumar(porMesero, l.mesero, { ventas: l.subtotal })
    for (const c of comprobantes.filter((x) => x.mesero?.id)) sumar(porMesero, String(c.mesero.id), { propinas: c.propina })
    const usuarios = await Usuario.find({ _id: { $in: [...porMesero.keys()] } }).select('nombre apellido').lean()
    const nombreDe = new Map(usuarios.map((u) => [String(u._id), nombreCorto(u)]))

    // Por método de pago: lo cobrado (montos aplicados) menos lo devuelto con notas crédito
    const porMetodo = new Map(['efectivo', 'tarjeta', 'transferencia'].map((m) => [m, { cobrado: 0, devuelto: 0, pagos: 0 }]))
    for (const c of comprobantes) for (const p of c.pagos) sumar(porMetodo, p.metodo, { cobrado: p.monto, pagos: 1 })
    for (const n of notas) for (const p of n.pagos) sumar(porMetodo, p.metodo, { devuelto: p.monto })

    return {
        rango: { desde: rango.desde, hasta: rango.hasta },
        resumen: {
            ventas, tickets, cuentas: cuentas.length, pedidos: pedidos.length,
            ticketPromedio: tickets ? Math.round(ventas / tickets) : 0,
            propinas, notasCredito: devuelto, comprobantes: comprobantes.length,
            descuentos, ventasNetas: ventas - descuentos, // 6.7
        },
        porDescuento: [...porDescuento].map(([tipo, v]) => ({ tipo, etiqueta: ETIQUETAS_DESCUENTO[tipo] || tipo, monto: v.monto, cantidad: v.cantidad })),
        porDia: [...porDia].map(([f, v]) => ({ fecha: f, salon: v.salon || 0, domicilio: v.domicilio || 0, paraLlevar: v.para_llevar || 0, total: (v.salon || 0) + (v.domicilio || 0) + (v.para_llevar || 0), tickets: v.tickets || 0 })),
        porFranja: [...porHora].sort((a, b) => a[0] - b[0]).map(([h, v]) => ({ hora: h, franja: `${String(h).padStart(2, '0')}:00–${String(h + 1).padStart(2, '0')}:00`, ventas: v.ventas, tickets: v.tickets })),
        porProducto: [...porProducto].map(([id, v]) => ({ id, nombre: v.nombre, categoria: categoriaDe.get(id) || 'Sin categoría', cantidad: v.cantidad, ventas: v.ventas })).sort(ordenarPor('ventas')),
        porCategoria: [...porCategoria].map(([nombre, v]) => ({ categoria: nombre, cantidad: v.cantidad, ventas: v.ventas })).sort(ordenarPor('ventas')),
        porCanal: CANALES.map(([c, etiqueta]) => ({ canal: c, etiqueta, ventas: porCanal.get(c)?.ventas || 0, tickets: porCanal.get(c)?.tickets || 0, disponible: true })), // 6.3 · para llevar ya es real
        porMesero: [...porMesero].map(([id, v]) => ({ id, mesero: nombreDe.get(id) || 'Usuario eliminado', cuentas: v.cuentas || 0, ventas: v.ventas || 0, propinas: v.propinas || 0, ticketPromedio: v.cuentas ? Math.round((v.ventas || 0) / v.cuentas) : 0 })).sort(ordenarPor('ventas')),
        porMetodo: [...porMetodo].map(([metodo, v]) => ({ metodo, pagos: v.pagos, cobrado: v.cobrado, devuelto: v.devuelto, neto: v.cobrado - v.devuelto })),
    }
}

/** Percentil p (0–100) con interpolación lineal sobre valores ordenados. */
export const percentil = (ordenados, p) => {
    if (!ordenados.length) return null
    const pos = (ordenados.length - 1) * (p / 100)
    const bajo = Math.floor(pos)
    const alto = Math.ceil(pos)
    return ordenados[bajo] + (ordenados[alto] - ordenados[bajo]) * (pos - bajo)
}
const minutos = (ms) => Math.round((ms / 60000) * 10) / 10

/** 5.7 · Operación: rotación de mesas, tiempos de preparación por estación y costo frente a venta por producto. */
export const reporteOperacion = async (sesion, consulta) => {
    const rango = leerRango(sesion, consulta)

    // Rotación: cuentas cerradas (cobradas o sin cobro) abiertas en el rango, por mesa, y su tiempo de ocupación
    const ocupaciones = await Cuenta.find({ estado: { $in: ['cerrada', 'cerrada_sin_cobro'] }, abiertaEn: { $gte: rango.inicio, $lt: rango.fin } })
        .select('mesas abiertaEn cerradaEn').lean()
    const porMesa = new Map()
    for (const c of ocupaciones) {
        const duracion = c.cerradaEn - c.abiertaEn
        for (const m of c.mesas) {
            const clave = String(m.mesa)
            const actual = porMesa.get(clave) || { numero: m.numero, nombre: m.nombre || '', zona: m.zonaNombre || '', cuentas: 0, totalMs: 0 }
            actual.cuentas += 1
            actual.totalMs += duracion
            porMesa.set(clave, actual)
        }
    }
    const dias = diasEntre(rango.desde, rango.hasta) + 1
    const rotacion = [...porMesa.values()]
        .map((m) => ({ mesa: m.numero, nombre: m.nombre, zona: m.zona, cuentas: m.cuentas, cuentasPorDia: Math.round((m.cuentas / dias) * 100) / 100, ocupacionMediaMin: minutos(m.totalMs / m.cuentas) }))
        .sort((a, b) => a.mesa - b.mesa)

    // Tiempos por estación: ítems de las rondas enviadas en el rango que llegaron a «listo»
    const comandas = await Comanda.find({ estado: 'enviada', enviadaEn: { $gte: rango.inicio, $lt: rango.fin } }).select('enviadaEn items').lean()
    const porEstacion = new Map()
    for (const c of comandas) {
        for (const i of c.items) {
            if (!i.listoEn) continue
            const clave = i.estacion?.codigo || 'sin_estacion'
            const actual = porEstacion.get(clave) || { estacion: i.estacion?.nombre || 'Sin estación', espera: [], preparacion: [] }
            actual.espera.push(minutos(i.listoEn - c.enviadaEn))
            if (i.iniciadoEn) actual.preparacion.push(minutos(i.listoEn - i.iniciadoEn))
            porEstacion.set(clave, actual)
        }
    }
    const resumenTiempos = (v) => {
        const o = [...v].sort((a, b) => a - b)
        return { mediana: o.length ? minutos(percentil(o, 50) * 60000) : null, p90: o.length ? minutos(percentil(o, 90) * 60000) : null }
    }
    const tiempos = [...porEstacion].map(([codigo, v]) => ({
        codigo, estacion: v.estacion, items: v.espera.length,
        espera: resumenTiempos(v.espera), // de enviado a listo (lo que espera la mesa)
        preparacion: resumenTiempos(v.preparacion), // de «en preparación» a listo
    })).sort((a, b) => a.estacion.localeCompare(b.estacion, 'es'))

    // Costo frente a venta: el consumo de cada línea vendida según la receta (con sus opciones) × costo promedio actual
    const { lineas } = await lineasDeVenta(rango)
    const recetas = await cargarRecetas({
        productos: [...new Set(lineas.map((l) => l.producto))],
        opciones: lineas.flatMap((l) => l.modificadores),
    })
    const insumos = new Map((await Insumo.find().select('costoPromedio').lean()).map((i) => [String(i._id), i.costoPromedio]))
    const porProducto = new Map()
    for (const l of lineas) {
        const consumo = consumoUnitario(l, recetas)
        const costo = [...consumo].reduce((t, [insumo, c]) => t + c * (insumos.get(insumo) || 0), 0) * l.cantidad
        const actual = porProducto.get(l.producto) || { nombre: l.nombre, cantidad: 0, ventas: 0, costo: 0, conReceta: recetas.porProducto.has(l.producto) }
        actual.cantidad += l.cantidad
        actual.ventas += l.subtotal
        actual.costo += costo
        porProducto.set(l.producto, actual)
    }
    const margenes = [...porProducto].map(([id, v]) => {
        const costo = Math.round(v.costo)
        return {
            id, nombre: v.nombre, cantidad: v.cantidad, ventas: v.ventas, costo, margen: v.ventas - costo,
            margenPct: v.ventas ? Math.round(((v.ventas - costo) / v.ventas) * 1000) / 10 : 0, conReceta: v.conReceta,
        }
    }).sort(ordenarPor('margen'))
    const totales = margenes.reduce((t, m) => ({ ventas: t.ventas + m.ventas, costo: t.costo + m.costo }), { ventas: 0, costo: 0 })

    return {
        rango: { desde: rango.desde, hasta: rango.hasta },
        rotacion,
        tiempos,
        margenes,
        totalesMargen: { ...totales, margen: totales.ventas - totales.costo, margenPct: totales.ventas ? Math.round(((totales.ventas - totales.costo) / totales.ventas) * 1000) / 10 : 0 },
    }
}
