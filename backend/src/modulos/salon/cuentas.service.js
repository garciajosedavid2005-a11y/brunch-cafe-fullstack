import mongoose from 'mongoose'
import Cuenta from './cuenta.model.js'
import Comanda from './comanda.model.js'
import Mesa from './mesa.model.js'
import Zona from './zona.model.js'
import Producto from '../catalogo/producto.model.js'
import Categoria from '../catalogo/categoria.model.js'
import Estacion from '../catalogo/estacion.model.js'
import GrupoModificadores from '../catalogo/grupoModificadores.model.js'
import { estacionEfectiva } from '../catalogo/estaciones.js'
import { AppError } from '../compartido/errors.js'
import { conTransaccion } from '../compartido/transacciones.js'
import { siguienteValor } from '../compartido/contadores.js'
import { registrarEvento } from '../compartido/estados.service.js'
import {
    MAQUINA_MESA, MAQUINA_CUENTA, MAQUINA_ITEM, ESTADOS_CUENTA_ABIERTA, MESA_SEGUN_CUENTA,
} from '../compartido/estadosSalon.js'
import { tienePermiso } from '../identidad/permisos.js'
import { calcularItem, subtotalRonda, totalesCuenta } from './totales.js'
import {
    validar, abrirCuentaSchema, agregarItemSchema, modificarItemSchema, versionOpcionalSchema,
    enviarRondaSchema, cambioCuentaSchema, anularItemSchema, cambioMesaSchema,
} from './cuentas.schema.js'

// 1.4 · Núcleo de cuenta y comanda (sin endpoints: llegan en 1.5 y reciben `sesion` = req.usuario).
// Reglas:
//   - Todo cambio va en una transacción y empieza «tocando» la cuenta (findOneAndUpdate con $inc
//     version y filtro por estado y, si llega, por versionEsperada): dos operaciones sobre la misma
//     cuenta se serializan (la segunda reintenta y ve lo que hizo la primera) y una tablet con datos
//     viejos recibe 409 CUENTA_MODIFICADA.
//   - Los montos se recalculan siempre desde los ítems (totales.js) y se guardan con save(), que
//     comprueba los invariantes de los esquemas.
//   - Cada cambio deja su Evento con quién lo hizo. F1-17: cualquiera con el permiso opera cualquier
//     cuenta; `mesero` solo indica el responsable.
//   - Mesa y cuenta cambian juntas: la mesa solo se escribe si apunta a esta cuenta (cuentaActual)
//     y está en el estado esperado; si no, 409 MESAS_INCONSISTENTES y no se escribe nada.
const { ObjectId } = mongoose.Types

const error = (status, code, message, details) => new AppError(status, code, message, details)
const cuentaNoEncontrada = () => error(404, 'CUENTA_NO_ENCONTRADA', 'La cuenta no existe.')
const itemNoEncontrado = () => error(404, 'ITEM_NO_ENCONTRADO', 'El ítem no existe en esta cuenta.')
const permisosDe = (sesion) => sesion?.permisos || []
const quien = (sesion) => ({ usuario: sesion.id, actor: sesion.rol || 'staff' })

const exigirPermiso = (sesion, clave) => {
    if (!tienePermiso(permisosDe(sesion), clave)) {
        throw error(403, 'FORBIDDEN', 'No tienes permiso para realizar esta acción.', { requiere: [clave] })
    }
}

// ── Formatos (los usa la API de 1.5) ───────────────────────────────────────────────────
const textoId = (valor) => (valor ? String(valor) : null)

const formatoItem = (item) => ({
    id: String(item._id),
    productoId: String(item.producto),
    codigoProducto: item.codigoProducto ?? null,
    nombre: item.nombre,
    precioBase: item.precioBase,
    modificadores: (item.modificadores || []).map((m) => ({
        grupoId: String(m.grupo), grupo: m.grupoNombre, opcionId: String(m.opcion), opcion: m.opcionNombre, precioExtra: m.precioExtra,
    })),
    estacion: { id: String(item.estacion.id), codigo: item.estacion.codigo, nombre: item.estacion.nombre },
    cantidad: item.cantidad,
    nota: item.nota || '',
    precioUnitario: item.precioUnitario,
    subtotal: item.subtotal,
    estado: item.estado,
    anulacion: item.anulacion
        ? { motivo: item.anulacion.motivo, detalle: item.anulacion.detalle || '', por: String(item.anulacion.por), en: item.anulacion.en }
        : null,
    agregadoPor: textoId(item.agregadoPor),
    agregadoEn: item.agregadoEn,
})

const formatoRonda = (comanda) => ({
    id: String(comanda._id),
    numeroRonda: comanda.numeroRonda,
    estado: comanda.estado,
    subtotal: comanda.subtotal,
    enviadaPor: textoId(comanda.enviadaPor),
    enviadaEn: comanda.enviadaEn || null,
    items: comanda.items.map(formatoItem),
})

