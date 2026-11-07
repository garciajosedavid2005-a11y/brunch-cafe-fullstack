# Plan de la Fase 1 — Salón y comandas (roles: Mesero, Anfitrión)

> Estado: **preguntas de negocio respondidas (2026-11-06), sin código**. Empieza cuando se apruebe la integración de la rama `developers` (ítem 0.15 de PROGRESO). Las respuestas están en la sección 5 y en las decisiones F1-1 a F1-16 de PROGRESO.
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
| Permisos por clave | **HECHO**; los roles de salón solo tienen permisos de pedidos/reservas web | `identidad/permisos.js` (`mesero`: `pedido:ver`, `pedido:cambiar_estado`, `reserva:ver`, `reserva:crear` desde 0.15; `anfitrion`: `reserva:ver`, `reserva:cambiar_estado`) |
| Modalidad del pedido | **PARCIAL**: la máquina ya prevé `para_llevar`, pero `Pedido` no tiene el campo (todo es domicilio) | `compartido/estados.js:54` |
| Frontend de staff | **PARCIAL (0.15)**: panel `/staff` (Resumen, agenda de reservas, pedidos, perfil y seguridad) y rutas por permisos (`utils/permisos.js`, `esPersonal`). Falta el layout de tablet, el plano de mesas y «Cambiar de usuario» (1.6) | `frontend/src/pages/StaffDashboard/`, `frontend/src/App.jsx` |
| Reservas registradas por el personal | **HECHO (0.15e)**: `POST /api/v1/staff/reservas` (`reserva:crear`), `usuario: null` + `registradaPor` | `salon/reservasStaff.controller.js` |
| Recuperación de contraseña | **HECHO (0.15c)** | `identidad/recuperacion.service.js` |
| Tiempo real | **FALTA** (llega en la Fase 2): sin Socket.IO ni SSE | — |
| Datos locales | 6 categorías × 4 productos; 6 pedidos, 4 reservas, 24 eventos | BD local |

## 2. Decisiones de diseño (confirmadas con las respuestas de la sección 5)

- **Módulo nuevo `src/modulos/salon/`** (ya existe para reservas): `zona`, `mesa`, `cuenta`, `comanda` (rondas con sus ítems), con el mismo patrón modelo / schema Zod / service / controller / routes.
- **Una `Cuenta` por mesa ocupada** (varias mesas unidas comparten una cuenta). La división de la cuenta es de la Fase 3.
- **`ItemComanda` embebido en la ronda** (`Comanda.items[]`) con su propio `_id`, para anular o mover ítems sueltos. Se guarda el snapshot de nombre, precio base, modificadores con su precio, estación y nota. Montos en COP enteros calculados en el servidor.
- **Estados como enums con máquina explícita y `Evento`** (se amplía `Evento.entidad` a `mesa`, `cuenta`, `item`):
  - Mesa: `libre → ocupada → cuenta_pedida → por_limpiar → libre`, más `bloqueada` (desde y hacia `libre`).
  - Cuenta: `abierta → cuenta_pedida → (cerrada en la Fase 3)`, más `cerrada_sin_cobro` (solo admin, con motivo; F1-13).
  - Ítem: `borrador → enviado` en esta fase, y `enviado → anulado` con `item:anular` y motivo (no se cobra; F1-6). Ampliado en 1.4 (D1): también desde `en_preparacion` y `listo`, no desde `servido`. Los estados de cocina (`en_preparacion → listo → servido`) se definen ya, pero los opera el KDS en la Fase 2.
- **Todo cambio de mesa o cuenta en una transacción**, con control de concurrencia: escritura condicional sobre el estado esperado, igual que `cambiarEstado`. Si dos meseros tocan la misma mesa, el segundo recibe `409` y la tablet recarga.
- **«Enviar ronda» es idempotente** (`Idempotency-Key`): un doble toque en la tablet no duplica la comanda.
- **Sin tiempo real hasta la Fase 2**: el plano de mesas y la cuenta se refrescan por *polling* (cada 10–15 s y al volver a la pestaña). Se diseña la API para que la Fase 2 solo agregue los eventos en vivo.
- **Domicilio sigue en `Pedido` durante la Fase 1** (opción A confirmada, F1-11). Se agregan `Pedido.canal`/`modalidad` y un adaptador para que, cuando se unifique en `Cuenta`, `/api/v1/cliente/pedidos` siga respondiendo igual.
- **Impuestos, propina y descuento**: los campos existen en `Cuenta` pero quedan en `null` hasta las decisiones de la Fase 3 (no se calcula nada que no esté decidido).

## 3. Ítems de la Fase 1

Cada ítem = 1 commit (o pocos) con tests, como en la Fase 0. Orden propuesto: 1.1 → 1.10.

