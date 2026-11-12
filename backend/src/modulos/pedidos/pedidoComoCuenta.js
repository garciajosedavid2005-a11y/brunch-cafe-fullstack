// 1.9 · Adaptador del domicilio (opción A, F1-11): el domicilio sigue en Pedido durante la Fase 1 y,
// para la vista «Cuentas abiertas» del staff, cada pedido se lee con la misma forma que una cuenta
// de salón. Cuando la Fase 6 lleve el domicilio al motor de cuentas, esta es la única pieza que cambia;
// el portal del cliente (/api/v1/cliente/pedidos) tiene su propia serialización y no se toca.

/** Código visible del pedido (el mismo que en el panel de pedidos del staff). */
export const codigoPedido = (id) => `PED-${String(id).slice(-6).toUpperCase()}`

/**
 * Pedido (lean, con `estado` poblado con codigo y nombre) → fila de «Cuentas abiertas».
 * Sin datos de contacto: ni correo, ni teléfono, ni dirección (están en el detalle del pedido).
 * Un pedido anterior a 1.9 no tiene `canal`: todos los de la Fase 1 son domicilio.
 */
export const pedidoComoCuenta = (pedido, ahora = new Date()) => {
    const desde = new Date(pedido.createdAt)
    return {
        id: String(pedido._id),
        canal: pedido.canal || 'domicilio',
        codigo: codigoPedido(pedido._id),
        estado: { codigo: pedido.estado?.codigo || '', nombre: pedido.estado?.nombre || '' },
        // El canal ya lo dice la etiqueta: la referencia es el barrio (como «Mesa 3» en el salón)
        referencia: pedido.barrio || 'Sin barrio',
        cliente: pedido.nombreEntrega || 'Cliente',
        responsable: null,
        total: pedido.total,
        pendiente: 0,
        hora: pedido.horaEntrega || '',
        entregaEn: pedido.entregaEn || null,
        desde: desde.toISOString(),
        minutos: Math.max(0, Math.floor((ahora - desde) / 60_000)),
    }
}
