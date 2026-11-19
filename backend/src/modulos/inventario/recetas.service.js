// Fase 5 · 5.2 (F5-2) · Recetas de productos y de opciones de modificadores, y el cálculo del consumo de un
// ítem (lo usa el descuento de 5.3 y el costo de los reportes de 5.7).
import mongoose from 'mongoose'
import { z } from 'zod'
import Receta, { MAX_LINEAS_RECETA, MAX_MERMA } from './receta.model.js'
import Insumo, { COLACION_INSUMO } from './insumo.model.js'
import Producto from '../catalogo/producto.model.js'
import GrupoModificadores from '../catalogo/grupoModificadores.model.js'
import { AppError } from '../compartido/errors.js'
import { registrarEvento } from '../compartido/estados.service.js'
import { conTransaccion } from '../compartido/transacciones.js'
import { validar } from '../salon/cuentas.schema.js'
import { redondear } from './cantidades.js'
import { cantidad, id } from './inventario.schema.js'
import { exigirPermiso } from './insumos.service.js'
import { actorDe } from './movimientos.service.js'

const LECTURA = ['inventario:ver', 'inventario:gestionar', 'inventario:ajustar', 'compra:gestionar', 'compra:recibir']

const lineaEntrada = z.strictObject({
    insumoId: id('El insumo'),
    cantidad: cantidad('La cantidad', { positiva: true }),
    merma: cantidad('La merma', { max: MAX_MERMA, decimales: 1 }).optional(),
    reemplazaId: id('El insumo reemplazado').nullable().optional(),
})
export const recetaSchema = z.strictObject({
    lineas: z.array(lineaEntrada, { error: 'Las líneas de la receta no son válidas' })
        .max(MAX_LINEAS_RECETA, { error: `Una receta admite hasta ${MAX_LINEAS_RECETA} insumos` }),
    versionEsperada: z.number().int().min(0).optional(),
})

const claveOpcion = (grupo, opcion) => `${grupo}|${opcion}`
const factor = (l) => 1 + (l.merma || 0) / 100

/** Recetas de esos productos y de esas opciones: { porProducto: Map, porOpcion: Map }. */
export const cargarRecetas = async ({ productos = [], opciones = [] }, session = null) => {
    const filtros = []
    if (productos.length) filtros.push({ tipo: 'producto', producto: { $in: productos } })
    if (opciones.length) filtros.push({ tipo: 'opcion', $or: opciones.map(({ grupo, opcion }) => ({ grupo, opcion })) })
    const recetas = filtros.length ? await Receta.find({ $or: filtros }).session(session).lean() : []
    const porProducto = new Map()
    const porOpcion = new Map()
    for (const r of recetas) {
        if (r.tipo === 'producto') porProducto.set(String(r.producto), r)
        else porOpcion.set(claveOpcion(r.grupo, r.opcion), r)
    }
    return { porProducto, porOpcion }
}

/**
 * Consumo de UNA unidad de un producto con sus opciones: Map insumo → cantidad (con la merma).
 * Las opciones primero quitan el insumo que reemplazan (si está en la receta) y luego suman sus líneas.
 */
export const consumoUnitario = ({ producto, modificadores = [] }, { porProducto, porOpcion }) => {
    const consumo = new Map()
    for (const l of porProducto.get(String(producto))?.lineas || []) consumo.set(String(l.insumo), l.cantidad * factor(l))
    const lineasOpciones = modificadores.flatMap((m) => porOpcion.get(claveOpcion(m.grupo, m.opcion))?.lineas || [])
    for (const l of lineasOpciones) if (l.reemplaza) consumo.delete(String(l.reemplaza))
    for (const l of lineasOpciones) {
        const clave = String(l.insumo)
        consumo.set(clave, (consumo.get(clave) || 0) + l.cantidad * factor(l))
    }
    return consumo
}

/** Consumo total de varias líneas [{ producto, cantidad, modificadores }]: [{ insumo, cantidad }] (positivas). */
export const consumoDeLineas = async (lineas, session = null) => {
    const recetas = await cargarRecetas({
        productos: [...new Set(lineas.map((l) => String(l.producto)))],
        opciones: lineas.flatMap((l) => (l.modificadores || []).map((m) => ({ grupo: m.grupo, opcion: m.opcion }))),
    }, session)
    const total = new Map()
    for (const linea of lineas) {
        for (const [insumo, porUnidad] of consumoUnitario(linea, recetas)) {
            total.set(insumo, (total.get(insumo) || 0) + porUnidad * linea.cantidad)
        }
    }
    return [...total].map(([insumo, c]) => ({ insumo, cantidad: redondear(c) })).filter((l) => l.cantidad > 0)
}