### 1.1 Permisos y sesión de staff
- **Permisos nuevos** (catálogo en `identidad/permisos.js`): `salon:configurar` (zonas, mesas y estaciones), `mesa:ver`, `mesa:operar` (ocupar, liberar, `por_limpiar → libre`), `mesa:bloquear` (bloquear y desbloquear con motivo; F1-2), `mesa:unir`, `cuenta:abrir`, `cuenta:ver`, `cuenta:transferir` (F1-8), `comanda:tomar`, `comanda:enviar`, `item:anular` (después de enviado; F1-6), `cuenta:solicitar`, `cuenta:cerrar_sin_cobro` (F1-13).
- **Asignación inicial**, solo al crear el rol, como hoy: `mesero` = ver/operar mesas, abrir/ver cuenta, tomar/enviar comanda y solicitar cuenta; `anfitrion` = ver/operar/bloquear mesas, unir mesas, abrir cuenta y transferirla. `item:anular` y `cuenta:cerrar_sin_cobro`: solo admin (`*`); un rol supervisor más adelante.
- **Frontend**: ya hecho en 0.15d (rutas por permisos, `/staff`, test `sinRolesPorNombre`). Queda decidir con `mesa:ver` qué sección abre primero el panel.
- **Sesión de staff de 12 h** (clientes: 2 h) y botón visible «Cambiar de usuario» para tablets compartidas (F1-10). El PIN por dispositivo queda para la Fase 2.
- Tests: rutas protegidas por permiso, redirección por permisos, duración de la sesión según el rol.

### 1.2 Zonas y mesas (configuración)
- **Modelos** `Zona { nombre, orden, activa }` y `Mesa { numero (único), nombre?, zona, capacidad, estado, combinable, activa, posicion? }`. Solo se unen mesas de la misma zona marcadas como `combinable` (F1-1).
- **Endpoints admin** (`salon:configurar`): `GET/POST/PUT/DELETE /api/v1/admin/zonas`, `/api/v1/admin/mesas`. No se borra una mesa ocupada ni una zona con mesas (se desactivan).
- **Seed de ejemplo**, marcado como ejemplo: zonas Interior y Terraza con algunas mesas de 2 y 4 personas (F1-1). Los datos reales se cargan desde el admin.
- **Pantalla** Admin › Salón: zonas y mesas (tabla + formulario).
- Tests: validaciones, unicidad del número, protecciones.

### 1.3 Estaciones y modificadores en el catálogo
- **`Estacion { codigo, nombre, activa }`**, sembrada con Cocina y Barra (F1-3).
- **Estación por categoría** (bebidas → barra; el resto → cocina), con posible sobrescritura por producto: `Categoria.estacion` y `Producto.estacion?`.
- **Modificadores**: `GrupoModificadores { nombre, obligatorio, min, max, opciones: [{ nombre, precioExtra (COP entero ≥ 0), disponible }] }` y `Producto.gruposModificadores[]` (F1-4). Seed de ejemplo editable: Leche (entera, deslactosada, almendra con recargo), Tamaño (normal, grande con recargo), Término del huevo (obligatorio en platos con huevo) y Extras (con recargo). «Sin ingrediente» va como nota del ítem.
- **Endpoints admin** (`catalogo:gestionar`) y pantalla en Admin › Productos (asignar estación y grupos).
- `/api/v1/catalogo` añade estación y modificadores solo si se pide (`?incluir=modificadores`), para no cambiar la respuesta pública.
- **Migración `migrate:1.3`** (`--dry-run` y `--down`): asigna la estación por defecto a las categorías existentes (bebidas → Barra, el resto → Cocina); los productos la heredan (decisión del 2026-11-07).