const formatoCuenta = (cuenta, comandas) => ({
    id: String(cuenta._id),
    codigo: cuenta.codigo,
    canal: cuenta.canal,
    estado: cuenta.estado,
    mesas: cuenta.mesas.map((m) => ({
        id: String(m.mesa), numero: m.numero, nombre: m.nombre || '', zona: { id: String(m.zona), nombre: m.zonaNombre || '' },
    })),
    mesero: String(cuenta.mesero),
    comensales: cuenta.comensales,
    subtotal: cuenta.subtotal,
    pendiente: cuenta.pendiente,
    impuestos: cuenta.impuestos ?? null,
    propina: cuenta.propina ?? null,
    descuento: cuenta.descuento ?? null,
    total: cuenta.total,
    version: cuenta.version,
    ultimaRonda: cuenta.ultimaRonda,
    abiertaPor: String(cuenta.abiertaPor),
    abiertaEn: cuenta.abiertaEn,
    cerradaPor: textoId(cuenta.cerradaPor),
    cerradaEn: cuenta.cerradaEn || null,
    motivoCierre: cuenta.motivoCierre || '',
    notas: cuenta.notas || '',
    rondas: [...comandas].sort((a, b) => a.numeroRonda - b.numeroRonda).map(formatoRonda),
})

// Resumen de un ítem para el Evento (mermas de la Fase 5): sin datos personales
const resumenItem = (item) => ({
    itemId: String(item._id),
    productoId: String(item.producto),
    codigoProducto: item.codigoProducto ?? null,
    nombre: item.nombre,
    cantidad: item.cantidad,
    precioUnitario: item.precioUnitario,
    subtotal: item.subtotal,
    modificadores: (item.modificadores || []).map((m) => m.opcionNombre),
    estacion: item.estacion?.codigo,
})

const comandasDe = (cuentaId, session) => Comanda.find({ cuenta: cuentaId }).sort({ numeroRonda: 1 }).session(session)
const borradorDe = (cuentaId, session) => Comanda.findOne({ cuenta: cuentaId, estado: 'borrador' }).session(session)

const detalle = async (cuenta, session) => formatoCuenta(cuenta, await comandasDe(cuenta._id, session).lean())

// ── Cuenta: toque, totales y mesas ─────────────────────────────────────────────────────
/**
 * «Toca» la cuenta dentro de la transacción ($inc version) si está en `estados` y, con
 * versionEsperada, si nadie la cambió desde entonces. Devuelve el documento (para save()).
 */
const tocarCuenta = async (cuentaId, { versionEsperada, estados = ESTADOS_CUENTA_ABIERTA } = {}, session) => {
    if (!mongoose.isValidObjectId(cuentaId)) throw cuentaNoEncontrada()
    const filtro = { _id: cuentaId, estado: { $in: estados }, ...(versionEsperada === undefined ? {} : { version: versionEsperada }) }
    const cuenta = await Cuenta.findOneAndUpdate(filtro, { $inc: { version: 1 } }, { returnDocument: 'after', session })
    if (cuenta) return cuenta

    const actual = await Cuenta.findById(cuentaId).select('estado version').session(session).lean()
    if (!actual) throw cuentaNoEncontrada()
    if (!estados.includes(actual.estado)) {
        if (MAQUINA_CUENTA.esFinal(actual.estado)) {
            throw error(409, 'ESTADO_FINAL', 'La cuenta ya está cerrada y no admite cambios.', { estado: actual.estado })
        }
        throw error(409, 'CUENTA_NO_EDITABLE', `La cuenta está «${actual.estado}».`, { estado: actual.estado })
    }
    throw error(409, 'CUENTA_MODIFICADA', 'La cuenta cambió mientras la editabas. Recarga e intenta de nuevo.', { version: actual.version })
}

/** Recalcula subtotal, pendiente y total desde las rondas y guarda la cuenta (valida invariantes). */
const guardarCuenta = async (cuenta, session) => {
    const comandas = await Comanda.find({ cuenta: cuenta._id }).select('estado items.subtotal items.estado').session(session).lean()
    cuenta.set(totalesCuenta(comandas))
    await cuenta.save({ session })
}

/**
 * Cambia a la vez las mesas de la cuenta de `de` a `a` (transición del sistema). Solo escribe las
 * que apuntan a esta cuenta y están en `de`; si falta alguna, 409 y no se escribe nada.
 */
