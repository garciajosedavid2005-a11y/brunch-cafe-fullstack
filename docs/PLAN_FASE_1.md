# Plan de la Fase 1 — Salón y comandas (roles: Mesero, Anfitrión)

> Estado: **propuesta, sin código**. Igual que la Fase A: diagnóstico del código actual, ítems con su orden y las preguntas de negocio que hay que responder antes de empezar. Fecha: 2026-11-06.
>
> Objetivo de la fase (prompt maestro): **Mesa → Comanda → (Cocina/Barra en Fase 2) → Servicio → Cuenta**, con un frontend `/staff/*` para tablet. El cobro es de la Fase 3, el KDS de la Fase 2 y la conexión con reservas de la Fase 4.

## 1. Punto de partida (verificado en el código, 2026-11-06)

| Tema | Estado actual | Evidencia |
|---|---|---|
| Mesas, zonas, cuentas, comandas | **FALTA**: no existe ningún modelo de salón | `backend/src/modulos/` solo tiene `catalogo`, `pedidos`, `salon` (reservas), `identidad`, `configuracion`, `compartido` |
| Estaciones (cocina/barra) | **FALTA**: el producto no tiene estación | `catalogo/producto.model.js`: `codigo, nombre, precio, descripcion, imagen, disponible, destacado, categoria` |
| Modificadores | **FALTA** | Ni en el producto ni en `DetallePedido` |
| Precio histórico por línea | **HECHO para domicilio** (`nombreProducto`, `precioProducto`, `subtotal`) | `pedidos/detallePedido.model.js` |
| Máquina de estados + Evento | **HECHO** para pedido y reserva; **PARCIAL** para la fase: `Evento.entidad` solo admite `pedido` y `reserva` | `compartido/estados.js`, `compartido/evento.model.js` |
| Transacciones e idempotencia | **HECHO** (0.9): `conTransaccion()`, `Idempotency-Key` | `compartido/transacciones.js`, `compartido/idempotencia.js` |
| Permisos por clave | **HECHO**; los roles de salón solo tienen permisos de pedidos/reservas web | `identidad/permisos.js` (`mesero`: `pedido:ver`, `pedido:cambiar_estado`; `anfitrion`: `reserva:ver`, `reserva:cambiar_estado`) |
| Modalidad del pedido | **PARCIAL**: la máquina ya prevé `para_llevar`, pero `Pedido` no tiene el campo (todo es domicilio) | `compartido/estados.js:54` |
| Frontend de staff | **FALTA**: el staff que inicia sesión va a `/cuenta` (el frontend solo distingue `admin`) | `frontend/src/App.jsx:24-44` |
| Tiempo real | **FALTA** (llega en la Fase 2): sin Socket.IO ni SSE | — |
| Datos locales | 6 categorías × 4 productos; 6 pedidos, 4 reservas, 24 eventos | BD local |

## 2. Decisiones de diseño que propongo (a confirmar con las preguntas de la sección 5)

- **Módulo nuevo `src/modulos/salon/`** (ya existe para reservas): `zona`, `mesa`, `cuenta`, `comanda` (rondas con sus ítems), con el mismo patrón modelo / schema Zod / service / controller / routes.
- **Una `Cuenta` por mesa ocupada** (varias mesas unidas comparten una cuenta). La división de la cuenta es de la Fase 3.
- **`ItemComanda` embebido en la ronda** (`Comanda.items[]`) con su propio `_id`, para anular o mover ítems sueltos. Se guarda el snapshot de nombre, precio base, modificadores con su precio, estación y nota. Montos en COP enteros calculados en el servidor.
- **Estados como enums con máquina explícita y `Evento`** (se amplía `Evento.entidad` a `mesa`, `cuenta`, `item`):
  - Mesa: `libre → ocupada → cuenta_pedida → por_limpiar → libre`, más `bloqueada` (desde y hacia `libre`).
  - Cuenta: `abierta → cuenta_pedida → (cerrada en la Fase 3)`, más `anulada` con permiso y motivo.
  - Ítem: `borrador → enviado` en esta fase. Los estados de cocina (`en_preparacion → listo → servido`, `anulado`) se definen ya, pero los opera el KDS en la Fase 2.
