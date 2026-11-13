// Catálogo de estados y máquina de transiciones (fuente de verdad: este archivo).
//
// - El `codigo` es fijo y es lo que usa el código; el admin solo edita la
//   presentación (nombre/etiqueta, descripción y colores) desde el dashboard.
// - `esFinal` lo decide el catálogo: un estado final nunca se reabre.
// - Cada transición declara quién la hace (staff o cliente), qué permiso exige
//   y si necesita motivo. Lo que no está aquí, no se permite.
import { AppError } from './errors.js'
import { CLAVES, tienePermiso } from '../identidad/permisos.js'

export const TIPOS_ESTADO = ['pedido', 'reserva']

const estado = (codigo, nombre, descripcion, badgeType, color, bg, esFinal = false) =>
    ({ codigo, nombre, descripcion, badgeType, color, bg, esFinal })

const AMARILLO = ['warning', '#7a5000', '#fff8e1'] // texto ≥ 6:1
const AZUL = ['info', '#345b88', '#eaf1fa']
const VERDE = ['success', '#346d34', '#e8f4e8']
const ROJO = ['danger', '#a33a3a', '#fdecec']
const GRIS = ['neutral', '#5f5f5f', '#f0f0f0']

export const CATALOGO_ESTADOS = {
    pedido: [
        estado('pendiente', 'Pendiente', 'Pedido recibido y pendiente de confirmación.', ...AMARILLO),
        estado('confirmado', 'Confirmado', 'El café confirmó el pedido.', ...AZUL),
        estado('en_preparacion', 'En preparación', 'El pedido se está preparando.', ...AZUL),
        estado('listo', 'Listo', 'El pedido está listo para salir o ser recogido.', ...VERDE),
        estado('en_camino', 'En camino', 'El domiciliario va hacia la dirección de entrega.', ...AZUL),
        estado('entregado', 'Entregado', 'El cliente recibió su pedido.', ...VERDE, true),
        estado('cancelado', 'Cancelado', 'El pedido fue cancelado.', ...ROJO, true),
    ],
    reserva: [
        estado('pendiente', 'Pendiente', 'Reserva recibida y pendiente de aprobación.', ...AMARILLO),
        estado('confirmada', 'Confirmada', 'El café confirmó la reserva.', ...VERDE),
        estado('sentada', 'Sentada', 'Los comensales llegaron y están en su mesa.', ...AZUL),
        estado('completada', 'Completada', 'La visita terminó.', ...GRIS, true),
        estado('cancelada', 'Cancelada', 'La reserva fue cancelada.', ...ROJO, true),
        estado('no_show', 'No asistió', 'Los comensales no llegaron a la reserva confirmada.', ...GRIS, true),
    ],
}

export const CODIGOS_ESTADO = Object.fromEntries(
    TIPOS_ESTADO.map((tipo) => [tipo, CATALOGO_ESTADOS[tipo].map((e) => e.codigo)])
)

export const ordenDe = (tipo, codigo) => CODIGOS_ESTADO[tipo].indexOf(codigo) + 1

export const definicionEstado = (tipo, codigo) =>
    CATALOGO_ESTADOS[tipo]?.find((e) => e.codigo === codigo) || null

export const esEstadoFinal = (tipo, codigo) => Boolean(definicionEstado(tipo, codigo)?.esFinal)

// Modalidad del pedido: hoy todos son domicilio; "para llevar" llegará con su campo.
const modalidad = (contexto) => contexto?.modalidad || 'domicilio'

const staff = (de, a, permiso, extra = {}) => ({ actor: 'staff', de: [].concat(de), a, permiso, ...extra })
const cliente = (de, a, extra = {}) => ({ actor: 'cliente', de: [].concat(de), a, ...extra })
// 2.3 · La cocina y la barra preparan el domicilio (F2-3): solo confirmado → en_preparacion → listo
const cocina = (de, a, permiso) => ({ actor: 'cocina', de: [].concat(de), a, permiso })
// Actores que piden la transición con un permiso propio
const CON_PERMISO = ['staff', 'cocina']

export const TRANSICIONES = {
    pedido: [
        staff('pendiente', 'confirmado', 'pedido:cambiar_estado'),
        staff('confirmado', 'en_preparacion', 'pedido:cambiar_estado'),
        staff('en_preparacion', 'listo', 'pedido:cambiar_estado'),
        staff('listo', 'en_camino', 'pedido:cambiar_estado', { condicion: (c) => modalidad(c) === 'domicilio' }),
        staff('en_camino', 'entregado', 'pedido:cambiar_estado'),
        staff('listo', 'entregado', 'pedido:cambiar_estado', { condicion: (c) => modalidad(c) === 'para_llevar' }),
        staff(['pendiente', 'confirmado'], 'cancelado', 'pedido:cancelar', { requiereMotivo: true }),
        cliente('pendiente', 'cancelado', { motivoPorDefecto: 'cancelado por cliente' }),
        cocina('confirmado', 'en_preparacion', 'pedido:preparar'),
        cocina('en_preparacion', 'listo', 'pedido:preparar'),
    ],
    reserva: [
        staff('pendiente', 'confirmada', 'reserva:cambiar_estado'),
        staff('confirmada', 'sentada', 'reserva:cambiar_estado'),
        // Check-in de quien llega sin que su reserva se haya confirmado (único salto permitido)
        staff('pendiente', 'sentada', 'reserva:cambiar_estado', { motivoPorDefecto: 'check-in sin confirmar' }),
        staff('sentada', 'completada', 'reserva:cambiar_estado'),
        staff('confirmada', 'no_show', 'reserva:cambiar_estado'),
        staff(['pendiente', 'confirmada'], 'cancelada', 'reserva:cambiar_estado', { requiereMotivo: true }),
        cliente(['pendiente', 'confirmada'], 'cancelada', { motivoPorDefecto: 'cancelada por cliente' }),
        // Editar una reserva confirmada la devuelve a pendiente de aprobación
        cliente('confirmada', 'pendiente', { motivoPorDefecto: 'editada por cliente' }),
    ],
}

