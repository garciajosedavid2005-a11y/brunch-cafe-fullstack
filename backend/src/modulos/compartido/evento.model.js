import mongoose from 'mongoose'
import { AppError } from './errors.js'

// Bitácora de pedidos, reservas, (1.4) mesas y cuentas, (1.5b) usuarios y (1.14) configuración
// (solo se agregan registros).
// Los cambios de una comanda (ítems y rondas) se registran en su cuenta (entidad 'cuenta', con
// datos.comanda): así el historial de una cuenta sale con el índice { entidad, entidadId, createdAt }.
// 1.5b · 'usuario': alta de cuentas desde el admin (quién la creó)
// 1.14 · 'configuracion': cambios de los horarios (quién y datos.antes / datos.despues)
// 2.7 · 'producto' (F2-5) y 'modificador' (grupo de modificadores; datos.opcion y datos.nombre): agotar y
// reactivar desde la operación, con quién lo hizo
export const ENTIDADES_EVENTO = ['pedido', 'reserva', 'mesa', 'cuenta', 'usuario', 'configuracion', 'producto', 'modificador']
// Los Eventos anteriores a 1.4 no guardan `tipo` (se leen como 'cambio_estado' por el default): un filtro
// por tipo debe usar { tipo: { $in: ['cambio_estado', null] } } para incluirlos.
export const TIPOS_EVENTO = [
    'cambio_estado', 'item_agregado', 'item_modificado', 'item_quitado', 'item_anulado', 'ronda_enviada', 'ronda_descartada',
    // 1.5 · Operaciones de salón sobre la cuenta (la mesa deja además su cambio de estado)
    'cuenta_transferida', 'mesa_movida', 'mesas_unidas', 'mesa_separada',
    'usuario_creado', 'enlace_reenviado',
    'horarios_cambiados',
    // 2.2 · Cocina, barra y servir: de/a con el estado del ítem y datos.item (entidad 'cuenta')
    'item_estado_cambiado',
    // 2.3 · Una estación terminó su parte de un pedido a domicilio (entidad 'pedido', datos.estacion)
    'estacion_lista',
    // 2.7 · Agotar y reactivar (de/a: 'disponible' ↔ 'agotado')
    'producto_agotado', 'producto_reactivado', 'opcion_agotada', 'opcion_reactivada',
    // Fase 3 · Cobro en caja (entidad 'cuenta'; datos: comprobante, montos y métodos)
    'cuenta_cobrada',
]
const eventoSchema = new mongoose.Schema({
    entidad: {
        type: String,
        enum: ENTIDADES_EVENTO,
        required: true
    },
    entidadId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true
    },
    tipo: {
        type: String,
        enum: TIPOS_EVENTO,
        default: 'cambio_estado'
    },
    // Códigos de estado; `de` es null en el registro inicial. `a` es obligatorio en los cambios de
    // estado (y en item_anulado lleva 'anulado'); los demás tipos describen el cambio en `datos`.
    de: {
        type: String,
        default: null
    },
    a: {
        type: String,
        // 2.2 · También en los cambios de estado de un ítem en cocina y al servir
        required: function () { return ['cambio_estado', 'item_estado_cambiado'].includes(this.tipo) }
    },
    motivo: {
        type: String,
        trim: true,
        maxlength: 300,
        default: ''
    },
    // Quién hizo el cambio: usuario null + actor "sistema" para procesos automáticos
    usuario: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Usuario',
        default: null
    },
    actor: {
        type: String,
        required: true
    },
    datos: {
        type: mongoose.Schema.Types.Mixed
    }
}, {
    timestamps: { createdAt: true, updatedAt: false }
})

eventoSchema.index({ entidad: 1, entidadId: 1, createdAt: 1 })

// 1.15 · Inmutables: la bitácora solo crece. Toda actualización, reemplazo o borrado por el modelo se
// rechaza (consultas, documentos y bulkWrite). La única salida es explícita: una migración o un seed que
// de verdad lo necesite pasa la opción `modificarEventos` con su motivo, p. ej.
//   Evento.updateMany(filtro, cambio, { modificarEventos: 'migración 2.x: …' })
//   Evento.deleteMany(filtro).setOptions({ modificarEventos: 'migración 0.7 --down' })
// Esa salida existe solo para consultas del modelo y `bulkWrite`; las operaciones de documento
// (`save` de uno existente, `doc.deleteOne`, `doc.updateOne`, `doc.replaceOne`, `bulkSave`) se rechazan siempre.
// El driver directo (`Evento.collection`, `db.collection('eventos')`) y las agregaciones con `$out` o
// `$merge` hacia `eventos` no pasan por aquí: solo en migraciones, con un comentario que diga por qué
// (como el --down de 0.7). Los tests limpian así.
export const MENSAJE_EVENTO_INMUTABLE = 'Los Eventos no se pueden modificar ni borrar (bitácora de solo inserción).'
const eventoInmutable = () => new AppError(500, 'EVENTO_INMUTABLE', MENSAJE_EVENTO_INMUTABLE)
const conMotivo = (opciones) => typeof opciones?.modificarEventos === 'string' && opciones.modificarEventos.trim() !== ''

const OPERACIONES_QUE_CAMBIAN = ['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace',
    'deleteOne', 'deleteMany', 'findOneAndDelete']
eventoSchema.pre(OPERACIONES_QUE_CAMBIAN, { query: true, document: false }, function () {
    if (!conMotivo(this.getOptions())) throw eventoInmutable()
})
// Documentos: guardar uno ya existente (cambios) o borrarlo
eventoSchema.pre('save', function () {
    if (!this.isNew) throw eventoInmutable()
})
eventoSchema.pre(['deleteOne', 'updateOne'], { document: true, query: false }, function () {
    throw eventoInmutable()
})
// bulkWrite: solo inserciones (salvo con motivo explícito)
eventoSchema.pre('bulkWrite', function (operaciones, opciones) {
    const cambia = (operaciones || []).some((op) => !('insertOne' in op))
    if (cambia && !conMotivo(opciones)) throw eventoInmutable()
})

export default mongoose.model('Evento', eventoSchema)