- **Todo cambio de mesa o cuenta en una transacción**, con control de concurrencia: escritura condicional sobre el estado esperado, igual que `cambiarEstado`. Si dos meseros tocan la misma mesa, el segundo recibe `409` y la tablet recarga.
- **«Enviar ronda» es idempotente** (`Idempotency-Key`): un doble toque en la tablet no duplica la comanda.
- **Sin tiempo real hasta la Fase 2**: el plano de mesas y la cuenta se refrescan por *polling* (cada 10–15 s y al volver a la pestaña). Se diseña la API para que la Fase 2 solo agregue los eventos en vivo.
- **Domicilio sigue en `Pedido` durante la Fase 1** (recomendado; ver pregunta 11). Se agregan `Pedido.canal`/`modalidad` y un adaptador para que, cuando se unifique en `Cuenta`, `/api/v1/cliente/pedidos` siga respondiendo igual.
- **Impuestos, propina y descuento**: los campos existen en `Cuenta` pero quedan en `null` hasta las decisiones de la Fase 3 (no se calcula nada que no esté decidido).

## 3. Ítems de la Fase 1

Cada ítem = 1 commit (o pocos) con tests, como en la Fase 0. Orden propuesto: 1.1 → 1.10.

### 1.1 Permisos y sesión de staff
- **Permisos nuevos** (catálogo en `identidad/permisos.js`): `salon:configurar` (zonas, mesas y estaciones), `mesa:ver`, `mesa:operar` (ocupar, liberar, limpiar, bloquear), `mesa:unir`, `cuenta:abrir`, `cuenta:ver`, `cuenta:transferir`, `comanda:tomar`, `comanda:enviar`, `item:anular` (después de enviado), `cuenta:solicitar`.
- **Asignación inicial**, solo al crear el rol, como hoy: `mesero` = ver/operar mesas, abrir/ver cuenta, tomar/enviar comanda y solicitar cuenta; `anfitrion` = ver/operar mesas, unir mesas y abrir cuenta. Lo demás queda para el admin.
- **Frontend**: la ruta de inicio depende de los permisos, no solo de `admin`. Con `mesa:ver` se entra a `/staff`; se corrige el pendiente «staff redirigido a `/cuenta`».
- Sesión de tablet: ver pregunta 10 (duración y PIN).
- Tests: rutas protegidas por permiso, redirección por permisos.

### 1.2 Zonas y mesas (configuración)
- **Modelos** `Zona { nombre, orden, activa }` y `Mesa { numero (único), nombre?, zona, capacidad, estado, combinable, activa, posicion? }`.
- **Endpoints admin** (`salon:configurar`): `GET/POST/PUT/DELETE /api/v1/admin/zonas`, `/api/v1/admin/mesas`. No se borra una mesa ocupada ni una zona con mesas (se desactivan).
- **Seed** opcional con los datos reales (pregunta 1).
- **Pantalla** Admin › Salón: zonas y mesas (tabla + formulario).
- Tests: validaciones, unicidad del número, protecciones.

### 1.3 Estaciones y modificadores en el catálogo
- **`Estacion { codigo, nombre, activa }`**, sembrada con lo que se decida (pregunta 3).
- **Estación por categoría**, con posible sobrescritura por producto: `Categoria.estacion` y `Producto.estacion?`.
- **Modificadores**: `GrupoModificadores { nombre, obligatorio, min, max, opciones: [{ nombre, precioExtra (COP entero ≥ 0), disponible }] }` y `Producto.gruposModificadores[]` (pregunta 4).
- **Endpoints admin** (`catalogo:gestionar`) y pantalla en Admin › Productos (asignar estación y grupos).
- `/api/v1/catalogo` añade estación y modificadores solo si se pide (`?incluir=modificadores`), para no cambiar la respuesta pública.
- **Migración `migrate:1.3`** (`--dry-run` y `--down`): asigna estación por categoría a los productos existentes.

### 1.4 Modelo de cuenta y comanda (núcleo, sin pantallas)
- **`Cuenta { codigo, canal (salon|para_llevar|domicilio), mesas[], mesero, comensales, estado, subtotal, impuestos:null, propina:null, descuento:null, total, abiertaPor, abiertaEn, notas }`**.
- **`Comanda { cuenta, numeroRonda, estado (borrador|enviada), enviadaPor, enviadaEn, items[] }`**. Cada `ItemComanda` = `{ producto, nombre, precioBase, modificadores[{ grupo, opcion, precioExtra }], cantidad, nota, estacion, estado, subtotal }`.
- **Servicio** con las reglas: el precio sale del catálogo al agregar (snapshot), se rechazan productos agotados (`409 PRODUCT_UNAVAILABLE`, como el domicilio), se validan los modificadores (obligatorio, mín./máx.) y los totales se recalculan en el servidor.
- **Máquinas de estado** de mesa, cuenta e ítem en `compartido/estados.js` + `Evento` (entidades nuevas).
- Tests unitarios del servicio y de las máquinas.

