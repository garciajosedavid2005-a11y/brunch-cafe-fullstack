# Plan de la Fase 2: cocina y barra (KDS)

> **Estado:** aprobado por Brayan el 2026-11-12. Lo escribió Claude tras cerrar la Fase 1; las respuestas a las preguntas de la sección 5 son las decisiones F2-1 a F2-10 de `docs/PROGRESO.md`, y el diseño de la sección 2 quedó aprobado. Empieza tras 1.15.
>
> **Objetivo** (prompt maestro): que lo enviado desde la mesa llegue a cocina y barra y vuelva al mesero. El ciclo es **Comanda enviada → Cocina/Barra → Listo → Servido**, en tiempo real. Los roles nuevos que operan son **Cocina** y **Barista**. Este es el eslabón que la Fase 1 dejó preparado: estados del ítem, estación por ítem y polling.

## 1. Punto de partida (verificado en el código el 2026-11-12)

| Tema | Estado | Evidencia |
|---|---|---|
| Estados del ítem | **HECHO (definidos)**. `enviado → en_preparacion → listo → servido`, y `anulado` desde enviado, en preparación o listo (D1). Los tres pasos de cocina hoy son `via: 'sistema'`: no hay permisos ni endpoints que los muevan. | `backend/src/modulos/compartido/estadosSalon.js` (`MAQUINA_ITEM`) |
| Estación por ítem | **HECHO**. Cada ítem guarda la copia de su estación (`{ id, codigo, nombre }`) al agregarse. Cocina y Barra se siembran y el admin las configura. | `salon/comanda.model.js` (`estacion`), `catalogo/estacion.model.js` |
| Tiempos | **PARCIAL**. La ronda guarda `enviadaEn` y `enviadaPor`; el ítem, `agregadoEn`. No se registra cuándo empieza ni cuándo termina la preparación. `Evento` admite las entidades pedido, reserva, mesa, cuenta y usuario; los eventos de ítems van en la entidad `cuenta` con `datos.item` (decisión de 1.4). | `comanda.model.js`, `compartido/evento.model.js` (`ENTIDADES_EVENTO`) |
| Agotados («86») | **PARCIAL**. `Producto.disponible` y `opciones[].disponible` existen, y la toma de comanda y el carrito los respetan (`PRODUCT_UNAVAILABLE`, `OPCION_NO_DISPONIBLE`). Solo los cambia el admin desde Admin › Productos o Modificadores. | `catalogo/producto.model.js`, `grupoModificadores.model.js` |
| Tiempo real | **FALTA**. Todo va por polling: plano cada 10 s, cuenta y «Cuentas abiertas» cada 15 s, y además al volver a la pestaña, al enfocar la ventana y al recuperar la red. | `frontend/src/pages/StaffDashboard/compartido/useSondeo.js`, `comanda/useCuenta.js` |
| Roles Cocina y Barista | **PARCIAL**. Existen como roles de sistema solo con `pedido:ver`. No tienen pantalla propia: entran a `/staff` y ven el Resumen. | `identidad/permisos.js` (`ROLES_STAFF`) |
| Domicilio | Sigue en `Pedido` (opción A, F1-11). Sus líneas tienen opciones y nota desde 1.12, pero **no tienen estado por línea**: el estado es del pedido (`confirmado → en_preparacion → listo → en_camino`). | `pedidos/pedido.model.js`, `detallePedido.model.js` |
| Sesión en tablets | Personal: 12 h y «Cambiar de usuario» (F1-10). Sin PIN, sin sesión de dispositivo y sin cierre por inactividad (pendiente). | `identidad/duracionSesion.js` |
| Despliegue | Un solo proceso Node con MongoDB en replica set. No hay Redis ni otra infraestructura. | `backend/README.md` |

## 2. Decisiones de diseño (aprobadas por Brayan el 2026-11-12)