const moverMesas = async (cuenta, de, a, { sesion, session, liberar = false, motivo = '' }) => {
    MAQUINA_MESA.validar(de, a, { via: 'sistema' })
    const ids = cuenta.mesas.map((m) => m.mesa)
    const { matchedCount } = await Mesa.updateMany(
        { _id: { $in: ids }, cuentaActual: cuenta._id, estado: de },
        { $set: { estado: a, ...(liberar ? { cuentaActual: null } : {}) } },
        { session, runValidators: true },
    )
    if (matchedCount !== ids.length) {
        throw error(409, 'MESAS_INCONSISTENTES',
            'Las mesas de la cuenta no están como se esperaba. Recarga; si se repite, avisa al administrador.',
            { esperadas: ids.length, encontradas: matchedCount })
    }
    for (const m of cuenta.mesas) {
        await registrarEvento({
            entidad: 'mesa', entidadId: m.mesa, de, a, motivo, ...quien(sesion), datos: { cuenta: cuenta._id, codigo: cuenta.codigo }, session,
        })
    }
}

const cambiarEstadoCuenta = async (cuenta, a, { sesion, session, motivo = '', datos }) => {
    const de = cuenta.estado
    cuenta.estado = a
    await registrarEvento({ entidad: 'cuenta', entidadId: cuenta._id, de, a, motivo, ...quien(sesion), datos, session })
}

/** D2: con la cuenta pedida, pedir algo más la reabre (cuenta abierta y mesas ocupadas). */
const reabrirSiHaceFalta = async (cuenta, { sesion, session }) => {
    if (cuenta.estado !== 'cuenta_pedida') return
    MAQUINA_CUENTA.validar('cuenta_pedida', 'abierta', { permisos: permisosDe(sesion) })
    await moverMesas(cuenta, 'cuenta_pedida', 'ocupada', { sesion, session, motivo: 'se agregó un ítem' })
    await cambiarEstadoCuenta(cuenta, 'abierta', { sesion, session, motivo: 'se agregó un ítem' })
}

/** Borra la ronda en borrador (al cancelar o cerrar) y deja Evento con lo que tenía. */
const descartarBorrador = async (cuenta, { sesion, session }) => {
    const borrador = await borradorDe(cuenta._id, session)
    if (!borrador) return
    await Comanda.deleteOne({ _id: borrador._id }, { session })
    if (borrador.items.length) {
        await registrarEvento({
            entidad: 'cuenta', entidadId: cuenta._id, tipo: 'ronda_descartada', ...quien(sesion),
            datos: { comanda: borrador._id, numeroRonda: borrador.numeroRonda, items: borrador.items.map(resumenItem) }, session,
        })
    }
}

/** Cierre final (cancelada, cerrada_sin_cobro): mesas → por_limpiar y sin cuenta. */
const cerrarCuenta = async (cuenta, a, { sesion, session, motivo }) => {
    await descartarBorrador(cuenta, { sesion, session })
    await moverMesas(cuenta, MESA_SEGUN_CUENTA[cuenta.estado], 'por_limpiar', { sesion, session, liberar: true, motivo })
    await cambiarEstadoCuenta(cuenta, a, { sesion, session, motivo })
    cuenta.set({ cerradaPor: sesion.id, cerradaEn: new Date(), motivoCierre: motivo })
    await guardarCuenta(cuenta, session)
}

// ── Catálogo: estación, disponibilidad y modificadores ─────────────────────────────────
/** Estación efectiva (snapshot { id, codigo, nombre }) de cada producto, en lote: Map(productoId → snapshot|null). */
const estacionesDe = async (productos, session) => {
    const sinPropia = productos.filter((p) => !p.estacion).map((p) => p.categoria)
    const categorias = sinPropia.length
        ? await Categoria.find({ _id: { $in: sinPropia } }).select('estacion').session(session).lean()
        : []
    const categoriaPorId = new Map(categorias.map((c) => [String(c._id), c]))
    const efectivas = new Map(productos.map((p) => [String(p._id), estacionEfectiva(p, categoriaPorId.get(String(p.categoria)))]))
    const ids = [...new Set([...efectivas.values()].filter(Boolean).map(String))]
    const estaciones = ids.length ? await Estacion.find({ _id: { $in: ids } }).select('codigo nombre').session(session).lean() : []
    const estacionPorId = new Map(estaciones.map((e) => [String(e._id), { id: e._id, codigo: e.codigo, nombre: e.nombre }]))
    return new Map([...efectivas].map(([productoId, estacion]) => [productoId, estacion ? estacionPorId.get(String(estacion)) || null : null]))
}

/** Grupos ACTIVOS del producto, en el orden en que el producto los ofrece. */
const gruposActivosDe = async (producto, session) => {
    const ids = producto.gruposModificadores || []
    if (!ids.length) return []
    const grupos = await GrupoModificadores.find({ _id: { $in: ids }, activo: true }).session(session).lean()
    const porId = new Map(grupos.map((g) => [String(g._id), g]))
    return ids.map((id) => porId.get(String(id))).filter(Boolean)
}

/**
 * Valida la elección contra los grupos activos del producto y devuelve el snapshot de los
 * modificadores (orden: el de los grupos en el producto y el de las opciones en el grupo).
 */