### 1.5 Endpoints de salón para el staff (`/api/v1/staff/salon`)
| Método | Ruta | Permiso | Acción |
|---|---|---|---|
| GET | `/mesas?zona=` | `mesa:ver` | Plano: mesas con estado, cuenta abierta, mesero, comensales y minutos ocupada |
| POST | `/mesas/:id/abrir` | `cuenta:abrir` | Ocupar la mesa y abrir su cuenta `{ comensales, mesero? }` (transacción; 409 si ya está ocupada) |
| GET | `/cuentas/:id` | `cuenta:ver` | Cuenta con rondas, ítems, totales e historial |
| POST | `/cuentas/:id/rondas` | `comanda:tomar` | Crear o actualizar la ronda en borrador (ítems, modificadores, notas) |
| POST | `/cuentas/:id/rondas/:n/enviar` | `comanda:enviar` | Enviar a las estaciones (`Idempotency-Key`; ítems → `enviado`) |
| DELETE | `/cuentas/:id/items/:itemId` | `comanda:tomar` (borrador) / `item:anular` + motivo (enviado) | Quitar o anular un ítem |
| POST | `/cuentas/:id/solicitar` | `cuenta:solicitar` | Cuenta pedida (mesa → `cuenta_pedida`) |
| POST | `/cuentas/:id/transferir` | `cuenta:transferir` | Cambiar de mesero (motivo opcional) |
| POST | `/mesas/:id/mover` | `mesa:operar` | Mover la cuenta a otra mesa libre |
| POST | `/mesas/unir` | `mesa:unir` | Unir mesas en una cuenta `{ mesas[], principal }` |
| POST | `/mesas/:id/estado` | `mesa:operar` | `por_limpiar → libre`, `libre ↔ bloqueada` (con motivo) |
- Todas las operaciones de mesa y cuenta van en transacción y dejan `Evento`.
- **Cierre de cuenta**: es de la Fase 3 (cobro). Para probar la Fase 1 propongo `POST /cuentas/:id/cerrar-sin-cobro` solo con permiso de admin y motivo, o dejar las cuentas en `cuenta_pedida` (pregunta 13).

### 1.6 Pantalla `/staff` — plano de mesas (tablet)
- **Layout propio**, separado del sitio público (sin navbar ni footer), pensado para 1024×768 horizontal y 768×1024 vertical, con objetivos táctiles de ≥ 44 px.
- **Plano por zona** (pestañas): tarjetas de mesa con color por estado, número, comensales, mesero y tiempo ocupada; leyenda accesible (no solo color).
- **Acciones por mesa** según permisos: abrir cuenta (comensales), ver cuenta, mover, unir, limpiar y bloquear.
- Refresco por *polling* y aviso de «actualizado hace N s».
- Capturas a 1024×768 y 768×1024.

### 1.7 Pantalla de toma de comanda (tablet)
- Categorías en botones grandes, productos con precio, agotados deshabilitados.
- **Diálogo de modificadores** (obligatorios, mín./máx., precio extra) y nota por ítem.
- **Ronda en curso** (borrador) con cantidades, quitar y total parcial; botón «Enviar ronda» con confirmación y clave de idempotencia.
- Rondas enviadas en solo lectura, con su estado y la anulación con motivo si hay permiso.
- «Solicitar cuenta» y vista de la cuenta con subtotal (sin impuestos ni propina hasta la Fase 3).

### 1.8 Para llevar (canal `para_llevar`, sin mesa)
- Abrir una cuenta sin mesa desde `/staff` (nombre o teléfono del cliente) con la misma comanda y rondas. Se activa la transición ya prevista `listo → entregado`.
- **Solo si se confirma en la pregunta 12**; si no, pasa a la Fase 6.

### 1.9 Domicilio y `Cuenta` (compatibilidad)
- **Opción recomendada (A)**: el domicilio sigue en `Pedido`/`DetallePedido`. Se añade `Pedido.canal = 'domicilio'` y una vista unificada de solo lectura para el staff, «Cuentas abiertas» (salón + domicilio). La unificación física pasa a la Fase 6 (domicilio dentro del motor de cuentas), con su migración.
- **Opción B**: migrar ya los pedidos a `Cuenta` con canal `domicilio` (`migrate:1.9`, reversible) y mantener `/api/v1/cliente/pedidos` con un adaptador. Es más trabajo y más riesgo ahora; ver pregunta 11.

### 1.10 Cierre de la fase
- README (endpoints de staff), PROGRESO, capturas de tablet y de escritorio, resumen y PR «Fase 1: salón y comandas».

## 4. Riesgos

