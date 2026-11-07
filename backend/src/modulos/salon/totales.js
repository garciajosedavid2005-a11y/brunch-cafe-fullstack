// 1.4 · Totales de ítems, rondas y cuentas: funciones puras, enteros en COP. El servidor los
// recalcula siempre desde los ítems (nunca con $inc sobre montos) y los esquemas de Comanda y
// Cuenta rechazan un documento cuyos montos no coincidan con estas mismas funciones.

const entero = (valor, campo) => {
    if (!Number.isSafeInteger(valor) || valor < 0) throw new RangeError(`${campo} debe ser un entero en COP ≥ 0 (recibido: ${valor})`)
    return valor
}

/** Precio base + recargos de los modificadores elegidos. */
export const precioUnitario = (precioBase, modificadores = []) =>
    entero(modificadores.reduce((suma, m) => suma + entero(m.precioExtra, 'El recargo'), entero(precioBase, 'El precio base')), 'El precio unitario')

/** { precioUnitario, subtotal } de un ítem. */
export const calcularItem = ({ precioBase, modificadores, cantidad }) => {
    const unitario = precioUnitario(precioBase, modificadores)
    return { precioUnitario: unitario, subtotal: entero(unitario * entero(cantidad, 'La cantidad'), 'El subtotal') }
}

/** Lo que suma una ronda: sus ítems no anulados. */
export const subtotalRonda = (items = []) =>
    items.reduce((suma, item) => (item.estado === 'anulado' ? suma : suma + entero(item.subtotal, 'El subtotal')), 0)

/**
 * Totales de la cuenta a partir de sus rondas:
 *   subtotal = rondas enviadas (sin anulados): lo que se cobraría;
 *   pendiente = la ronda en borrador (aún no enviada);
 *   total = subtotal, mientras impuestos, propina y descuento sigan en null (Fase 3).
 */
export const totalesCuenta = (comandas = []) => {
    let subtotal = 0
    let pendiente = 0
    for (const comanda of comandas) {
        if (comanda.estado === 'borrador') pendiente += subtotalRonda(comanda.items)
        else subtotal += subtotalRonda(comanda.items)
    }
    return { subtotal: entero(subtotal, 'El subtotal'), pendiente: entero(pendiente, 'El pendiente'), total: subtotal }
}
