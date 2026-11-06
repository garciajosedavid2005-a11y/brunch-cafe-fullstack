// Migración 0.7: estados con `codigo` fijo + bitácora inicial en Evento.
//
// up   (no destructiva)
//   - A cada Estado existente le asigna `codigo`, `orden` y `esFinal` según la
//     tabla de equivalencias; guarda los valores anteriores en `_migracion07`.
//     Solo renombra la etiqueta cuando cambia el significado ("Recibido" → "Entregado").
//   - Inserta los estados del catálogo que falten (marcados `_migracion07.insertado`).
//   - Crea un Evento inicial por pedido/reserva (motivo "migracion 0.7", actor "sistema").
//   - No toca pedidos ni reservas: siguen apuntando al mismo _id de Estado.
//   - Si algún estado no encaja en la tabla, no adivina: aborta y lo lista.
// down
//   - Borra los eventos de la migración y los estados insertados (si nadie los usa),
//     y restaura nombre/esFinal originales quitando codigo, orden y _migracion07.
import { CATALOGO_ESTADOS, TIPOS_ESTADO, definicionEstado, ordenDe } from '../modulos/compartido/estados.js'

export const MOTIVO = 'migracion 0.7'
export const ACTOR = 'sistema'

// nombre normalizado → { codigo, renombrarA? }. Solo equivalencias evidentes.
export const EQUIVALENCIAS = {
    pedido: {
        'pendiente': { codigo: 'pendiente' },
        'confirmado': { codigo: 'confirmado' },
        'en preparacion': { codigo: 'en_preparacion' },
        'listo': { codigo: 'listo' },
        'en camino': { codigo: 'en_camino' },
        'recibido': { codigo: 'entregado', renombrarA: 'Entregado' },
        'entregado': { codigo: 'entregado' },
        'cancelado': { codigo: 'cancelado' },
    },
    reserva: {
        'pendiente': { codigo: 'pendiente' },
        'confirmada': { codigo: 'confirmada' },
        'sentada': { codigo: 'sentada' },
        'completada': { codigo: 'completada' },
        'cancelada': { codigo: 'cancelada' },
        'no show': { codigo: 'no_show' },
    },
}