| Riesgo | Mitigación propuesta |
|---|---|
| Dos meseros operan la misma mesa a la vez | Escrituras condicionales sobre el estado esperado en transacción → `409` y recarga; tests de concurrencia como el del último admin |
| Doble toque en «Enviar ronda» | `Idempotency-Key` (ya existe desde 0.9) |
| Sin tiempo real: el plano puede quedar desactualizado unos segundos | Polling corto, «actualizado hace N s» y refresco al volver a la pestaña; Socket.IO/SSE en la Fase 2 |
| Rate limit del login por IP + correo: todas las tablets salen por la misma IP del local | Hoy cuenta por IP **y** correo (no bloquea a todos), pero si se adopta el login por PIN hay que revisar el límite (pregunta 10) |
| Sesión de 2 h corta para un turno en tablet | Decidir la sesión de dispositivo (pregunta 10); revocación con `tokenVersion` ya existe |
| Anulaciones de ítems ya enviados (riesgo de fraude) | Permiso propio `item:anular`, motivo obligatorio y `Evento` con usuario; reporte en la Fase 5 |
| Cambios de precio o de producto con una cuenta abierta | Snapshot de nombre, precio y modificadores al agregar el ítem |
| Migrar domicilio a `Cuenta` rompe el portal del cliente | Opción A (no migrar en la Fase 1) o adaptador con test de contrato (opción B) |
| Crash de Vitest con Node 24 en Windows | Decidir la versión (Node 22 LTS no lo tuvo en 10 ejecuciones) antes de sumar más tests |
| Pantallas de tablet con UI distinta al sitio | Layout `/staff` aparte con sus capturas a 1024×768 y 768×1024 |

## 5. Preguntas de negocio (necesito tus respuestas antes de empezar)

1. **Zonas y mesas reales**: ¿qué zonas hay (salón, terraza…) y cuántas mesas por zona, con número y capacidad? ¿Cuáles se pueden unir?
2. **Estados de mesa**: ¿confirmas `libre / ocupada / cuenta_pedida / por_limpiar / bloqueada`? ¿Quién pasa una mesa de `por_limpiar` a `libre` (mesero, anfitrión, cualquiera) y quién puede bloquearla?
3. **Estaciones**: ¿cuáles hay (p. ej. cocina y barra o barista)? ¿Se asignan por categoría (Bebidas → barra; el resto → cocina) con excepciones por producto?
4. **Modificadores**: ¿ejemplos reales? (término del huevo, tipo de leche con recargo, «sin X», tamaño). ¿Cuáles cuestan y cuánto? ¿Hay obligatorios?
5. **Rondas**: ¿el mesero envía cada ronda completa o necesita «tiempos» (entradas y luego platos fuertes, «marchar»)?
6. **Anular ítems**: antes de enviar, el mesero quita libremente; después de enviar, ¿quién puede anular (mesero, admin, un rol supervisor) y si ya se preparó, se cobra o no?
7. **Cuenta y comensales**: ¿es obligatorio indicar comensales al abrir? ¿Puede haber **varias cuentas en la misma mesa** desde el inicio, o una sola (y se divide en la Fase 3)?
8. **Transferir cuenta entre meseros**: ¿quién puede (el propio mesero, el anfitrión, el admin)?
9. **Unir mesas**: ¿se une también la cuenta (una sola) o solo se marcan juntas? ¿Se pueden separar después?
10. **Acceso en tablet**: ¿cada mesero con su correo y contraseña o un **PIN de 4–6 dígitos** en una tablet compartida? ¿Cuánto debe durar la sesión (turno completo)? ¿Hay una tablet por mesero o compartidas?
11. **Domicilio → Cuenta**: ¿opción A (sigue en `Pedido` hasta la Fase 6, recomendada) u opción B (migrar ya)?
12. **Para llevar**: ¿lo opera el staff desde la Fase 1 (canal `para_llevar` sin mesa) o espera a la Fase 6?
13. **Cerrar cuentas sin la Fase 3**: mientras no exista caja, ¿se permite un «cerrar sin cobro» solo de admin con motivo (para liberar mesas en pruebas) o las cuentas quedan en `cuenta_pedida`?
14. **Precio con cuenta abierta**: ¿confirmas que se respeta el precio del momento en que se agregó el ítem aunque cambie el menú?
15. **Reservas**: asignar mesa a una reserva y abrir la cuenta en el check-in es de la Fase 4. ¿Lo dejamos fuera de la Fase 1?
16. **Versión de Node**: ¿fijamos Node 22 LTS para desarrollo y CI (`.nvmrc` y `engines`) a partir de la Fase 1?

## 6. Fuera de alcance de la Fase 1

KDS y tiempo real (Fase 2), cobro, impuestos, propina, división de cuenta y comprobantes (Fase 3), reservas conectadas a mesas (Fase 4), inventario y reportes (Fase 5), domicilio dentro del motor de cuentas y fidelización (Fase 6).