const validarModificadores = (grupos, pedidos) => {
    const elegidasPorGrupo = new Map()
    for (const { grupoId, opcionIds } of pedidos) {
        if (elegidasPorGrupo.has(grupoId)) throw error(400, 'GRUPO_NO_VALIDO', 'Un grupo de modificadores viene repetido.', { grupoId })
        if (!grupos.some((g) => String(g._id) === grupoId)) {
            throw error(400, 'GRUPO_NO_VALIDO', 'Ese grupo de modificadores no se ofrece para este producto.', { grupoId })
        }
        if (new Set(opcionIds).size !== opcionIds.length) throw error(400, 'OPCION_NO_VALIDA', 'Hay una opción repetida.', { grupoId })
        elegidasPorGrupo.set(grupoId, opcionIds)
    }

    const snapshot = []
    for (const grupo of grupos) {
        const grupoId = String(grupo._id)
        const elegidas = elegidasPorGrupo.get(grupoId) || []
        if (elegidas.length === 0 && grupo.min >= 1) {
            throw error(400, 'MODIFICADOR_REQUERIDO', `Elige una opción de «${grupo.nombre}».`, { grupoId, grupo: grupo.nombre })
        }
        if (elegidas.length < grupo.min || elegidas.length > grupo.max) {
            const rango = grupo.min === grupo.max ? `${grupo.min}` : `entre ${grupo.min} y ${grupo.max}`
            throw error(400, 'MODIFICADORES_FUERA_DE_RANGO', `En «${grupo.nombre}» elige ${rango} opciones.`,
                { grupoId, grupo: grupo.nombre, min: grupo.min, max: grupo.max, elegidas: elegidas.length })
        }
        const opciones = elegidas.map((opcionId) => {
            const opcion = grupo.opciones.find((o) => String(o._id) === opcionId)
            if (!opcion) throw error(400, 'OPCION_NO_VALIDA', `Esa opción no pertenece a «${grupo.nombre}».`, { grupoId, opcionId })
            if (opcion.disponible === false) {
                throw error(409, 'OPCION_NO_DISPONIBLE', `«${opcion.nombre}» (${grupo.nombre}) está agotada.`, { grupoId, opcionId })
            }
            return opcion
        })
        opciones.sort((x, y) => grupo.opciones.indexOf(x) - grupo.opciones.indexOf(y))
        for (const opcion of opciones) {
            snapshot.push({ grupo: grupo._id, grupoNombre: grupo.nombre, opcion: opcion._id, opcionNombre: opcion.nombre, precioExtra: opcion.precioExtra ?? 0 })
        }
    }
    return snapshot
}

/** Ítem nuevo con la copia del catálogo de este momento (F1-14). */
const armarItem = async ({ productoId, cantidad, nota, modificadores }, sesion, session) => {
    const producto = await Producto.findById(productoId).session(session).lean()
    if (!producto) throw error(404, 'PRODUCTO_NO_ENCONTRADO', 'El producto no existe.')
    if (producto.disponible === false) {
        throw error(409, 'PRODUCT_UNAVAILABLE', `«${producto.nombre}» está agotado.`, { productos: [producto.codigo ?? null], productoId: String(producto._id) })
    }
    if (!Number.isSafeInteger(producto.precio) || producto.precio < 0) {
        throw error(409, 'PRECIO_NO_VALIDO', `El precio de «${producto.nombre}» no es un entero en COP; corrígelo en el catálogo.`)
    }
    const estacion = (await estacionesDe([producto], session)).get(String(producto._id))
    if (!estacion) {
        throw error(409, 'PRODUCTO_SIN_ESTACION', `«${producto.nombre}» no tiene estación (cocina o barra); asígnala en el catálogo.`)
    }
    const snapshotModificadores = validarModificadores(await gruposActivosDe(producto, session), modificadores)
    const base = {
        producto: producto._id,
        codigoProducto: producto.codigo ?? null,
        nombre: producto.nombre,
        precioBase: producto.precio,
        modificadores: snapshotModificadores,
        estacion,
        cantidad,
        nota: nota || '',
        estado: 'borrador',
        agregadoPor: sesion.id,
        agregadoEn: new Date(),
    }
    return { ...base, ...calcularItem(base) }
}

/**
 * Al enviar (D3): revisa que cada producto siga existiendo y disponible, y cada opción elegida
 * siga disponible. Actualiza la estación al vigente (el KDS enruta por ella). Devuelve los problemas.
 * Carrera aceptada: el producto se lee sin escribirlo, así que si el admin lo agota en el mismo instante
 * la ronda puede salir igual (lo detecta cocina o barra).
 */
