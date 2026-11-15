# Plan Fase 3b — Caja completa

Pedido por Brayan el 2026-11-14. Orden: 3b.1 → 3b.4, un commit por ítem. Las decisiones F3b-* son de Claude (a confirmar por Brayan).

## Ítems

| ID | Ítem | Qué entrega |
|---|---|---|
| 3b.1 | Turno de caja | Apertura con base y cierre con arqueo (contado frente a esperado por método, con su diferencia). Sin turno abierto no se cobra (409 `TURNO_CERRADO`). |
| 3b.2 | División de cuenta | Por ítems o en partes iguales. Cada parte tiene su comprobante y la cuenta se cierra al cobrar la última. |
| 3b.3 | Anular comprobante | Solo con `factura:anular` (admin), con motivo. Nota crédito interna `NC-000001`, inmutable, que descuenta en el arqueo. |
| 3b.4 | Cobro de domicilios contra entrega | Lo registra el cajero o el repartidor (`pedido:cobrar`). Genera un comprobante del pedido dentro del turno abierto. |

## Decisiones (Claude, a confirmar por Brayan)

- **F3b-1 · Una sola caja.** Hay como mucho un turno abierto a la vez en todo el local (índice único parcial). Mientras está abierto, cualquiera con `cuenta:cobrar` cobra en él. Lo abre quien tenga `caja:abrir` y lo cierra quien tenga `caja:cerrar`; el cajero recibe ambos (migración 3b, que solo agrega permisos).
- **F3b-2 · Esperado del arqueo por método.**
  - Efectivo: base + lo cobrado en efectivo − el efectivo devuelto por las notas crédito del turno.
  - Tarjeta y transferencia: lo cobrado − lo devuelto.
  - Lo cobrado es el monto aplicado (`monto`), no lo recibido: el cambio ya salió de la caja.
  - La propina va incluida, porque entra a la caja.
  - El cierre guarda contado, esperado y diferencia (contado − esperado) por método. Es inmutable y no exige que cuadre.
- **F3b-3 · Partes iguales.** Se reparte el consumo en N partes enteras en COP: el residuo va de a $1 en las primeras. Cada parte tiene su propina y sus pagos. Una vez cobrada la primera parte, el modo y N no cambian. Cada comprobante lleva una sola línea: «Parte k de N · C-000123».
- **F3b-4 · Por ítems.** Se eligen ítems enteros: la línea completa, sin partir la cantidad. Un ítem cobrado no se vuelve a elegir. No se mezclan los dos modos en una misma cuenta.
- **F3b-5 · Anular no reabre la cuenta.** La cuenta sigue cerrada y el comprobante no se modifica (sigue siendo inmutable). La nota crédito devuelve el total por los mismos métodos del comprobante y entra en el turno abierto en ese momento. Si no hay turno abierto, queda sin turno y no afecta ningún arqueo. Hay una nota por comprobante (índice único).
- **F3b-6 · Domicilios.** Se cobran los pedidos en «en camino» o «entregado» que no tengan comprobante. El comprobante lleva `pedido` en vez de `cuenta` y sus líneas salen del detalle del pedido. Se exige un turno abierto. `pedido:cobrar` es del cajero y del repartidor desde 3b (lo pidió Brayan: «por el repartidor o el cajero»). En la Fase 6 el repartidor queda limitado a sus domicilios asignados. El repartidor no ve el turno ni el canal `caja`.