- **Módulo nuevo `src/modulos/cocina/`** con el mismo patrón que el salón (servicio, rutas y schema). La cola de cocina es una **lectura** de las rondas enviadas: no hay colección nueva. Los cambios de estado de cada ítem van en una transacción sobre su `Comanda` y su `Cuenta`, con `$inc version` y Evento, como en la Fase 1.
- **Tiempo real con SSE (Server-Sent Events), no Socket.IO.**
  - Los avisos van en un solo sentido (servidor → pantallas) y las acciones siguen siendo peticiones HTTP normales, con su permiso y su idempotencia.
  - SSE funciona con la cookie de sesión actual, sin librería, y se reconecta solo (`EventSource`).
  - Canales: `estacion:<codigo>` (KDS), `cuenta:<id>` (toma de comanda), `plano` y `mesero:<id>` (avisos de «listo»; solo el propio usuario puede suscribirse a su canal).
  - El polling **se queda como respaldo**, con intervalo más largo si el canal está vivo: si SSE se cae, nada se pierde.
  - Los eventos se emiten **después** de confirmar la transacción y solo llevan ids y tipo. La pantalla vuelve a leer lo que necesita con su permiso, así un evento nunca filtra datos.
  - Con un solo proceso basta un bus en memoria. Si un día hay varios procesos, se cambia por Redis Pub/Sub sin tocar las pantallas; eso queda fuera de esta fase.
- **Permisos nuevos** (asignables; el seed los da al crear el rol y una migración `migrate:2.1` los agrega a los roles existentes):
  - `kds:ver` (ver la cola de su estación): cocina y barista.
  - `item:preparar` (enviado → en preparación → listo): cocina y barista.
  - `item:servir` (listo → servido): mesero (F2-2).
  - `pedido:preparar` (domicilio, solo `confirmado → en_preparacion → listo`): cocina y barista (F2-3).
  - `producto:agotar` (cocina, barista y mesero) y `producto:reactivar` (cocina y barista); el admin tiene los dos por `*` (F2-5).
  - Las transiciones del ítem dejan de ser `via: 'sistema'` y pasan a exigir esos permisos.
  - «Todo listo» por ronda y la barra que entrega al momento necesitan saltar `enviado → listo`. Propuesta: pasar por `en_preparacion` dentro de la misma transacción (se guardan los dos tiempos) en vez de añadir una transición nueva.
- **Tiempos de preparación en el propio ítem:** `iniciadoEn`, `listoEn` y `servidoEn`, además del Evento de cada cambio (entidad `cuenta`, `datos.item`). Así el temporizador y los reportes de la Fase 5 no reconstruyen tiempos a partir de los eventos. Sin migración: los ítems anteriores se leen sin tiempos y `verificar:salon` lo tolera.
- **Pantalla KDS en `/kds`**, con layout propio para tablet horizontal (1280×800) o TV (1920×1080). Cada cocinero o barista entra con su cuenta (F2-6); sonido activado por defecto con un botón «Activar sonido» (F2-8):
  - Tarjetas por ronda y estación, ordenadas por antigüedad, con mesa, mesero, tiempo desde el envío, ítems con sus opciones y nota, y botones grandes.
  - Los estados se comunican con texto e icono, nunca solo con color. El temporizador cambia de aspecto con los umbrales de la estación (F2-4: Barra 5/10 min, Cocina 12/20 min, configurables).
- **Aviso al mesero:**
  - Cuando un ítem queda listo, la mesa muestra «Listo para servir (n)» en el plano y en su cuenta.
  - Hay un aviso no intrusivo en `/staff`.
  - «Servir» marca el ítem como servido.

## 3. Ítems de la Fase 2 (propuestos)

Cada ítem = 1 commit (o pocos) con tests primero, revisores y capturas, como en la Fase 1.

### 2.1 Permisos y roles de cocina y barra
- Claves nuevas (`kds:ver`, `item:preparar`, `item:servir`, `pedido:preparar`, `producto:agotar`, `producto:reactivar`) en el catálogo, con la asignación de F2-2, F2-3 y F2-5. Las rutas a `/kds` pasan a 2.5 (con la pantalla).
- **Migración `migrate:2.1`**, idempotente y con `--dry-run` y `--down`, para los roles existentes. Pasa por `/review-migration`, se anota en el README («Al traer cambios») y **se detiene para pedir aprobación**, con `mongodump` antes de aplicarla.
- Rutas por permiso, nunca por el nombre del rol (0.15d, test `sinRolesPorNombre`): con `kds:ver` y sin `mesa:ver`, el inicio es `/kds`; con los dos, `/staff` muestra un enlace a `/kds`.