// Comprobación al cargar: toda transición usa códigos y permisos del catálogo
for (const tipo of TIPOS_ESTADO) {
    for (const t of TRANSICIONES[tipo]) {
        for (const codigo of [...t.de, t.a]) {
            if (!CODIGOS_ESTADO[tipo].includes(codigo)) throw new Error(`Transición con código desconocido: ${tipo}.${codigo}`)
        }
        if (CON_PERMISO.includes(t.actor) && !CLAVES.includes(t.permiso)) throw new Error(`Transición con permiso desconocido: ${t.permiso}`)
        if (t.de.some((codigo) => esEstadoFinal(tipo, codigo))) throw new Error(`Transición que reabre un estado final: ${tipo}.${t.de}`)
    }
}

const aplica = (t, de, contexto) => t.de.includes(de) && (!t.condicion || t.condicion(contexto))

/** Transiciones que `actor` ('staff' | 'cliente') puede hacer desde `de`. Para staff filtra por permisos. */
export const transicionesDisponibles = (tipo, de, { actor = 'staff', permisos = [], contexto } = {}) =>
    (TRANSICIONES[tipo] || []).filter((t) =>
        t.actor === actor && aplica(t, de, contexto) && (!CON_PERMISO.includes(actor) || tienePermiso(permisos, t.permiso))
    )

/**
 * Valida un cambio de estado y devuelve la transición y el motivo final.
 * Lanza AppError con códigos estables:
 *   ESTADO_INVALIDO (400), ESTADO_FINAL (409), TRANSICION_INVALIDA (409),
 *   FORBIDDEN (403, falta el permiso de esa transición), MOTIVO_REQUERIDO (400).
 */
export const validarTransicion = (tipo, de, a, { actor = 'staff', permisos = [], motivo, contexto } = {}) => {
    if (!CODIGOS_ESTADO[tipo]?.includes(a)) {
        throw new AppError(400, 'ESTADO_INVALIDO', `El estado "${a}" no existe para ${tipo}.`)
    }
    if (esEstadoFinal(tipo, de)) {
        throw new AppError(409, 'ESTADO_FINAL', `El ${tipo} ya está en un estado final y no puede cambiar.`, { de })
    }
    const transicion = (TRANSICIONES[tipo] || []).find((t) => t.actor === actor && t.a === a && aplica(t, de, contexto))
    if (!transicion) {
        const permitidos = transicionesDisponibles(tipo, de, { actor, permisos, contexto }).map((t) => t.a)
        throw new AppError(409, 'TRANSICION_INVALIDA', `No se puede pasar de "${de}" a "${a}".`, { de, a, permitidos })
    }
    if (CON_PERMISO.includes(actor) && !tienePermiso(permisos, transicion.permiso)) {
        throw new AppError(403, 'FORBIDDEN', 'No tienes permiso para realizar esta acción.', { requiere: [transicion.permiso] })
    }
    const texto = typeof motivo === 'string' ? motivo.trim() : ''
    if (transicion.requiereMotivo && !texto) {
        throw new AppError(400, 'MOTIVO_REQUERIDO', 'Indica el motivo de este cambio.')
    }
    return { transicion, motivo: texto || transicion.motivoPorDefecto || '' }
}

// Valores que el portal del cliente ya conoce (status en inglés): se mantienen por compatibilidad
export const STATUS_CLIENTE = {
    pedido: {
        pendiente: 'pending',
        confirmado: 'confirmed',
        en_preparacion: 'preparing',
        listo: 'ready',
        en_camino: 'on_the_way',
        entregado: 'delivered',
        cancelado: 'cancelled',
    },
    reserva: {
        pendiente: 'pending',
        confirmada: 'confirmed',
        sentada: 'seated',
        completada: 'completed',
        cancelada: 'cancelled',
        no_show: 'no_show',
    },
}

// 1.4 · Máquinas de mesa, cuenta e ítem (enums en el documento, sin colección Estado)
export {
    MAQUINA_MESA, MAQUINA_CUENTA, MAQUINA_ITEM, ESTADOS_MESA, ESTADOS_CUENTA, ESTADOS_CUENTA_ABIERTA,
    ESTADOS_ITEM, ESTADOS_ITEM_ANULABLE, MESA_SEGUN_CUENTA, MOTIVOS_ANULACION,
} from './estadosSalon.js'