### 1.4 Modelo de cuenta y comanda (núcleo, sin pantallas)
- **`Cuenta { codigo, canal (salon; para_llevar y domicilio en la Fase 6), mesas[], mesero, comensales (obligatorio, ≥ 1; F1-7), estado, subtotal, impuestos:null, propina:null, descuento:null, total, abiertaPor, abiertaEn, notas }`**.
- **`Comanda { cuenta, numeroRonda, estado (borrador|enviada), enviadaPor, enviadaEn, items[] }`**. Cada `ItemComanda` = `{ producto, nombre, precioBase, modificadores[{ grupo, opcion, precioExtra }], cantidad, nota, estacion, estado, subtotal }`.
- **Servicio** con las reglas: una sola cuenta por mesa (F1-7); el precio sale del catálogo al agregar (snapshot que se respeta aunque cambie el menú; F1-14), se rechazan productos agotados (`409 PRODUCT_UNAVAILABLE`, como el domicilio), se validan los modificadores (obligatorio, mín./máx.) y los totales se recalculan en el servidor.
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
| DELETE | `/cuentas/:id/items/:itemId` | `comanda:tomar` (borrador) / `item:anular` + motivo (enviado; no se cobra, queda en `Evento`) | Quitar o anular un ítem |
| POST | `/cuentas/:id/solicitar` | `cuenta:solicitar` | Cuenta pedida (mesa → `cuenta_pedida`) |
| POST | `/cuentas/:id/transferir` | `cuenta:transferir` | Cambiar de mesero (motivo opcional) |
| POST | `/mesas/:id/mover` | `mesa:operar` | Mover la cuenta a otra mesa libre |
| POST | `/mesas/unir` | `mesa:unir` | Unir mesas de la misma zona y combinables en una cuenta `{ mesas[], principal }` |
| POST | `/mesas/:id/separar` | `mesa:unir` | Separar mientras la cuenta no tenga ítems enviados (409 si los tiene; F1-9) |
| POST | `/mesas/:id/estado` | `mesa:operar` / `mesa:bloquear` | `por_limpiar → libre` (`mesa:operar`); `libre ↔ bloqueada` con motivo (`mesa:bloquear`) |
| POST | `/cuentas/:id/cerrar-sin-cobro` | `cuenta:cerrar_sin_cobro` | Solo admin, motivo obligatorio → `cerrada_sin_cobro` (F1-13) |
- Todas las operaciones de mesa y cuenta van en transacción y dejan `Evento`.
- **Cierre de cuenta**: el cobro es de la Fase 3. En la Fase 1 solo existe «cerrar sin cobro» (admin, con motivo), identificable en la Fase 3; el mesero solo solicita la cuenta (F1-13).

### 1.6 Pantalla `/staff` — plano de mesas (tablet)
- **Punto de partida (0.15)**: `/staff` ya existe con el layout del sitio; se reutilizan Mi perfil, Seguridad, la agenda de reservas y la lista de pedidos.
- **Layout propio**, separado del sitio público (sin navbar ni footer), pensado para 1024×768 horizontal y 768×1024 vertical, con objetivos táctiles de ≥ 44 px.
- **Plano por zona** (pestañas): tarjetas de mesa con color por estado, número, comensales, mesero y tiempo ocupada; leyenda accesible (no solo color).
- **Acciones por mesa** según permisos: abrir cuenta (comensales), ver cuenta, mover, unir, separar, limpiar y bloquear.
- Botón visible «Cambiar de usuario» (tablets compartidas; F1-10).
- Refresco por *polling* y aviso de «actualizado hace N s».
- Capturas a 1024×768 y 768×1024.

### 1.7 Pantalla de toma de comanda (tablet)
- Categorías en botones grandes, productos con precio, agotados deshabilitados. Cada ronda se envía completa, sin «tiempos» ni «marchar» (F1-5).
- **Diálogo de modificadores** (obligatorios, mín./máx., precio extra) y nota por ítem.
- **Ronda en curso** (borrador) con cantidades, quitar y total parcial; botón «Enviar ronda» con confirmación y clave de idempotencia.
- Rondas enviadas en solo lectura, con su estado y la anulación con motivo si hay permiso.
- «Solicitar cuenta» y vista de la cuenta con subtotal (sin impuestos ni propina hasta la Fase 3).

### 1.8 Para llevar — **fuera de la Fase 1** (pasa a la Fase 6, F1-12)
- Se mantiene el diseño (cuenta sin mesa, transición `listo → entregado`) para la Fase 6. El número se conserva para no renumerar los ítems.

### 1.9 Domicilio y `Cuenta` (compatibilidad)
- **Opción A (confirmada, F1-11)**: el domicilio sigue en `Pedido`/`DetallePedido`. Se añade `Pedido.canal = 'domicilio'` y una vista unificada de solo lectura para el staff, «Cuentas abiertas» (salón + domicilio). La unificación física pasa a la Fase 6 (domicilio dentro del motor de cuentas), con su migración.
- ~~Opción B~~ (descartada): migrar ya los pedidos a `Cuenta`.

### 1.10 Cierre de la fase
- README (endpoints de staff), PROGRESO, capturas de tablet y de escritorio, resumen y PR «Fase 1: salón y comandas».

## 4. Riesgos