### 2.2 Transiciones del ítem y tiempos (backend)
- `POST /api/v1/staff/cocina/items/:itemId/estado` con `{ a, versionEsperada? }`.
  - En la transacción: escritura condicional sobre el estado esperado (`409` si otro ya lo movió), `iniciadoEn`, `listoEn` y `servidoEn`, y Evento.
- «Todo listo»: pasa a «listo» todos los ítems pendientes de una ronda y estación de una vez, pasando por `en_preparacion` en la misma transacción (F2-1).
- «Deshacer» de «listo» (vuelve a `en_preparacion`) durante 10 s para quien lo marcó; después, solo el admin con motivo (F2-7).
- Anular un ítem en preparación sigue siendo `item:anular` (D1), y la cocina lo ve tachado con su motivo.
- Tests de concurrencia (dos tablets marcando lo mismo) y del verificador `verificar:salon` ampliado (tiempos coherentes con el estado).

### 2.3 Cola por estación (lectura)
- `GET /api/v1/staff/cocina/cola?estacion=cocina`: rondas enviadas de cuentas abiertas o pedidas con ítems pendientes de esa estación, ordenadas por `enviadaEn`, con mesa, mesero, ítems, opciones, nota y tiempos.
- Sin N+1: consultas en lote, como el plano. Índice para la consulta de la cola.
- Domicilio (F2-3): pedidos confirmados o en preparación como tarjeta con sus líneas de esa estación. El pedido pasa a `en_preparacion` cuando alguna estación empieza y a `listo` cuando todas las estaciones con líneas terminaron (se guarda qué estaciones terminaron), con `pedido:preparar`. Cómo se sabe la estación de cada línea (leerla del producto o copiarla al crear el pedido) es decisión técnica de 2.3.

### 2.4 Tiempo real (SSE)
- `GET /api/v1/staff/eventos?canales=…`: autenticado y con permiso por canal (`kds:ver` para estación, `cuenta:ver` para cuenta, `mesa:ver` para plano; `mesero:<id>` solo si `id` es el usuario de la sesión, 403 si no). Límite de conexiones abiertas por usuario.
- Latido cada 25 s, cabeceras anti-buffer y cierre limpio al cerrar sesión o al revocarse el token.
- Bus en memoria; los servicios de cuentas y cocina publican después de confirmar la transacción.
- En el frontend, `useSondeo` se amplía para escuchar el canal y recargar al recibir un evento, manteniendo el polling de respaldo. `comanda/useCuenta.js`, que tiene su propio polling, pasa a usarlo.
- Tests: emisión tras confirmar (no si la transacción falla), permisos por canal (incluido el 403 de `mesero:<id>` ajeno) y reconexión.

### 2.5 Pantalla KDS (`/kds`)
- Tarjetas por ronda, filtro de estación, temporizador con umbrales y botones de 44 px o más (mejor 56 px a la distancia de la cocina).
- Ítem anulado tachado con su motivo y un aviso visible. «Deshacer» de «listo» durante 10 s (F2-7).
- Sonido al llegar una ronda, activado por defecto, con «Activar sonido» (F2-8). Sin cierre por inactividad en `/kds` (F2-6).
- Capturas a 1280×800 y 1920×1080, con medición táctil.

### 2.6 Aviso al mesero y «servido»
- Badge «Listo para servir» en las tarjetas del plano y en la cuenta, con aviso en `/staff` y botón «Servir» (`item:servir`).
- El plano y la cuenta se actualizan por SSE.

### 2.7 Agotar productos («86») desde la operación
- La cocina o el salón marcan un producto o una opción como agotado (`producto:agotar`) y lo reactivan (`producto:reactivar`), con Evento y quién lo hizo.
- `ENTIDADES_EVENTO` gana `producto` con los tipos `producto_agotado` y `producto_reactivado` (aprobado en F2-5).
- Efecto inmediato en la toma de comanda, el carrito y el catálogo (ya lo respetan desde 1.3, 1.5 y 1.12) y aviso en las rondas en borrador que lo tengan.
- Sin reactivación automática (F2-5).