const revisarRonda = async (items, session) => {
    const productos = await Producto.find({ _id: { $in: items.map((i) => i.producto) } }).session(session).lean()
    const productoPorId = new Map(productos.map((p) => [String(p._id), p]))
    const idsGrupos = [...new Set(items.flatMap((i) => i.modificadores.map((m) => String(m.grupo))))]
    const grupos = idsGrupos.length ? await GrupoModificadores.find({ _id: { $in: idsGrupos } }).session(session).lean() : []
    const grupoPorId = new Map(grupos.map((g) => [String(g._id), g]))
    const estaciones = await estacionesDe(productos, session)

    const problemas = []
    for (const item of items) {
        const producto = productoPorId.get(String(item.producto))
        const opcionAgotada = item.modificadores.some((m) => {
            const opcion = grupoPorId.get(String(m.grupo))?.opciones.find((o) => String(o._id) === String(m.opcion))
            return !opcion || opcion.disponible === false
        })
        const estacion = producto ? estaciones.get(String(producto._id)) : null
        const motivo = !producto ? 'producto_eliminado'
            : producto.disponible === false ? 'producto_agotado'
                : opcionAgotada ? 'opcion_agotada'
                    : !estacion ? 'sin_estacion'
                        : null
        if (motivo) problemas.push({ itemId: String(item._id), nombre: item.nombre, motivo })
        else item.estacion = estacion
    }
    return problemas
}

const buscarItem = async (cuenta, itemId, session) => {
    if (!mongoose.isValidObjectId(itemId)) throw itemNoEncontrado()
    const comanda = await Comanda.findOne({ cuenta: cuenta._id, 'items._id': itemId }).session(session)
    if (!comanda) throw itemNoEncontrado()
    return { comanda, item: comanda.items.id(itemId) }
}

const exigirBorrador = (comanda) => {
    if (comanda.estado !== 'borrador') {
        throw error(409, 'ITEM_NO_EDITABLE', 'El ítem ya se envió: no se edita ni se quita; se anula con motivo.')
    }
}

/** Cuenta.create; si el índice único dice que la mesa ya está en otra cuenta abierta (dato incoherente), 409. */
const crearCuentaOConflicto = async (docs, opciones) => {
    try {
        return await Cuenta.create(docs, opciones)
    } catch (e) {
        if (e?.code === 11000 && 'mesas.mesa' in (e.keyPattern || {})) {
            throw error(409, 'MESAS_INCONSISTENTES',
                'La mesa figura en otra cuenta abierta. Recarga; si se repite, avisa al administrador (npm run verificar:salon).')
        }
        throw e
    }
}

// ── Operaciones ────────────────────────────────────────────────────────────────────────
export const obtenerCuenta = async (cuentaId, sesion) => {
    exigirPermiso(sesion, 'cuenta:ver')
    if (!mongoose.isValidObjectId(cuentaId)) throw cuentaNoEncontrada()
    const cuenta = await Cuenta.findById(cuentaId).lean()
    if (!cuenta) throw cuentaNoEncontrada()
    return formatoCuenta(cuenta, await Comanda.find({ cuenta: cuenta._id }).lean())
}

/** Abre la cuenta de una mesa libre (F1-7): mesa → ocupada y apunta a la cuenta. */
export const abrirCuenta = async (datos, sesion) => {
    exigirPermiso(sesion, 'cuenta:abrir')
    const { mesaId, comensales, notas } = validar(abrirCuentaSchema, datos)
    // Fuera de la transacción: un reintento no consume otro número (los huecos son aceptables)
    const codigo = `C-${String(await siguienteValor('cuenta')).padStart(6, '0')}`

    return conTransaccion(async (session) => {
        const mesa = await Mesa.findById(mesaId).session(session).lean()
        if (!mesa) throw error(404, 'MESA_NO_ENCONTRADA', 'La mesa no existe.')
        const noDisponible = (motivo) => error(409, 'MESA_NO_DISPONIBLE', motivo, { estado: mesa.estado })
        if (!mesa.activa || mesa.estado !== 'libre' || mesa.cuentaActual) throw noDisponible(`La mesa ${mesa.numero} no está libre.`)
        // Toca la zona: desactivarla a la vez entra en conflicto con esta apertura (pendiente (b) de 1.2)
        const zona = await Zona.findOneAndUpdate(
            { _id: mesa.zona, activa: true }, { $currentDate: { updatedAt: true } }, { returnDocument: 'after', session },
        )
        if (!zona) throw noDisponible(`La zona de la mesa ${mesa.numero} está inactiva.`)

        MAQUINA_MESA.validar('libre', 'ocupada', { via: 'sistema' })
        const cuentaId = new ObjectId()
        const ocupada = await Mesa.findOneAndUpdate(
            { _id: mesa._id, activa: true, estado: 'libre', cuentaActual: null },
            { $set: { estado: 'ocupada', cuentaActual: cuentaId } },
            { returnDocument: 'after', session, runValidators: true },
        )
        if (!ocupada) throw noDisponible(`La mesa ${mesa.numero} no está libre.`)

        const [cuenta] = await crearCuentaOConflicto([{
            _id: cuentaId,
            codigo,
            canal: 'salon',
            mesas: [{ mesa: mesa._id, numero: mesa.numero, nombre: mesa.nombre || '', zona: zona._id, zonaNombre: zona.nombre }],
            mesero: sesion.id,
            comensales,
            estado: 'abierta',
            abiertaPor: sesion.id,
            abiertaEn: new Date(),
            notas: notas || '',
        }], { session })
        await registrarEvento({
            entidad: 'mesa', entidadId: mesa._id, de: 'libre', a: 'ocupada', ...quien(sesion), datos: { cuenta: cuentaId, codigo }, session,
        })
        await registrarEvento({
            entidad: 'cuenta', entidadId: cuentaId, a: 'abierta', ...quien(sesion), datos: { codigo, mesas: [mesa.numero], comensales }, session,
        })
        return formatoCuenta(cuenta, [])
    })
}

