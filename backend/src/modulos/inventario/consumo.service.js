// Fase 5 · 5.3 (F5-3, F5-7) · Efectos del inventario en la operación, SIEMPRE dentro de la transacción de quien
// llama (enviar la ronda, anular el ítem, confirmar o cancelar el domicilio):
//   - descuento: cada ítem enviado (referencia: el ítem) o el pedido confirmado (referencia: el pedido);
//   - devolución: lo que consumió esa referencia y aún no se devolvió (dos devoluciones no suman dos veces);
//   - agotado automático: un producto u opción sin insumos para una unidad se agota solo (Evento «sistema»);
//     al entrar stock se reactiva solo, salvo que lo hayan agotado a mano.
// El descuento no bloquea (F5-d): la existencia puede quedar negativa.
import Insumo from './insumo.model.js'
import Receta from './receta.model.js'
import Producto from '../catalogo/producto.model.js'
import GrupoModificadores from '../catalogo/grupoModificadores.model.js'
import { registrarEvento } from '../compartido/estados.service.js'
import { publicar } from '../tiempoReal/bus.js'
import { aplicarMovimientos, pendientePorDevolver } from './movimientos.service.js'
import { consumoDeLineas } from './recetas.service.js'

const negativo = (lineas) => lineas.map((l) => ({ insumo: l.insumo, cantidad: -l.cantidad, tipo: 'consumo' }))
const resumen = (movs) => movs.map((m) => ({ insumo: m.insumo, nombre: m.nombre, cantidad: m.cantidad, existencia: m.existenciaDespues }))

/** Descuenta los ítems de una ronda recién enviada: un movimiento por ítem e insumo. Devuelve los cambios de disponibilidad. */
export const descontarRonda = async ({ cuenta, ronda, sesion, session }) => {
    const movimientos = []
    for (const item of ronda.items) {
        const consumo = await consumoDeLineas([{ producto: item.producto, cantidad: item.cantidad, modificadores: item.modificadores }], session)
        if (!consumo.length) continue
        movimientos.push(...await aplicarMovimientos(negativo(consumo), {
            motivo: `ronda ${ronda.numeroRonda} enviada`, sesion, session,
            referencia: { tipo: 'item', id: item._id, cuenta: cuenta._id, codigo: `${cuenta.codigo} · R${ronda.numeroRonda}` },
        }))
    }
    if (!movimientos.length) return []
    await registrarEvento({
        entidad: 'cuenta', entidadId: cuenta._id, tipo: 'inventario_descontado', usuario: sesion.id, actor: sesion.rol || 'staff',
        motivo: `ronda ${ronda.numeroRonda} enviada`, datos: { comanda: ronda._id, numeroRonda: ronda.numeroRonda, movimientos: resumen(movimientos) }, session,
    })
    return revisarDisponibilidad(movimientos.map((m) => m.insumo), sesion, session)
}

/** Devuelve lo que consumió un ítem anulado. */
export const devolverItem = async ({ cuenta, comanda, item, sesion, session }) => {
    const pendiente = await pendientePorDevolver([{ tipo: 'item', id: item._id }], session)
    if (!pendiente.length) return []
    const movimientos = await aplicarMovimientos(pendiente.map((p) => ({ insumo: p.insumo, cantidad: -p.neto, tipo: 'devolucion' })), {
        motivo: `ítem anulado (${item.nombre})`, sesion, session,
        referencia: { tipo: 'item', id: item._id, cuenta: cuenta._id, codigo: `${cuenta.codigo} · R${comanda.numeroRonda}` },
    })
    await registrarEvento({
        entidad: 'cuenta', entidadId: cuenta._id, tipo: 'inventario_devuelto', usuario: sesion.id, actor: sesion.rol || 'staff',
        motivo: 'ítem anulado', datos: { comanda: comanda._id, numeroRonda: comanda.numeroRonda, item: item._id, movimientos: resumen(movimientos) }, session,
    })
    return revisarDisponibilidad(movimientos.map((m) => m.insumo), sesion, session)
}

/** Descuenta un domicilio confirmado (sus líneas son copia del pedido: producto, cantidad y opciones). */
export const descontarPedido = async ({ pedido, codigo, lineas, sesion, session }) => {
    const consumo = await consumoDeLineas(lineas.map((l) => ({ producto: l.producto, cantidad: l.cantidad, modificadores: l.modificadores || [] })), session)
    if (!consumo.length) return []
    const movimientos = await aplicarMovimientos(negativo(consumo), {
        motivo: 'domicilio confirmado', sesion, session, referencia: { tipo: 'pedido', id: pedido._id, codigo },
    })
    await registrarEvento({
        entidad: 'pedido', entidadId: pedido._id, tipo: 'inventario_descontado', usuario: sesion.id, actor: sesion.rol || 'staff',
        motivo: 'domicilio confirmado', datos: { movimientos: resumen(movimientos) }, session,
    })
    return revisarDisponibilidad(movimientos.map((m) => m.insumo), sesion, session)
}

