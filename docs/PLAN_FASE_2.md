# Plan de la Fase 2: cocina y barra (KDS)

> **Estado:** borrador, sin código. Lo escribió Claude el 2026-11-12 tras cerrar la Fase 1 (1.1 a 1.13). Antes de empezar, Brayan tiene que responder las preguntas de la sección 5. Las respuestas quedarán como decisiones F2-1… en `docs/PROGRESO.md`.
>
> **Objetivo** (prompt maestro): que lo enviado desde la mesa llegue a cocina y barra y vuelva al mesero. El ciclo es **Comanda enviada → Cocina/Barra → Listo → Servido**, en tiempo real. Los roles nuevos que operan son **Cocina** y **Barista**. Este es el eslabón que la Fase 1 dejó preparado: estados del ítem, estación por ítem y polling.

## 1. Punto de partida (verificado en el código el 2026-11-12)

| Tema | Estado | Evidencia |
|---|---|---|
| Estados del ítem | **HECHO (definidos)**. `enviado → en_preparacion → listo → servido`, y `anulado` desde enviado, en preparación o listo (D1). Los tres pasos de cocina hoy son `via: 'sistema'`: no hay permisos ni endpoints que los muevan. | `backend/src/modulos/compartido/estadosSalon.js` (`MAQUINA_ITEM`) |
| Estación por ítem | **HECHO**. Cada ítem guarda la copia de su estación (`{ id, codigo, nombre }`) al agregarse. Cocina y Barra se siembran y el admin las configura. | `salon/comanda.model.js` (`estacion`), `catalogo/estacion.model.js` |
| Tiempos | **PARCIAL**. La ronda guarda `enviadaEn` y `enviadaPor`; el ítem, `agregadoEn`. No se registra cuándo empieza ni cuándo termina la preparación. `Evento` admite entidades `mesa` y `cuenta`. | `comanda.model.js`, `compartido/evento.model.js` |
| Agotados («86») | **PARCIAL**. `Producto.disponible` y `opciones[].disponible` existen, y la toma de comanda y el carrito los respetan (`PRODUCT_UNAVAILABLE`, `OPCION_NO_DISPONIBLE`). Solo los cambia el admin desde Admin › Productos o Modificadores. | `catalogo/producto.model.js`, `grupoModificadores.model.js` |
| Tiempo real | **FALTA**. Todo va por polling: plano cada 10 s, cuenta y «Cuentas abiertas» cada 15 s, y además al volver a la pestaña, al enfocar la ventana y al recuperar la red. | `frontend/src/pages/StaffDashboard/compartido/useSondeo.js`, `comanda/useCuenta.js` |
| Roles Cocina y Barista | **PARCIAL**. Existen como roles de sistema solo con `pedido:ver`. No tienen pantalla propia: entran a `/staff` y ven el Resumen. | `identidad/permisos.js` (`ROLES_BASE`) |
| Domicilio | Sigue en `Pedido` (opción A, F1-11). Sus líneas tienen opciones y nota desde 1.12, pero **no tienen estado por línea**: el estado es del pedido (`confirmado → en_preparacion → listo → en_camino`). | `pedidos/pedido.model.js`, `detallePedido.model.js` |
| Sesión en tablets | Personal: 12 h y «Cambiar de usuario» (F1-10). Sin PIN, sin sesión de dispositivo y sin cierre por inactividad (pendiente). | `identidad/duracionSesion.js` |
| Despliegue | Un solo proceso Node con MongoDB en replica set. No hay Redis ni otra infraestructura. | `backend/README.md` |

## 2. Decisiones de diseño (propuestas por Claude, a confirmar)