/** Agrega un ítem a la ronda en borrador (la crea si no hay). Con la cuenta pedida, la reabre (D2). */
export const agregarItem = async (cuentaId, datos, sesion) => {
    exigirPermiso(sesion, 'comanda:tomar')
    const entrada = validar(agregarItemSchema, datos)

    return conTransaccion(async (session) => {
        const cuenta = await tocarCuenta(cuentaId, { versionEsperada: entrada.versionEsperada }, session)
        const nuevo = await armarItem(entrada, sesion, session)
        await reabrirSiHaceFalta(cuenta, { sesion, session })

        const ronda = (await borradorDe(cuenta._id, session)) || new Comanda({
            cuenta: cuenta._id, numeroRonda: cuenta.ultimaRonda + 1, estado: 'borrador', items: [], subtotal: 0, creadaPor: sesion.id,
        })
        ronda.items.push(nuevo)
        ronda.subtotal = subtotalRonda(ronda.items)
        await ronda.save({ session })
        const item = ronda.items.at(-1)
        await guardarCuenta(cuenta, session)
        await registrarEvento({
            entidad: 'cuenta', entidadId: cuenta._id, tipo: 'item_agregado', ...quien(sesion),
            datos: { comanda: ronda._id, numeroRonda: ronda.numeroRonda, item: resumenItem(item) }, session,
        })
        return { cuenta: await detalle(cuenta, session), item: formatoItem(item) }
    })
}

/** Cambia la cantidad o la nota de un ítem del borrador. */
export const modificarItem = async (cuentaId, itemId, datos, sesion) => {
    exigirPermiso(sesion, 'comanda:tomar')
    const { cantidad, nota, versionEsperada } = validar(modificarItemSchema, datos)

    return conTransaccion(async (session) => {
        const cuenta = await tocarCuenta(cuentaId, { versionEsperada }, session)
        const { comanda, item } = await buscarItem(cuenta, itemId, session)
        exigirBorrador(comanda)
        const antes = { cantidad: item.cantidad, nota: item.nota }
        if (cantidad !== undefined) item.cantidad = cantidad
        if (nota !== undefined) item.nota = nota
        item.set(calcularItem(item))
        comanda.subtotal = subtotalRonda(comanda.items)
        await comanda.save({ session })
        await guardarCuenta(cuenta, session)
        await registrarEvento({
            entidad: 'cuenta', entidadId: cuenta._id, tipo: 'item_modificado', ...quien(sesion),
            datos: { comanda: comanda._id, numeroRonda: comanda.numeroRonda, itemId: String(item._id), antes, despues: { cantidad: item.cantidad, nota: item.nota } },
            session,
        })
        return detalle(cuenta, session)
    })
}

/** Quita un ítem del borrador (antes de enviar se quita libremente, F1-6). La ronda vacía se borra. */
export const quitarItem = async (cuentaId, itemId, datos, sesion) => {
    exigirPermiso(sesion, 'comanda:tomar')
    const { versionEsperada } = validar(versionOpcionalSchema, datos)

    return conTransaccion(async (session) => {
        const cuenta = await tocarCuenta(cuentaId, { versionEsperada }, session)
        const { comanda, item } = await buscarItem(cuenta, itemId, session)
        exigirBorrador(comanda)
        const resumen = resumenItem(item)
        comanda.items.pull(item._id)
        if (comanda.items.length === 0) {
            await Comanda.deleteOne({ _id: comanda._id }, { session })
        } else {
            comanda.subtotal = subtotalRonda(comanda.items)
            await comanda.save({ session })
        }
        await guardarCuenta(cuenta, session)
        await registrarEvento({
            entidad: 'cuenta', entidadId: cuenta._id, tipo: 'item_quitado', ...quien(sesion),
            datos: { comanda: comanda._id, numeroRonda: comanda.numeroRonda, item: resumen }, session,
        })
        return detalle(cuenta, session)
    })
}

/**
 * Envía la ronda en borrador a cocina y barra (F1-5: completa). Exige el número de ronda y la
 * versión: un doble envío recibe 409 RONDA_YA_ENVIADA (en 1.5 el endpoint añade Idempotency-Key).
 * Si algún producto u opción ya no está disponible se rechaza toda la ronda (D3).
 */