/** Devuelve lo que consumió un domicilio cancelado (nada si no llegó a confirmarse). */
export const devolverPedido = async ({ pedido, codigo, sesion, session }) => {
    const pendiente = await pendientePorDevolver([{ tipo: 'pedido', id: pedido._id }], session)
    if (!pendiente.length) return []
    const movimientos = await aplicarMovimientos(pendiente.map((p) => ({ insumo: p.insumo, cantidad: -p.neto, tipo: 'devolucion' })), {
        motivo: 'domicilio cancelado', sesion, session, referencia: { tipo: 'pedido', id: pedido._id, codigo },
    })
    await registrarEvento({
        entidad: 'pedido', entidadId: pedido._id, tipo: 'inventario_devuelto', usuario: sesion?.id || null, actor: sesion?.rol || 'staff',
        motivo: 'domicilio cancelado', datos: { movimientos: resumen(movimientos) }, session,
    })
    return revisarDisponibilidad(movimientos.map((m) => m.insumo), sesion, session)
}

const alcanza = (lineas, existencias) => lineas.every((l) => (existencias.get(String(l.insumo)) ?? 0) >= l.cantidad * (1 + (l.merma || 0) / 100))
const faltantes = (lineas, existencias, nombres) => lineas
    .filter((l) => (existencias.get(String(l.insumo)) ?? 0) < l.cantidad * (1 + (l.merma || 0) / 100))
    .map((l) => nombres.get(String(l.insumo)) || 'insumo')

/**
 * F5-7 · Revisa los productos y opciones cuyas recetas usan esos insumos: agota los que ya no alcanzan para una
 * unidad y reactiva los que agotó el sistema y ya alcanzan. Escrituras condicionales (un agotado a mano no se
 * reactiva: tiene agotadoAuto en false). Devuelve los cambios para avisar por «catalogo» tras confirmar.
 */
export const revisarDisponibilidad = async (insumoIds, sesion, session) => {
    if (!insumoIds.length) return []
    const recetas = await Receta.find({ 'lineas.insumo': { $in: insumoIds } }).session(session).lean()
    if (!recetas.length) return []
    const todos = [...new Set(recetas.flatMap((r) => r.lineas.map((l) => String(l.insumo))))]
    const insumos = await Insumo.find({ _id: { $in: todos } }).select('existencia nombre').session(session).lean()
    const existencias = new Map(insumos.map((i) => [String(i._id), i.existencia]))
    const nombres = new Map(insumos.map((i) => [String(i._id), i.nombre]))
    const cambios = []
    const evento = (datos) => registrarEvento({ ...datos, usuario: sesion?.id || null, actor: 'sistema', session })

    for (const r of recetas.filter((x) => x.tipo === 'producto')) {
        const ok = alcanza(r.lineas, existencias)
        const producto = await Producto.findOneAndUpdate(
            ok ? { _id: r.producto, disponible: false, agotadoAuto: true } : { _id: r.producto, disponible: { $ne: false } },
            { $set: { disponible: ok, agotadoAuto: !ok } },
            { returnDocument: 'after', session },
        )
        if (!producto) continue
        const motivo = (ok ? 'insumos repuestos' : `sin ${faltantes(r.lineas, existencias, nombres).join(', ')}`).slice(0, 300)
        await evento({
            entidad: 'producto', entidadId: producto._id, tipo: ok ? 'producto_reactivado' : 'producto_agotado',
            de: ok ? 'agotado' : 'disponible', a: ok ? 'disponible' : 'agotado', motivo, datos: { nombre: producto.nombre, automatico: true },
        })
        cambios.push({ id: String(producto._id), disponible: ok, cambiado: true })
    }
    for (const r of recetas.filter((x) => x.tipo === 'opcion')) {
        const ok = alcanza(r.lineas, existencias)
        const grupo = await GrupoModificadores.findOneAndUpdate(
            { _id: r.grupo, opciones: { $elemMatch: ok ? { _id: r.opcion, disponible: false, agotadoAuto: true } : { _id: r.opcion, disponible: { $ne: false } } } },
            { $set: { 'opciones.$.disponible': ok, 'opciones.$.agotadoAuto': !ok }, $inc: { __v: 1 } },
            { returnDocument: 'after', session },
        )
        if (!grupo) continue
        const opcion = grupo.opciones.id(r.opcion)
        await evento({
            entidad: 'modificador', entidadId: grupo._id, tipo: ok ? 'opcion_reactivada' : 'opcion_agotada',
            de: ok ? 'agotado' : 'disponible', a: ok ? 'disponible' : 'agotado',
            motivo: (ok ? 'insumos repuestos' : `sin ${faltantes(r.lineas, existencias, nombres).join(', ')}`).slice(0, 300),
            datos: { opcion: opcion._id, nombre: opcion.nombre, automatico: true },
        })
        cambios.push({ id: String(opcion._id), grupoId: String(grupo._id), disponible: ok, cambiado: true })
    }
    return cambios
}

/** Avisos por «catalogo» (solo ids), una vez confirmada la transacción: la toma de comanda y el KDS releen. */
export const avisarCambiosDisponibilidad = (cambios = []) => {
    for (const c of cambios) {
        publicar(['catalogo'], { tipo: 'disponibilidad', ids: c.grupoId ? { grupoId: c.grupoId, opcionId: c.id } : { productoId: c.id } })
    }
}