/** Costo en COP entero de una receta con los costos promedio de `insumos` (Map id → insumo). */
export const costoDeLineas = (lineas, insumos) =>
    Math.round(lineas.reduce((t, l) => t + l.cantidad * factor(l) * (insumos.get(String(l.insumo))?.costoPromedio || 0), 0))

const formatoLineas = (lineas, insumos) => lineas.map((l) => {
    const insumo = insumos.get(String(l.insumo))
    const reemplazado = l.reemplaza ? insumos.get(String(l.reemplaza)) : null
    return {
        insumoId: String(l.insumo),
        insumo: insumo?.nombre || '(insumo eliminado)',
        unidad: insumo?.unidad || '',
        activo: insumo?.activo !== false,
        cantidad: l.cantidad,
        merma: l.merma || 0,
        reemplazaId: l.reemplaza ? String(l.reemplaza) : null,
        reemplaza: reemplazado?.nombre || null,
    }
})

/** Productos con su receta y su costo, grupos con las recetas de sus opciones e insumos activos para elegir. */
export const listarRecetas = async (sesion) => {
    exigirPermiso(sesion, ...LECTURA)
    const [productos, grupos, recetas, insumosLista] = await Promise.all([
        Producto.find().populate('categoria', 'nombre').select('nombre precio categoria gruposModificadores disponible').sort({ nombre: 1 }).lean(),
        GrupoModificadores.find({ activo: true }).select('nombre opciones._id opciones.nombre opciones.precioExtra opciones.disponible').sort({ nombre: 1 }).lean(),
        Receta.find().lean(),
        Insumo.find().collation(COLACION_INSUMO).sort({ nombre: 1 }).lean(),
    ])
    const insumos = new Map(insumosLista.map((i) => [String(i._id), i]))
    const porProducto = new Map(recetas.filter((r) => r.tipo === 'producto').map((r) => [String(r.producto), r]))
    const porOpcion = new Map(recetas.filter((r) => r.tipo === 'opcion').map((r) => [claveOpcion(r.grupo, r.opcion), r]))
    const gruposPorId = new Map(grupos.map((g) => [String(g._id), g]))
    const costoDeConsumo = (consumo) => Math.round([...consumo].reduce((t, [id, c]) => t + c * (insumos.get(id)?.costoPromedio || 0), 0))

    /**
     * 5.8.1 · Variantes del producto: una por cada opción de sus grupos que cambia la receta, con lo que cambia
     * (suma o reemplaza), el precio con el recargo y el costo de una unidad con esa opción (misma cuenta que el descuento).
     */
    const variantesDe = (p) => (p.gruposModificadores || []).flatMap((grupoId) => {
        const g = gruposPorId.get(String(grupoId))
        if (!g) return []
        return g.opciones.flatMap((o) => {
            const receta = porOpcion.get(claveOpcion(g._id, o._id))
            if (!receta?.lineas?.length) return []
            const consumo = consumoUnitario({ producto: p._id, modificadores: [{ grupo: g._id, opcion: o._id }] }, { porProducto, porOpcion })
            return [{
                grupoId: String(g._id), grupo: g.nombre, opcionId: String(o._id), opcion: o.nombre, disponible: o.disponible !== false,
                cambios: formatoLineas(receta.lineas, insumos), version: receta.__v ?? null,
                precio: p.precio + (o.precioExtra || 0), costo: costoDeConsumo(consumo),
            }]
        })
    })
    return {
        productos: productos.map((p) => {
            const receta = porProducto.get(String(p._id))
            const lineas = receta?.lineas || []
            return {
                id: String(p._id),
                nombre: p.nombre,
                categoria: p.categoria?.nombre || '',
                precio: p.precio,
                disponible: p.disponible !== false,
                grupos: (p.gruposModificadores || []).map(String),
                lineas: formatoLineas(lineas, insumos),
                costo: costoDeLineas(lineas, insumos),
                version: receta?.__v ?? null,
                variantes: variantesDe(p),
            }
        }),
        grupos: grupos.map((g) => ({
            id: String(g._id),
            nombre: g.nombre,
            opciones: g.opciones.map((o) => {
                const receta = porOpcion.get(claveOpcion(g._id, o._id))
                return { id: String(o._id), nombre: o.nombre, lineas: formatoLineas(receta?.lineas || [], insumos), version: receta?.__v ?? null }
            }),
        })),
        insumos: insumosLista.filter((i) => i.activo).map((i) => ({ id: String(i._id), nombre: i.nombre, unidad: i.unidad, costoPromedio: i.costoPromedio })),
    }
}