- **Módulo nuevo `src/modulos/cocina/`** con el mismo patrón que el salón (servicio, rutas y schema). La cola de cocina es una **lectura** de las rondas enviadas: no hay colección nueva. Los cambios de estado de cada ítem van en una transacción sobre su `Comanda` y su `Cuenta`, con `$inc version` y Evento, como en la Fase 1.
- **Tiempo real con SSE (Server-Sent Events), no Socket.IO.**
  - Los avisos van en un solo sentido (servidor → pantallas) y las acciones siguen siendo peticiones HTTP normales, con su permiso y su idempotencia.
  - SSE funciona con la cookie de sesión actual, sin librería, y se reconecta solo (`EventSource`).
  - Canales: `estacion:<codigo>` (KDS), `cuenta:<id>` (toma de comanda), `plano` y `mesero:<id>` (avisos de «listo»).
  - El polling **se queda como respaldo**, con intervalo más largo si el canal está vivo: si SSE se cae, nada se pierde.
  - Los eventos se emiten **después** de confirmar la transacción y solo llevan ids y tipo. La pantalla vuelve a leer lo que necesita con su permiso, así un evento nunca filtra datos.
  - Con un solo proceso basta un bus en memoria. Si un día hay varios procesos, se cambia por Redis Pub/Sub sin tocar las pantallas; eso queda fuera de esta fase.
- **Permisos nuevos** (asignables; el seed los da al crear el rol y una migración `migrate:2.1` los agrega a los roles existentes):
  - `kds:ver` (ver la cola de su estación).
  - `item:preparar` (enviado → en preparación → listo).
  - `item:servir` (listo → servido; lo tendría el mesero).
  - `producto:agotar` (marcar y desmarcar el «86» desde la cocina o el salón).
  - Las transiciones del ítem dejan de ser `via: 'sistema'` y pasan a exigir esos permisos.
- **Tiempos de preparación en el propio ítem:** `iniciadoEn`, `listoEn` y `servidoEn`, además del Evento de cada cambio. Así el temporizador y los reportes de la Fase 5 no reconstruyen tiempos a partir de los eventos.
- **Pantalla KDS en `/kds`**, con layout propio para tablet horizontal (1280×800) o TV (1920×1080):
  - Tarjetas por ronda y estación, ordenadas por antigüedad, con mesa, mesero, tiempo desde el envío, ítems con sus opciones y nota, y botones grandes.
  - Los estados se comunican con texto e icono, nunca solo con color. El temporizador cambia de aspecto con umbrales (pregunta 4).
- **Aviso al mesero:**
  - Cuando un ítem queda listo, la mesa muestra «Listo para servir (n)» en el plano y en su cuenta.
  - Hay un aviso no intrusivo en `/staff`.
  - «Servir» marca el ítem como servido.

## 3. Ítems de la Fase 2 (propuestos)

Cada ítem = 1 commit (o pocos) con tests primero, revisores y capturas, como en la Fase 1.

### 2.1 Permisos y roles de cocina y barra
- Claves nuevas (`kds:ver`, `item:preparar`, `item:servir`, `producto:agotar`) en el catálogo y asignación inicial a cocina, barista y mesero.
- **Migración `migrate:2.1`** con `--dry-run` y `--down` para los roles existentes; **se detiene para pedir aprobación** y `mongodump` antes de aplicarla.
- Rutas por permiso: cocina y barista entran a `/kds`, y quien tenga `kds:ver` y además sea personal de salón ve el enlace.

### 2.2 Transiciones del ítem y tiempos (backend)
- `POST /api/v1/staff/cocina/items/:itemId/estado` con `{ a, versionEsperada? }`.
  - En la transacción: escritura condicional sobre el estado esperado (`409` si otro ya lo movió), `iniciadoEn`, `listoEn` y `servidoEn`, y Evento.
- Endpoint para pasar a «listo» todos los ítems de una ronda y estación de una vez (si la respuesta a la pregunta 1 es por ronda).
- Anular un ítem en preparación sigue siendo `item:anular` (D1), y la cocina lo ve tachado con su motivo.
- Tests de concurrencia (dos tablets marcando lo mismo) y del verificador `verificar:salon` ampliado (tiempos coherentes con el estado).