| Riesgo | Mitigación propuesta |
|---|---|
| Dos meseros operan la misma mesa a la vez | Escrituras condicionales sobre el estado esperado en transacción → `409` y recarga; tests de concurrencia como el del último admin |
| Doble toque en «Enviar ronda» | `Idempotency-Key` (ya existe desde 0.9) |
| Sin tiempo real: el plano puede quedar desactualizado unos segundos | Polling corto, «actualizado hace N s» y refresco al volver a la pestaña; Socket.IO/SSE en la Fase 2 |
| Rate limit del login por IP + correo: todas las tablets salen por la misma IP del local | Cuenta por IP **y** correo (no bloquea a todos). Revisar el límite cuando llegue el PIN (Fase 2) |
| Sesión de 2 h corta para un turno en tablet | Sesión de staff de 12 h (F1-10); revocación con `tokenVersion` ya existe; «Cambiar de usuario» en tablets compartidas |
| Anulaciones de ítems ya enviados (riesgo de fraude) | Permiso propio `item:anular`, motivo obligatorio y `Evento` con usuario; reporte en la Fase 5 |
| Cambios de precio o de producto con una cuenta abierta | Snapshot de nombre, precio y modificadores al agregar el ítem |
| Migrar domicilio a `Cuenta` rompe el portal del cliente | Opción A: no se migra en la Fase 1 (F1-11) |
| Crash de Vitest con Node 24 en Windows | Node 22 LTS fijado con `.nvmrc` y `engines` (F1-16, se aplica en 0.15) |
| Pantallas de tablet con UI distinta al sitio | Layout `/staff` aparte con sus capturas a 1024×768 y 768×1024 |

## 5. Preguntas de negocio — respondidas el 2026-11-06 (Brayan)

| # | Pregunta | Respuesta | Efecto en el plan |
|---|---|---|---|
| 1 | Zonas y mesas reales | Editables desde Admin › Salón. Seed de ejemplo marcado como tal (Interior y Terraza, mesas de 2 y 4). Se unen mesas de la misma zona marcadas «combinable» | 1.2 |
| 2 | Estados de mesa y quién los cambia | Confirmados `libre / ocupada / cuenta_pedida / por_limpiar / bloqueada`. `por_limpiar → libre`: mesero y anfitrión (`mesa:operar`). Bloquear/desbloquear: anfitrión y admin, con motivo | 1.1 (`mesa:bloquear`), 1.5 |
| 3 | Estaciones | Cocina y Barra; por categoría (bebidas → barra, el resto → cocina), con cambio por producto | 1.3 |
| 4 | Modificadores | Grupos con recargo opcional (COP entero ≥ 0), obligatorio u opcional, mín./máx. Seed editable: Leche, Tamaño, Término del huevo (obligatorio en platos con huevo), Extras; «sin ingrediente» como nota | 1.3 |
| 5 | Rondas | Cada ronda completa; sin «tiempos» ni «marchar». Nota libre por ítem | 1.7 |
| 6 | Anular ítems enviados | Solo `item:anular` (admin por ahora; supervisor más adelante), motivo obligatorio; no se cobra; queda en `Evento` para mermas (Fase 5). Antes de enviar, el mesero quita libremente | 1.1, 1.4, 1.5 |
| 7 | Comensales y cuentas por mesa | Comensales obligatorios (≥ 1). Una sola cuenta por mesa; división en la Fase 3 | 1.4 |
| 8 | Transferir cuenta | Anfitrión y admin (`cuenta:transferir`), motivo opcional | 1.1, 1.5 |
| 9 | Unir mesas | Comparten una sola cuenta. Se separan solo si la cuenta no tiene ítems enviados; si los tiene, división en la Fase 3 | 1.5 (`/mesas/:id/separar`) |
| 10 | Acceso en tablet | Correo y contraseña; sesión de 12 h solo para staff (clientes 2 h). Tablets compartidas: botón «Cambiar de usuario». PIN por dispositivo en la Fase 2 | 1.1, 1.6 |
| 11 | Domicilio → Cuenta | Opción A: sigue en `Pedido` hasta la Fase 6 | 1.9 |
| 12 | Para llevar | Pasa a la Fase 6 | 1.8 fuera de la fase |
| 13 | Cerrar sin cobro | Solo admin, motivo obligatorio, estado «cerrada sin cobro» identificable en la Fase 3. El mesero solo solicita la cuenta | 1.1, 1.4, 1.5 |
| 14 | Precio con cuenta abierta | Se respeta el del momento en que se agregó el ítem (snapshot de nombre, precio y modificadores) | 1.4 |
| 15 | Reservas y mesas | Fuera de la Fase 1 (Fase 4) | — |
| 16 | Versión de Node | Node 22 LTS con `.nvmrc` y `engines`, documentado en el README | Se aplica en 0.15 |

## 6. Fuera de alcance de la Fase 1

KDS, tiempo real y PIN por dispositivo (Fase 2), cobro, impuestos, propina, división de cuenta y comprobantes (Fase 3), reservas conectadas a mesas (Fase 4), inventario y reportes (Fase 5), para llevar, domicilio dentro del motor de cuentas y fidelización (Fase 6).