const aLineas = (lineas) => lineas.map((l) => ({ insumo: l.insumoId, cantidad: l.cantidad, merma: l.merma ?? 0, reemplaza: l.reemplazaId || null }))

/** Comprueba que los insumos existan y estén activos (los reemplazados solo que existan). */
const exigirInsumos = async (lineas, session) => {
    const ids = [...new Set(lineas.map((l) => l.insumo))]
    const activos = await Insumo.find({ _id: { $in: ids }, activo: true }).select('_id').session(session).lean()
    if (activos.length !== ids.length) {
        throw new AppError(409, 'INSUMO_NO_DISPONIBLE', 'Algún insumo de la receta no existe o está inactivo.')
    }
    const reemplazados = [...new Set(lineas.map((l) => l.reemplaza).filter(Boolean))]
    if (reemplazados.length && (await Insumo.countDocuments({ _id: { $in: reemplazados } }).session(session)) !== reemplazados.length) {
        throw new AppError(409, 'INSUMO_NO_DISPONIBLE', 'El insumo reemplazado no existe.')
    }
}

const guardar = async ({ filtro, base, lineas, versionEsperada, evento, sesion }) => conTransaccion(async (session) => {
    await exigirInsumos(lineas, session)
    let receta = await Receta.findOne(filtro).session(session)
    // Una receta que ya existe se edita con su versión (dos ediciones a la vez no se pisan); la primera vez no hay versión
    if (receta && versionEsperada === undefined) throw new AppError(400, 'VALIDATION_ERROR', 'La versión de la receta es requerida.')
    if (receta && receta.__v !== versionEsperada) {
        throw new AppError(409, 'RECETA_CAMBIADA', 'Otra persona cambió esta receta. Recarga e intenta de nuevo.')
    }
    const antes = receta ? receta.lineas.map((l) => l.toObject()) : []
    if (!receta) receta = new Receta({ ...base, lineas })
    else {
        receta.lineas = lineas
        receta.increment()
    }
    await receta.save({ session })
    await registrarEvento({
        ...evento, tipo: 'receta_editada', usuario: sesion.id, actor: actorDe(sesion),
        datos: { ...evento.datos, antes, despues: lineas }, session,
    })
    return { id: String(receta._id), lineas: receta.lineas.length, version: receta.__v }
})

export const guardarRecetaProducto = async (productoId, datos, sesion) => {
    exigirPermiso(sesion, 'inventario:gestionar')
    const { lineas, versionEsperada } = validar(recetaSchema, datos)
    if (lineas.some((l) => l.reemplazaId)) throw new AppError(400, 'VALIDATION_ERROR', 'Solo las opciones reemplazan insumos.')
    if (!mongoose.isValidObjectId(productoId)) throw new AppError(404, 'PRODUCTO_NO_ENCONTRADO', 'El producto no existe.')
    const producto = await Producto.findById(productoId).select('nombre').lean()
    if (!producto) throw new AppError(404, 'PRODUCTO_NO_ENCONTRADO', 'El producto no existe.')
    return guardar({
        filtro: { tipo: 'producto', producto: producto._id },
        base: { tipo: 'producto', producto: producto._id },
        lineas: aLineas(lineas), versionEsperada, sesion,
        evento: { entidad: 'producto', entidadId: producto._id, datos: { nombre: producto.nombre } },
    })
}

export const guardarRecetaOpcion = async (grupoId, opcionId, datos, sesion) => {
    exigirPermiso(sesion, 'inventario:gestionar')
    const { lineas, versionEsperada } = validar(recetaSchema, datos)
    const noExiste = () => new AppError(404, 'OPCION_NO_ENCONTRADA', 'La opción no existe.')
    if (!mongoose.isValidObjectId(grupoId) || !mongoose.isValidObjectId(opcionId)) throw noExiste()
    const grupo = await GrupoModificadores.findOne({ _id: grupoId, 'opciones._id': opcionId }).select('nombre opciones').lean()
    if (!grupo) throw noExiste()
    const opcion = grupo.opciones.find((o) => String(o._id) === String(opcionId))
    return guardar({
        filtro: { tipo: 'opcion', grupo: grupo._id, opcion: opcion._id },
        base: { tipo: 'opcion', grupo: grupo._id, opcion: opcion._id },
        lineas: aLineas(lineas), versionEsperada, sesion,
        evento: { entidad: 'modificador', entidadId: grupo._id, datos: { opcion: opcion._id, nombre: opcion.nombre } },
    })
}
