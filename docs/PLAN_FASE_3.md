# Plan de la Fase 3 (mínima): cobro en caja

> **Estado:** propuesta de Claude (2026-11-14), pendiente de aprobación de Brayan. Sin programar.
>
> **Objetivo:** cerrar el ciclo **mesa → cocina → cobro**. Una cuenta en «cuenta pedida» se cobra en caja, se emite un comprobante interno y la mesa queda «por limpiar», con Evento y aviso en vivo. Alcance reducido a propósito: el proyecto es universitario y queda poco tiempo.

## 1. Punto de partida (verificado en el código el 2026-11-14)

| Tema | Estado | Evidencia |
|---|---|---|
| Estados de la cuenta | **PARCIAL**. Ya existen `cuenta_pedida → cerrada`, pero con un permiso provisional (`caja:cerrar`, reservado) y sin endpoint. | `compartido/estadosSalon.js` (`MAQUINA_CUENTA`) |
| Montos | **PARCIAL**. `subtotal` y `total` en COP enteros, calculados por el servidor; `impuestos`, `propina` y `descuento` reservados para la Fase 3 (hoy `null`). | `salon/cuenta.model.js`, `salon/totales.js` |
| Mesa al cerrar | **HECHO**. Al cerrar o cancelar la cuenta, la mesa pasa a `por_limpiar` (`via: 'sistema'`). | `MAQUINA_MESA` |
| Rol Cajero | **PARCIAL**. Existe como rol de sistema, solo con `pedido:ver`. | `identidad/permisos.js` (`ROLES_STAFF`) |
| Métodos de pago | **PARCIAL**. Colección `metodospago` del domicilio (Contra entrega, tarjetas…), gestionada en Admin. | `pedidos/metodoPago.model.js` |
| Tiempo real | **HECHO**. Bus SSE con canales `plano`, `cuenta:<id>` y `mesero:<id>` (Fase 2). | `tiempoReal/` |

## 2. Ítems (4)

### 3.1 Permiso de cobro y pantalla «Caja»
- Permiso nuevo `cuenta:cobrar` (módulo `caja`), asignado al **cajero** y al **admin** (por `*`). Sustituye al provisional `caja:cerrar` en la transición `cuenta_pedida → cerrada`; `caja:abrir` / `caja:cerrar` siguen reservados.
- Migración no destructiva (`--dry-run`, `--down`) que añade `cuenta:cobrar` al rol cajero existente, con `mongodump` previo.
- Pestaña **«Caja»** en `/staff` (solo con `cuenta:cobrar`): lista de las cuentas en «cuenta pedida» (mesa, mesero, desde cuándo, total), en vivo por el canal `plano`. El cajero entra a `/staff` y empieza en «Caja».

### 3.2 Cobrar una cuenta
- `POST /api/v1/staff/cuentas/:id/cobrar` con `Idempotency-Key` y `versionEsperada`, en una transacción: cuenta `cuenta_pedida → cerrada`, mesa → `por_limpiar`, comprobante (3.3) y Evento (`cuenta_cobrada`, con quién, método y montos).
- Pagos: uno o varios (pago mixto) `{ metodo: efectivo | tarjeta | transferencia, monto }`. La suma debe ser exactamente `total + propina`.
- **Propina voluntaria**: monto en COP que escribe el cajero (con botones de atajo 10 % y «Sin propina»); se guarda en `Cuenta.propina` y entra al total cobrado.
- **Efectivo**: el cajero escribe lo recibido y la pantalla calcula el cambio; el servidor valida que lo recibido cubra la parte en efectivo y guarda `recibido` y `cambio`.
- Errores: cuenta no pedida o ya cobrada → `409`; pagos que no cuadran → `400 PAGO_NO_CUADRA`; sin permiso → `403`.

### 3.3 Comprobante interno
- Colección `comprobantes`: consecutivo propio (contador atómico, índice único), cuenta, fecha (UTC), cajero, mesa, líneas (copia de nombre, cantidad, opciones y precio), subtotal, propina, total, pagos y cambio. Inmutable una vez creado.
- Leyenda fija **«Documento no válido como factura electrónica»**; sin DIAN.
- Vista en pantalla al terminar el cobro y versión imprimible (hoja de estilos de impresión, ancho de tirilla de 80 mm), también desde «Caja» → «Cobradas hoy».

### 3.4 Cierre en vivo y cierre de la fase
- Tras confirmar la transacción: aviso por `plano`, `cuenta:<id>` y `mesero:<id>`; el plano muestra la mesa «por limpiar» y la cuenta abierta en otra tablet pasa a solo lectura.
- Tests: permiso (403), cobro simple y mixto, propina, cambio, pagos que no cuadran, doble cobro (idempotencia y `409`), consecutivo sin huecos con cobros simultáneos, Evento y aviso. Capturas de «Caja», del cobro y del comprobante a 1024×768 y 768×1024.
- README, PROGRESO y PR «Fase 3: cobro».

## 3. Fuera de alcance (trabajo futuro)
- Turnos de caja, apertura con base y arqueo (`caja:abrir`, `caja:cerrar`).
- División de cuenta (por ítems o por partes iguales).
- Anulación de comprobantes y notas crédito (`factura:anular`).
- Facturación electrónica DIAN (proveedor tecnológico, CUFE, XML UBL 2.1, resolución de numeración).
- Impuestos (IVA o INC) y descuentos: `impuestos` y `descuento` siguen en `null`.
- Cobro de domicilios (siguen contra entrega, como hoy).

## 4. Preguntas de negocio (con recomendación)

| # | Pregunta | Recomendación |
|---|---|---|
| F3-1 | ¿Quién cobra? | Cajero y admin. El mesero no (evita manejar dinero en mesa). |
| F3-2 | ¿Métodos de pago en caja? | Efectivo, tarjeta (sin distinguir débito/crédito) y transferencia, fijos en el código (no los del domicilio). |
| F3-3 | ¿Propina? | Voluntaria, en COP, con atajo «10 %» y «Sin propina»; no se suma sola. |
| F3-4 | ¿Formato del consecutivo? | `CI-000001` (prefijo «CI» de comprobante interno, 6 dígitos, sin reinicio anual). |
| F3-5 | ¿Precios con impuestos incluidos? | Sí: los precios de la carta ya incluyen impuestos y el comprobante no los desglosa (`impuestos` queda en `null`). |
| F3-6 | ¿Se puede cobrar una cuenta «abierta» (sin pedir la cuenta)? | No: primero «Pedir la cuenta» (un toque más, pero evita cobrar con rondas en curso). |
