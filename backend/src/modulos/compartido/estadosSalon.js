// 1.4 · Máquinas de estado de mesa, cuenta e ítem de comanda (enums en cada documento; no usan la
// colección Estado, que es la de pedidos y reservas). Se exportan también desde estados.js.
// Decisiones: F1-2 (mesa), F1-6 (anular), F1-13 (cerrar sin cobro) y D1–D4 de 1.4 (PROGRESO, 2026-11-07).
// El plan (§1.4) las ubicaba en estados.js; viven aquí, con el motor en maquinaEstados.js, y estados.js las reexporta.
import { crearMaquina } from './maquinaEstados.js'

export const ESTADOS_MESA = ['libre', 'ocupada', 'cuenta_pedida', 'por_limpiar', 'bloqueada']
export const ESTADOS_CUENTA = ['abierta', 'cuenta_pedida', 'cerrada', 'cerrada_sin_cobro', 'cancelada']
export const ESTADOS_CUENTA_ABIERTA = ['abierta', 'cuenta_pedida']
export const ESTADOS_ITEM = ['borrador', 'enviado', 'en_preparacion', 'listo', 'servido', 'anulado']
export const ESTADOS_ITEM_ANULABLE = ['enviado', 'en_preparacion', 'listo']

// Mesa. A mano (via 'manual') solo: limpiar y bloquear/desbloquear, y nunca con una cuenta encima
// (lo comprueba el servicio con cuentaActual). El resto lo provoca la cuenta (via 'sistema').
export const MAQUINA_MESA = crearMaquina({
    nombre: 'mesa',
    estados: ESTADOS_MESA,
    transiciones: [
        { de: 'libre', a: 'ocupada', via: 'sistema' },               // al abrir la cuenta (cuenta:abrir)
        { de: 'ocupada', a: 'cuenta_pedida', via: 'sistema' },       // al solicitar la cuenta
        { de: 'cuenta_pedida', a: 'ocupada', via: 'sistema' },       // al reabrirla (D2)
        { de: ['ocupada', 'cuenta_pedida'], a: 'por_limpiar', via: 'sistema' }, // al cerrar o cancelar la cuenta
        { de: 'por_limpiar', a: 'libre', via: 'manual', permiso: 'mesa:operar' },
        { de: 'libre', a: 'bloqueada', via: 'manual', permiso: 'mesa:bloquear', requiereMotivo: true },
        { de: 'bloqueada', a: 'libre', via: 'manual', permiso: 'mesa:bloquear', requiereMotivo: true },
    ],
})

// Estado de la mesa que corresponde a cada estado abierto de la cuenta
export const MESA_SEGUN_CUENTA = { abierta: 'ocupada', cuenta_pedida: 'cuenta_pedida' }

export const MAQUINA_CUENTA = crearMaquina({
    nombre: 'cuenta',
    estados: ESTADOS_CUENTA,
    finales: ['cerrada', 'cerrada_sin_cobro', 'cancelada'],
    transiciones: [
        { de: 'abierta', a: 'cuenta_pedida', permiso: 'cuenta:solicitar' },
        { de: 'cuenta_pedida', a: 'abierta', permiso: 'comanda:tomar' }, // agregar un ítem la reabre (D2)
        { de: ['abierta', 'cuenta_pedida'], a: 'cerrada_sin_cobro', permiso: 'cuenta:cerrar_sin_cobro', requiereMotivo: true },
        // Cobro: Fase 3, sin uso aún. Permiso provisional: quién cobra y cierra se decide en la Fase 3
        { de: 'cuenta_pedida', a: 'cerrada', permiso: 'caja:cerrar' },
        { de: 'abierta', a: 'cancelada', permiso: 'cuenta:abrir', requiereMotivo: true }, // solo sin ítems enviados (D4)
    ],
})

export const MAQUINA_ITEM = crearMaquina({
    nombre: 'ítem',
    estados: ESTADOS_ITEM,
    finales: ['servido', 'anulado'],
    transiciones: [
        { de: 'borrador', a: 'enviado', permiso: 'comanda:enviar' },
        // Pasos de cocina y barra: los opera el KDS en la Fase 2 (con su permiso)
        { de: 'enviado', a: 'en_preparacion', via: 'sistema' },
        { de: 'en_preparacion', a: 'listo', via: 'sistema' },
        { de: 'listo', a: 'servido', via: 'sistema' },
        // Servido no se anula: será cortesía o descuento en la Fase 3 (D1). En borrador se quita.
        { de: ESTADOS_ITEM_ANULABLE, a: 'anulado', permiso: 'item:anular', requiereMotivo: true },
    ],
})

// Motivos de anulación (D1): catálogo + «otro» con texto. Se guardan en el ítem y en el Evento (mermas, Fase 5).
export const MOTIVOS_ANULACION = {
    error_toma: 'Error de toma',
    cliente_cambio: 'El cliente cambió el pedido',
    producto_defectuoso: 'Producto defectuoso',
    demora: 'Demora',
    otro: 'Otro',
}