### 2.8 Límites por IP y sesión en `/kds` (reducido por F2-6)
- Sin dispositivo registrado ni PIN en esta fase (mejora futura en Pendientes).
- Revisar los límites por IP del local: el login ya cuenta por IP + correo, pero el registro y la recuperación van solo por IP (todas las tablets salen por la misma IP).
- `/kds` no se cierra por inactividad.

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

## 5. Preguntas de negocio (respondidas el 2026-11-12: F2-1 a F2-10 en PROGRESO)

| # | Pregunta | Respuesta de Brayan |
|---|---|---|
| 1 | ¿La cocina marca cada ítem o la ronda completa de su estación? | Por ítem, con «Todo listo» por ronda y estación, pasando por `en_preparacion` en la misma transacción |
| 2 | ¿Quién marca «servido»? | El mesero desde `/staff` (`item:servir`) |
| 3 | ¿El domicilio entra al KDS? | (b): tarjeta del pedido en cada estación solo con sus ítems; `en_preparacion` cuando alguna estación empieza y `listo` cuando todas terminaron (se guarda qué estaciones terminaron); permiso nuevo `pedido:preparar` (solo confirmado → en_preparacion → listo) para cocina y barista |
| 4 | Umbrales del temporizador por estación (p. ej. Barra 5/10 min, Cocina 12/20 min) | Barra 5/10 min y Cocina 12/20 min por defecto, configurables por el admin en la pantalla de estaciones |
| 5 | «86»: ¿quién agota, quién reactiva y si se reactiva solo al día siguiente? | Agotan cocina, barista, mesero y admin (`producto:agotar`); reactivan cocina, barista y admin (`producto:reactivar`); sin reactivación automática; `producto` en `ENTIDADES_EVENTO` (`producto_agotado`, `producto_reactivado`) |
| 6 | Pantalla KDS: ¿dispositivo fijo sin login personal o login de un cocinero? ¿PIN para el personal en tablets compartidas? ¿Cómo se sabe quién marcó cada ítem en un KDS de dispositivo? | Sin dispositivo ni PIN en esta fase: cada persona con su cuenta (12 h y «Cambiar de usuario»); el Evento registra quién marcó. 2.8 se reduce a límites por IP y a no cerrar por inactividad en `/kds` |
| 7 | ¿Se puede deshacer «listo» si fue un error? ¿Con qué permiso y durante cuánto tiempo? | «Deshacer» durante 10 s para quien lo marcó; después, solo el admin con motivo |
| 8 | ¿Sonido al llegar una ronda o al quedar un ítem listo? | Activado por defecto en `/kds`, apagado en `/staff`, configurable por pantalla, con «Activar sonido» |
| 9 | ¿Se mantiene «cada ronda se envía completa, sin tiempos ni marchar» (F1-5)? | Sí, se mantiene F1-5 (sin «marchar») |
| 10 | ¿Qué ve el cliente del domicilio? | Nada nuevo en esta fase |

## 6. Pendientes de la Fase 1 que tocan esta fase

- **PIN y dispositivo**: mejora futura (F2-6); `/kds` no se cierra por inactividad.
- ~~Límite de intentos del login con todas las tablets detrás de la misma IP~~: revisado en 2.8 (el login ya contaba por IP + correo; recuperación y restablecimiento pasan a contar por persona).
- ~~Cambios de horario sin Evento~~: hecho en 1.14.
- ~~Carrito y opciones~~: desde 1.14 el carrito marca la línea rechazada, también cuando el «86» llegue desde la cocina.
- **`Pedido.canal` sin rellenar** (1.9): no afecta (F2-3 es la opción b).

## 7. Fuera de alcance de la Fase 2

- Cobro, impuestos, propina, división de cuenta y comprobante interno (Fase 3).
- Reservas conectadas a mesas (Fase 4).
- Inventario y descuento de insumos al preparar (Fase 5). Los tiempos de preparación se registran aquí, pero los reportes son de la Fase 5.
- Para llevar, domicilio dentro del motor de cuentas, repartidores y fidelización (Fase 6).
- Varios procesos con un bus compartido (Redis) y apps nativas.