### 2.3 Cola por estación (lectura)
- `GET /api/v1/staff/cocina/cola?estacion=cocina`: rondas enviadas de cuentas abiertas o pedidas con ítems pendientes de esa estación, ordenadas por `enviadaEn`, con mesa, mesero, ítems, opciones, nota y tiempos.
- Sin N+1: consultas en lote, como el plano. Índice para la consulta de la cola.
- Domicilio en la cola según la respuesta a la pregunta 3.

### 2.4 Tiempo real (SSE)
- `GET /api/v1/staff/eventos?canales=…`: autenticado y con permiso por canal (`kds:ver` para estación, `cuenta:ver` para cuenta, `mesa:ver` para plano).
- Latido cada 25 s, cabeceras anti-buffer y cierre limpio al cerrar sesión o al revocarse el token.
- Bus en memoria; los servicios de cuentas y cocina publican después de confirmar la transacción.
- En el frontend, `useSondeo` se amplía para escuchar el canal y recargar al recibir un evento, manteniendo el polling de respaldo.
- Tests: emisión tras confirmar (no si la transacción falla), permisos por canal y reconexión.

### 2.5 Pantalla KDS (`/kds`)
- Tarjetas por ronda, filtro de estación, temporizador con umbrales y botones de 44 px o más (mejor 56 px a la distancia de la cocina).
- Ítem anulado tachado con su motivo y un aviso visible. «Deshacer» el último cambio durante unos segundos (pregunta 7).
- Capturas a 1280×800 y 1920×1080, con medición táctil.

### 2.6 Aviso al mesero y «servido»
- Badge «Listo para servir» en las tarjetas del plano y en la cuenta, con aviso en `/staff` y botón «Servir» (`item:servir`).
- El plano y la cuenta se actualizan por SSE.

### 2.7 Agotar productos («86») desde la operación
- La cocina o el salón marcan un producto o una opción como agotado, con permiso `producto:agotar`, Evento y quién lo hizo.
- Efecto inmediato en la toma de comanda, el carrito y el catálogo (ya lo respetan desde 1.3, 1.5 y 1.12) y aviso en las rondas en borrador que lo tengan.
- Reactivación según la pregunta 5.

### 2.8 Sesión del dispositivo y PIN
- Según la pregunta 6:
  - **(a)** dispositivo KDS registrado por el admin: token de dispositivo ligado a una estación, de larga duración, revocable y sin datos personales; o
  - **(b)** PIN de 4–6 dígitos por persona para cambiar de usuario rápido en tablets compartidas, con su límite de intentos.
- Cierre por inactividad en tablets (pendiente de la Fase 1).
- Revisar el límite de intentos del login por IP, porque todas las tablets salen por la misma IP del local (riesgo anotado en la Fase 1).

### 2.9 Cierre de la fase
- README (endpoints de cocina y SSE), PROGRESO, capturas de tablet y TV, y resumen.
- PR «Fase 2: cocina y barra».

## 4. Riesgos

| Riesgo | Mitigación propuesta |
|---|---|
| Dos tablets de cocina marcan el mismo ítem | Escritura condicional sobre el estado esperado en la transacción; la segunda recibe `409` y la tarjeta se recarga (como en el salón) |
| Una conexión SSE se cae sin que nadie lo note (wifi de cocina) | Latido, indicador «En vivo / Reconectando» visible y polling de respaldo; nada se decide solo por el evento |
| Un evento filtra datos a quien no debe | Los eventos solo llevan ids y tipo; la pantalla relee con su permiso. Permiso por canal al suscribirse |
| Varios procesos Node en producción (el bus en memoria no alcanza) | Fuera de alcance: se documenta y el bus queda detrás de una interfaz para cambiarlo por Redis Pub/Sub |
| Un ítem anulado mientras se prepara | Aparece tachado con su motivo y un aviso; no se puede marcar como listo (`409`) |
| Ruido en la cocina: los avisos no se oyen | Sonido configurable por pantalla (pregunta 8) y aviso visual persistente hasta que alguien lo atiende |
| Pantalla KDS siempre encendida con una sesión personal abierta | Sesión de dispositivo sin datos personales (2.8) o cierre por inactividad |
| Tiempos de preparación inflados por olvidos | Temporizador visible, umbrales y, en la Fase 5, reportes con percentiles (no promedios) |

