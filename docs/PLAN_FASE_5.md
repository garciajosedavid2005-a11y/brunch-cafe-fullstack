# Plan Fase 5 — Inventario y reportes

Pedida por Brayan el 2026-11-15. Orden: 5.1 → 5.7, un commit por ítem y una sola pausa al final de la fase (estado y commits en [PROGRESO.md](PROGRESO.md)).

## Ítems

| ID | Ítem | Qué entrega |
|---|---|---|
| 5.1 | Insumos, permisos y rol «compras» | Colección `insumos` (nombre, unidad g/ml/unidad, existencia, mínimo, costo promedio, activo). Permisos nuevos y rol «compras». Pantalla «Inventario» en el admin y en /staff. Migración 5 (solo agrega: rol e índices). |
| 5.2 | Recetas | Cada producto con sus insumos (cantidad por unidad vendida y % de merma). Las opciones de los modificadores suman insumos o reemplazan uno de la receta (Leche de almendra en lugar de Entera). Seed de desarrollo con insumos y recetas del menú. |
| 5.3 | Descuento, devolución, ajustes y agotado automático | Se descuenta al enviar la ronda o al confirmar el domicilio y se devuelve al anular el ítem o cancelar el pedido, en la misma transacción, con sus movimientos y su Evento. Movimientos manuales (ajuste, merma, vencimiento) con motivo. Un producto u opción sin insumos suficientes se agota solo (Evento «sistema»); al entrar stock se reactiva solo, salvo que se haya agotado a mano. |
| 5.4 | Proveedores, órdenes de compra y recepción | Proveedores; órdenes de compra; recepción (parcial o total) que suma stock, recalcula el costo promedio y guarda el lote con vencimiento opcional. |
| 5.5 | Alertas | Stock bajo (existencia ≤ mínimo) y vencimiento próximo (7 días) en el admin y en el inventario. |
| 5.6 | Reportes de ventas | Admin › Reportes: rango de fechas (Bogotá); ventas por día, franja horaria, producto, categoría, canal, mesero y método de pago; ticket promedio, número de cuentas y propinas; gráficos y CSV. |
| 5.7 | Reportes de operación y cierre | Rotación de mesas, tiempos de preparación por estación (mediana y p90), costo frente a venta y margen por producto; CSV. Cierre de la fase. |

## Decisiones de Brayan (2026-11-15)

- **F5-1 · Insumos:** nombre, unidad (g, ml o unidad), existencia, mínimo, costo promedio y activo.
- **F5-2 · Recetas:** por producto (cantidad por unidad vendida y % de merma); las opciones suman o reemplazan insumos.
- **F5-3 · Momento:** se descuenta al ENVIAR la ronda (salón) o al CONFIRMAR el domicilio; se devuelve al anular el ítem o cancelar el pedido. Cada movimiento con motivo, autor y Evento, en la misma transacción.
- **F5-4 · Manuales:** ajuste, merma y vencimiento, con motivo obligatorio.
- **F5-5 · Compras:** proveedores, órdenes de compra y recepción que suma stock y recalcula el costo promedio, con vencimiento opcional.
- **F5-6 · Alertas:** stock bajo y vencimiento a 7 días, en el admin.
- **F5-7 · Agotado automático:** con el servicio de 2.7 (Evento «sistema»); se reactiva solo al recibir stock, salvo agotado a mano.
- **F5-8 · Rol «compras»:** permisos de inventario, sin caja, salón ni cocina. El admin lo tiene todo por «*».
- **F5-9 · Reportes:** solo con `reporte:ver` (el admin); filtros por fecha en hora de Bogotá; CSV de cada reporte.

## Decisiones técnicas: Claude (a confirmar por Brayan)

- **F5-a · Permisos:** `inventario:ver`, `inventario:gestionar` (insumos y recetas; ya estaba reservado), `inventario:ajustar` (movimientos manuales), `compra:gestionar` (proveedores y órdenes) y `compra:recibir` (recepción). El rol «compras» los tiene todos; `reporte:ver` deja de estar reservado y solo lo tiene el admin.
- **F5-b · Pantalla:** el inventario es una sola pantalla que se usa en Admin › Inventario y en la pestaña «Inventario» de /staff (el rol compras entra a /staff, como el resto del personal). Reportes solo en el admin.
- **F5-c · Cantidades:** las existencias y las cantidades de receta admiten hasta 3 decimales (0,5 unidad de aguacate). El costo promedio es COP por unidad de medida y admite 2 decimales (el gramo de café cuesta menos de $1). Los montos (órdenes, reportes) siguen siendo enteros en COP.
- **F5-d · Sin bloqueo:** el descuento no bloquea la ronda ni el pedido: la existencia puede quedar negativa (la cocina ya lo preparó; el conteo se corrige con un ajuste). Lo que evita vender sin insumos es el agotado automático.
- **F5-e · Libro de movimientos:** colección inmutable `movimientos_inventario` (insumo, tipo, cantidad con signo, existencia después, costo, motivo, autor y referencia). La devolución usa los movimientos de esa referencia (ítem o pedido): devolver dos veces no suma dos veces. Un Evento por operación (entidad nueva `inventario`), con los movimientos en `datos`.
- **F5-f · Agotado automático:** un producto se agota si algún insumo de su receta base no alcanza para una unidad; una opción, si no alcanza su insumo propio. `Producto.agotadoAuto` / `opcion.agotadoAuto` (campos nuevos, false por defecto) distinguen el agotado del sistema del manual: solo el del sistema se reactiva solo.
- **F5-g · Vencimientos:** cada recepción con vencimiento crea un lote. Lo que queda de cada lote se estima con la existencia actual repartida desde la recepción más reciente (primero en entrar, primero en salir), sin escribir en el envío de rondas.
- **F5-h · Ventas:** salón = ítems no anulados de las cuentas cobradas (fecha del cobro); domicilio = líneas de los pedidos entregados (fecha del pedido). Métodos de pago y propinas, de los comprobantes; las notas crédito se muestran aparte. Gráficos con SVG propio (sin librería nueva).