export const enviarRonda = async (cuentaId, datos, sesion) => {
    exigirPermiso(sesion, 'comanda:enviar')
    const { numeroRonda, versionEsperada } = validar(enviarRondaSchema, datos)

    return conTransaccion(async (session) => {
        if (!mongoose.isValidObjectId(cuentaId)) throw cuentaNoEncontrada()
        const previa = await Cuenta.findById(cuentaId).select('ultimaRonda').session(session).lean()
        if (!previa) throw cuentaNoEncontrada()
        if (numeroRonda <= previa.ultimaRonda) {
            throw error(409, 'RONDA_YA_ENVIADA', `La ronda ${numeroRonda} ya se envió.`, { numeroRonda })
        }
        const cuenta = await tocarCuenta(cuentaId, { versionEsperada }, session)
        const ronda = await borradorDe(cuenta._id, session)
        if (!ronda || ronda.items.length === 0) throw error(409, 'RONDA_VACIA', 'No hay ítems por enviar.')
        if (ronda.numeroRonda !== numeroRonda) {
            throw error(409, 'RONDA_NO_COINCIDE', `La ronda por enviar es la ${ronda.numeroRonda}.`, { numeroRonda: ronda.numeroRonda })
        }

        const problemas = await revisarRonda(ronda.items, session)
        if (problemas.length) {
            const nombres = problemas.map((p) => p.nombre).join(', ')
            throw error(409, 'PRODUCT_UNAVAILABLE',
                `No se envió la ronda: ${nombres} ya no ${problemas.length === 1 ? 'está disponible' : 'están disponibles'}. Quítalos o cámbialos.`,
                { items: problemas })
        }
        for (const item of ronda.items) {
            MAQUINA_ITEM.validar(item.estado, 'enviado', { permisos: permisosDe(sesion) })
            item.estado = 'enviado'
        }
        ronda.set({ estado: 'enviada', enviadaPor: sesion.id, enviadaEn: new Date() })
        await ronda.save({ session })
        cuenta.ultimaRonda = ronda.numeroRonda
        await guardarCuenta(cuenta, session)
        await registrarEvento({
            entidad: 'cuenta', entidadId: cuenta._id, tipo: 'ronda_enviada', ...quien(sesion),
            datos: { comanda: ronda._id, numeroRonda: ronda.numeroRonda, items: ronda.items.length, subtotal: ronda.subtotal }, session,
        })
        return detalle(cuenta, session)
    })
}

/** Anula un ítem enviado (F1-6, D1): item:anular, motivo del catálogo («otro» con detalle). No se cobra. */
export const anularItem = async (cuentaId, itemId, datos, sesion) => {
    exigirPermiso(sesion, 'item:anular')
    const { motivo, detalle: detalleMotivo, versionEsperada } = validar(anularItemSchema, datos)
    if (motivo === 'otro' && !detalleMotivo) throw error(400, 'MOTIVO_REQUERIDO', 'Describe el motivo de la anulación.')
    const texto = (detalleMotivo ? `${motivo}: ${detalleMotivo}` : motivo).slice(0, 300)

    return conTransaccion(async (session) => {
        const cuenta = await tocarCuenta(cuentaId, { versionEsperada }, session)
        const { comanda, item } = await buscarItem(cuenta, itemId, session)
        const de = item.estado
        MAQUINA_ITEM.validar(de, 'anulado', { permisos: permisosDe(sesion), motivo: texto })
        item.set({ estado: 'anulado', anulacion: { motivo, detalle: detalleMotivo || '', por: sesion.id, en: new Date() } })
        comanda.subtotal = subtotalRonda(comanda.items)
        await comanda.save({ session })
        await guardarCuenta(cuenta, session)
        await registrarEvento({
            entidad: 'cuenta', entidadId: cuenta._id, tipo: 'item_anulado', de, a: 'anulado', motivo: texto, ...quien(sesion),
            datos: { comanda: comanda._id, numeroRonda: comanda.numeroRonda, item: resumenItem(item) }, session,
        })
        return detalle(cuenta, session)
    })
}

/** La mesa pide la cuenta: exige algo enviado y no anulado, y nada pendiente en el borrador. */
export const solicitarCuenta = async (cuentaId, datos, sesion) => {
    exigirPermiso(sesion, 'cuenta:solicitar')
    const { versionEsperada, motivo } = validar(cambioCuentaSchema, datos)

    return conTransaccion(async (session) => {
        const cuenta = await tocarCuenta(cuentaId, { versionEsperada }, session)
        MAQUINA_CUENTA.validar(cuenta.estado, 'cuenta_pedida', { permisos: permisosDe(sesion) })
        const comandas = await Comanda.find({ cuenta: cuenta._id }).select('estado items.estado').session(session).lean()
        if (comandas.some((c) => c.estado === 'borrador' && c.items.length)) {
            throw error(409, 'RONDA_PENDIENTE', 'Hay ítems sin enviar: envíalos o quítalos antes de pedir la cuenta.')
        }
        if (!comandas.some((c) => c.estado === 'enviada' && c.items.some((i) => i.estado !== 'anulado'))) {
            throw error(409, 'CUENTA_SIN_CONSUMO',
                'La cuenta no tiene ítems enviados. Si los clientes se fueron sin pedir o se abrió por error, cancela la cuenta.')
        }
        await moverMesas(cuenta, 'ocupada', 'cuenta_pedida', { sesion, session })
        await cambiarEstadoCuenta(cuenta, 'cuenta_pedida', { sesion, session, motivo: motivo || '' })
        await guardarCuenta(cuenta, session)
        return detalle(cuenta, session)
    })
}