export const normalizar = (texto) =>
    String(texto ?? '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()

const COLECCION_DE = { pedido: 'pedidos', reserva: 'reservas' }

const contarUsos = async (db, estadoId) => ({
    pedidos: await db.collection('pedidos').countDocuments({ estado: estadoId }),
    reservas: await db.collection('reservas').countDocuments({ estado: estadoId }),
})

/** Calcula el plan de `up` sin escribir nada. */
export const planUp = async (db) => {
    const estados = await db.collection('estados').find().toArray()
    const plan = { equivalencias: [], yaMigrados: [], sinEquivalencia: [], conflictos: [], insertar: [], eventos: [] }
    const codigoPorEstadoId = new Map()
    const ocupados = Object.fromEntries(TIPOS_ESTADO.map((tipo) => [tipo, new Map()]))

    for (const estado of estados) {
        const usos = await contarUsos(db, estado._id)
        const base = { _id: estado._id, tipo: estado.tipo, nombre: estado.nombre, ...usos }
        let codigo = estado.codigo
        if (codigo) {
            plan.yaMigrados.push({ ...base, codigo })
        } else {
            const equivalencia = EQUIVALENCIAS[estado.tipo]?.[normalizar(estado.nombre)]
            if (!equivalencia) {
                plan.sinEquivalencia.push(base)
                continue
            }
            codigo = equivalencia.codigo
            plan.equivalencias.push({ ...base, codigo, renombrarA: equivalencia.renombrarA || null })
        }
        const previo = ocupados[estado.tipo]?.get(codigo)
        if (previo) {
            plan.conflictos.push({ tipo: estado.tipo, codigo, nombres: [previo.nombre, estado.nombre] })
        } else {
            ocupados[estado.tipo]?.set(codigo, estado)
        }
        codigoPorEstadoId.set(String(estado._id), codigo)
    }

    // Estados del catálogo que no existen todavía
    const nombresUsados = new Set(estados.map((e) => `${e.tipo}|${normalizar(e.nombre)}`))
    for (const tipo of TIPOS_ESTADO) {
        for (const definicion of CATALOGO_ESTADOS[tipo]) {
            if (ocupados[tipo].has(definicion.codigo)) continue
            const renombrado = plan.equivalencias.some((e) => e.tipo === tipo && normalizar(e.renombrarA) === normalizar(definicion.nombre))
            if (nombresUsados.has(`${tipo}|${normalizar(definicion.nombre)}`) || renombrado) {
                plan.conflictos.push({ tipo, codigo: definicion.codigo, nombres: [definicion.nombre], motivo: 'la etiqueta ya la usa otro estado' })
                continue
            }
            plan.insertar.push({ tipo, codigo: definicion.codigo, nombre: definicion.nombre })
        }
    }

    // Un evento inicial por pedido/reserva que aún no lo tenga
    for (const tipo of TIPOS_ESTADO) {
        const documentos = await db.collection(COLECCION_DE[tipo]).find({}, { projection: { estado: 1 } }).toArray()
        for (const documento of documentos) {
            const yaTiene = await db.collection('eventos').countDocuments({ entidad: tipo, entidadId: documento._id, motivo: MOTIVO })
            if (yaTiene) continue
            const codigo = codigoPorEstadoId.get(String(documento.estado))
            if (!codigo) {
                plan.sinEquivalencia.push({ _id: documento._id, tipo, nombre: `(${tipo} ${documento._id} apunta a un estado inexistente: ${documento.estado})` })
                continue
            }
            const original = estados.find((e) => String(e._id) === String(documento.estado))
            plan.eventos.push({ entidad: tipo, entidadId: documento._id, a: codigo, estadoLegado: original?.nombre })
        }
    }

    plan.puedeAplicar = plan.sinEquivalencia.length === 0 && plan.conflictos.length === 0
    return plan
}

export const up = async (db, { dryRun = false, ahora = new Date() } = {}) => {
    const plan = await planUp(db)
    if (dryRun || !plan.puedeAplicar) return { ...plan, aplicado: false }

    const estadosCol = db.collection('estados')
    for (const e of plan.equivalencias) {
        const original = await estadosCol.findOne({ _id: e._id })
        await estadosCol.updateOne({ _id: original._id, codigo: { $exists: false } }, {
            $set: {
                codigo: e.codigo,
                orden: ordenDe(e.tipo, e.codigo),
                esFinal: definicionEstado(e.tipo, e.codigo).esFinal,
                nombre: e.renombrarA || original.nombre,
                // updatedAt no se toca para que `down` deje el documento idéntico
                _migracion07: {
                    fecha: ahora,
                    nombre: original.nombre,
                    teniaEsFinal: Object.hasOwn(original, 'esFinal'),
                    esFinal: original.esFinal ?? null,
                },
            },
        })
    }

    if (plan.insertar.length) {
        await estadosCol.insertMany(plan.insertar.map(({ tipo, codigo }) => {
            const { esFinal, ...presentacion } = definicionEstado(tipo, codigo)
            return {
                ...presentacion, tipo, codigo, esFinal, orden: ordenDe(tipo, codigo),
                createdAt: ahora, updatedAt: ahora, _migracion07: { insertado: true },
            }
        }))
    }

    if (plan.eventos.length) {
        await db.collection('eventos').insertMany(plan.eventos.map(({ entidad, entidadId, a, estadoLegado }) => ({
            entidad, entidadId, tipo: 'cambio_estado', de: null, a,
            motivo: MOTIVO, usuario: null, actor: ACTOR, datos: { estadoLegado }, createdAt: ahora,
        })))
    }
    return { ...plan, aplicado: true }
}

/** Calcula el plan de `down` sin escribir nada. */
export const planDown = async (db) => {
    const estadosCol = db.collection('estados')
    const restaurar = await estadosCol.find({ '_migracion07.nombre': { $exists: true } }).toArray()
    const insertados = await estadosCol.find({ '_migracion07.insertado': true }).toArray()
    const plan = {
        restaurar: restaurar.map((e) => ({ tipo: e.tipo, codigo: e.codigo, nombre: e.nombre, nombreOriginal: e._migracion07.nombre })),
        borrarEstados: [],
        bloqueados: [],
        borrarEventos: await db.collection('eventos').countDocuments({ motivo: MOTIVO, actor: ACTOR }),
        eventosDeLaApp: await db.collection('eventos').countDocuments({ $nor: [{ motivo: MOTIVO, actor: ACTOR }] }),
    }
    for (const e of insertados) {
        const usos = await contarUsos(db, e._id)
        const fila = { tipo: e.tipo, codigo: e.codigo, nombre: e.nombre, ...usos }
        if (usos.pedidos + usos.reservas > 0) plan.bloqueados.push(fila)
        else plan.borrarEstados.push(fila)
    }
    plan.puedeAplicar = plan.bloqueados.length === 0
    return plan
}

export const down = async (db, { dryRun = false } = {}) => {
    const plan = await planDown(db)
    if (dryRun || !plan.puedeAplicar) return { ...plan, aplicado: false }

    const estadosCol = db.collection('estados')
    await db.collection('eventos').deleteMany({ motivo: MOTIVO, actor: ACTOR })
    await estadosCol.deleteMany({ '_migracion07.insertado': true })
    const restaurar = await estadosCol.find({ '_migracion07.nombre': { $exists: true } }).toArray()
    for (const e of restaurar) {
        const respaldo = e._migracion07
        await estadosCol.updateOne({ _id: e._id }, {
            $set: { nombre: respaldo.nombre, ...(respaldo.teniaEsFinal ? { esFinal: respaldo.esFinal } : {}) },
            $unset: { codigo: '', orden: '', _migracion07: '', ...(respaldo.teniaEsFinal ? {} : { esFinal: '' }) },
        })
    }
    return { ...plan, aplicado: true }
}