## 5. Preguntas de negocio para Brayan (bloquean el inicio)

| # | Pregunta | Opciones / propuesta de Claude |
|---|---|---|
| 1 | ¿La cocina marca cada ítem o la ronda completa de su estación? | Propuesta: por ítem, con un botón «Todo listo» por ronda |
| 2 | ¿Quién marca «servido»? | Propuesta: el mesero desde `/staff` (`item:servir`). Alternativa: la cocina al despachar |
| 3 | ¿El domicilio entra al KDS? | (a) No: sigue en «Pedidos» como hoy; (b) sí, como tarjeta del pedido completo que mueve el estado del pedido (confirmado → en preparación → listo), sin estado por línea; (c) estado por línea (implica acercar el domicilio al motor de cuentas, que es de la Fase 6). Propuesta: (b) |
| 4 | Umbrales del temporizador por estación (p. ej. Barra 5/10 min, Cocina 12/20 min) | Valores configurables por el admin en Admin › Salón › Estaciones |
| 5 | «86»: ¿quién agota, quién reactiva y si se reactiva solo al día siguiente? | Propuesta: cocina, barista, mesero y admin agotan; reactivan cocina, barista y admin; sin reactivación automática |
| 6 | Pantalla KDS: ¿dispositivo fijo sin login personal o login de un cocinero? ¿PIN para el personal en tablets compartidas? | Propuesta: dispositivo registrado por el admin para el KDS y PIN opcional para `/staff` |
| 7 | ¿Se puede deshacer «listo» si fue un error? ¿Con qué permiso y durante cuánto tiempo? | Propuesta: «Deshacer» durante 10 s para quien lo marcó; después, solo el admin, con motivo |
| 8 | ¿Sonido al llegar una ronda o al quedar un ítem listo? | Propuesta: sí, configurable por pantalla y apagado por defecto en el salón |
| 9 | ¿Se mantiene «cada ronda se envía completa, sin tiempos ni marchar» (F1-5)? | Propuesta: sí; la prioridad o «marchar» quedaría para después |
| 10 | ¿Qué ve el cliente del domicilio? | Propuesta: nada nuevo en esta fase (su estado de pedido ya se ve en «Mis pedidos») |

## 6. Pendientes de la Fase 1 que tocan esta fase

- **PIN y cierre por inactividad** en tablets (F1-10, «Cierre por inactividad en tablets»).
- **Límite de intentos del login** con todas las tablets detrás de la misma IP.
- **Cambios de horario sin Evento** (1.11). Si la cocina mira horarios, conviene registrarlos.
- **Carrito y opciones** (1.12): cuando el «86» llegue desde la cocina, el carrito debería marcar la línea afectada, no solo mostrar el mensaje.
- **`Pedido.canal` sin rellenar** (1.9): solo importa si la respuesta a la pregunta 3 es (c).

## 7. Fuera de alcance de la Fase 2

- Cobro, impuestos, propina, división de cuenta y comprobante interno (Fase 3).
- Reservas conectadas a mesas (Fase 4).
- Inventario y descuento de insumos al preparar (Fase 5). Los tiempos de preparación se registran aquí, pero los reportes son de la Fase 5.
- Para llevar, domicilio dentro del motor de cuentas, repartidores y fidelización (Fase 6).
- Varios procesos con un bus compartido (Redis) y apps nativas.