/** D4: cancela una cuenta abierta sin ítems enviados (abierta por error, clientes que se fueron). */
export const cancelarCuenta = async (cuentaId, datos, sesion) => {
    exigirPermiso(sesion, 'cuenta:abrir')
    const { versionEsperada, motivo } = validar(cambioCuentaSchema, datos)

    return conTransaccion(async (session) => {
        const cuenta = await tocarCuenta(cuentaId, { versionEsperada }, session)
        const { motivo: texto } = MAQUINA_CUENTA.validar(cuenta.estado, 'cancelada', { permisos: permisosDe(sesion), motivo })
        // Cuenta también un ítem enviado y luego anulado: ya llegó a cocina o barra (mermas)
        if (await Comanda.exists({ cuenta: cuenta._id, estado: 'enviada' }).session(session)) {
            throw error(409, 'CUENTA_CON_ITEMS_ENVIADOS',
                'La cuenta tiene ítems enviados a cocina o barra: no se puede cancelar. Un administrador puede cerrarla sin cobro.')
        }
        await cerrarCuenta(cuenta, 'cancelada', { sesion, session, motivo: texto })
        return detalle(cuenta, session)
    })
}

/** F1-13: cierre sin cobro (cuenta:cerrar_sin_cobro, hoy solo admin) con motivo. */
export const cerrarSinCobro = async (cuentaId, datos, sesion) => {
    exigirPermiso(sesion, 'cuenta:cerrar_sin_cobro')
    const { versionEsperada, motivo } = validar(cambioCuentaSchema, datos)

    return conTransaccion(async (session) => {
        const cuenta = await tocarCuenta(cuentaId, { versionEsperada }, session)
        const { motivo: texto } = MAQUINA_CUENTA.validar(cuenta.estado, 'cerrada_sin_cobro', { permisos: permisosDe(sesion), motivo })
        await cerrarCuenta(cuenta, 'cerrada_sin_cobro', { sesion, session, motivo: texto })
        return detalle(cuenta, session)
    })
}

/**
 * Transiciones manuales de la mesa: por_limpiar → libre y libre ↔ bloqueada. Solo sin cuenta
 * (cuentaActual null o ausente): una mesa ocupada o con la cuenta pedida pasa a por_limpiar
 * únicamente al cerrar o cancelar su cuenta.
 */
export const cambiarEstadoMesa = async (mesaId, datos, sesion) => {
    // Sin ninguno de los permisos de las transiciones manuales, 403 antes de leer la mesa
    if (!['mesa:operar', 'mesa:bloquear'].some((clave) => tienePermiso(permisosDe(sesion), clave))) exigirPermiso(sesion, 'mesa:operar')
    const { a, motivo } = validar(cambioMesaSchema, datos)
    if (!mongoose.isValidObjectId(mesaId)) throw error(404, 'MESA_NO_ENCONTRADA', 'La mesa no existe.')

    return conTransaccion(async (session) => {
        const mesa = await Mesa.findById(mesaId).session(session).lean()
        if (!mesa) throw error(404, 'MESA_NO_ENCONTRADA', 'La mesa no existe.')
        const { motivo: texto } = MAQUINA_MESA.validar(mesa.estado, a, { via: 'manual', permisos: permisosDe(sesion), motivo })
        if (mesa.cuentaActual) {
            throw error(409, 'MESA_CON_CUENTA', `La mesa ${mesa.numero} tiene una cuenta: cambia al cerrar o cancelar esa cuenta.`,
                { cuenta: String(mesa.cuentaActual) })
        }
        const actualizada = await Mesa.findOneAndUpdate(
            { _id: mesa._id, estado: mesa.estado, cuentaActual: null },
            { $set: { estado: a } },
            { returnDocument: 'after', session, runValidators: true },
        )
        if (!actualizada) throw error(409, 'CONFLICTO_ESTADO', 'La mesa cambió mientras la editabas. Recarga e intenta de nuevo.')
        await registrarEvento({ entidad: 'mesa', entidadId: mesa._id, de: mesa.estado, a, motivo: texto, ...quien(sesion), session })
        return { id: String(actualizada._id), numero: actualizada.numero, estado: actualizada.estado }
    })
}
