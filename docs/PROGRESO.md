# Progreso Brunch Café

## Fase actual: 0 — Saneamiento (en curso)

### Ítems Fase 0

| ID | Ítem | Estado inicial | Estado actual | Commit | Notas |
|---|---|---|---|---|---|
| 0.1 | Infraestructura: tests, lint, errores, logger | FALTA | HECHO | ce1a848 | Vitest+Supertest+MongoMemoryReplSet (17 tests), ESLint 9, `{error:{code,message,details}}`, pino/pino-http (sustituye morgan). `normalizarErroresLegados` es transitorio (se retira en 0.11). Frontend: `api.js` y `adminApi.js` leen el formato nuevo. Mongoose `new:true` → `returnDocument:'after'`. |
| 0.2 | Seguridad auth | FALTA | HECHO | 5bfaef2 | Cookie httpOnly/sameSite/secure(env), JWT 2 h, mensajes genéricos, rate limit login/registro, helmet, CORS por lista, 401 en token inválido/vencido, N2 (correo normalizado + `report:correos`), N1 en auth. 33 tests. Limitación: el registro aún permite inferir existencia (éxito vs. error); cerrarlo del todo requiere verificación por correo. Rate limit en memoria (1 instancia). |
| 0.3 | Seed roles + primer admin | FALTA | HECHO | 1e6dc10 | `npm run seed:base` idempotente; roles admin/cliente al arrancar (registro sin upsert); admins existentes respetados y alias `Admin`/`Administrador` unificados. 41 tests. Ejecutado en BD local: roles OK; el admin se creó después con `ADMIN_*` (verificado en 0.7). |
| 0.4 | RBAC con permisos desde BD | FALTA | HECHO | 7dc8bbc | Catálogo `Permiso` (16 claves, 5 reservadas), `autenticar` (BD + caché 30 s, invalidación inmediata), `requirePermission` en todos los routers, roles de staff, `Usuario.activo`, `GET/PATCH /api/admin/usuarios` con protecciones, pantallas Roles (casillas) y Usuarios. 74 tests. |
| 0.7 | Enums + transiciones + Evento | FALTA | HECHO | 8f8d894 | `Estado.codigo` fijo + catálogo y máquina en `src/libs/estados.js` (cada transición declara actor, permiso y si exige motivo); estados finales no se reabren (pedido y reserva). Modelo `Evento` (cada cambio, incluidas creación y cancelación por cliente). Sin inferencia por texto ni upserts en peticiones; `sembrarEstados` al arrancar (el servidor no arranca si falta migrar). `PATCH /api/customer/orders/:id/cancel` (cliente, solo pendiente). Estados: solo `PUT` de etiqueta/descripción/colores; `POST`/`DELETE` → 405. Migración `npm run migrate:0.7` (`--dry-run`, `--down`) aplicada en BD local tras `mongodump` (`backups/pre-0.7-20261105T182632Z`); up→down→up verificado: 0 diferencias con el respaldo. Frontend: selector solo con transiciones permitidas (pide motivo), StatesSection sin crear/borrar, portal con estados nuevos y botón de cancelar pedido pendiente. 117 tests. |
| 0.7b | Correcciones tras 0.7 | — | HECHO | 0a91435, 21576d3, f49adf6, db73988, 59458a9, b1b4452, 6569989, c2f58c7 | Reglas de reserva (motivo obligatorio al cancelar; `pendiente → sentada` como check-in). Frontend con Vitest + Testing Library. Menú: la BD local no tenía productos (se ejecutó `seed:menu`); el menú distingue vacío de error. Diálogo propio accesible: 0 `alert/confirm/prompt`. Confirmaciones de reserva, usuario y rol. Eliminar roles personalizados (`ROL_CON_USUARIOS`). Sección "Seguridad y configuración". Insignia de rol para staff en `/cuenta`. Contraste: regla global `span` de footer.css. Backend 127 tests, frontend 44. |
| 0.7c | Revisión visual y sesiones | — | HECHO | 9773020…23ebe3d | Playwright + `npm run capturas` (admin/cliente/mesero de `npm run seed:dev`, 1280/1024/768 px). Test de selectores CSS globales (solo los archivos base). Destacados vacío: `useAnimacionEntrada` no observaba elementos que aparecen después del montaje. Detalle del pedido: selector con aspecto de selector, fecha con formato, scroll de la marca. Roles/Usuarios/Estados: tablas que caben a 1280 px; candado para los roles de sistema, nota única y "+N más". `tokenVersion`: cambiar la contraseña o desactivar cierra sesiones. Colores: fallback del catálogo y `npm run recolorear:estados`. Backend 133 tests, frontend 49. |
| 0.7d | Ajustes tras revisar 0.7c | — | HECHO | (este commit) | Enlace activo/hover del navbar claro con `--color-primario` (~8:1; antes ~1.9:1), con test de contraste. Hero: con flechas visibles (> 640 px) el texto deja ~5rem al borde de la pantalla (a 768 px las flechas tapaban el subtítulo). Seed: etiqueta del catálogo si la guardada es el código, vacía o ausente (en la BD local `cliente` no tenía etiqueta y la UI mostraba el código); se ejecutó `seed:base`. |
| 0.5 | Catálogo en MongoDB (resto) | PARCIAL | HECHO | 2762b25…c970a07 | Precio entero en COP en el catálogo; `formatearCOP` única utilidad (el carrito ya no parsea texto). `GET /api/v1/catalogo` (alias `/api/productos/menu`); imágenes subidas se guardan en `MenuImage` y el catálogo nunca envía base64. `Producto.disponible` con interruptor en el admin; agotados fuera del menú y `409 PRODUCT_UNAVAILABLE` al pedir. Seed del menú en `backend/seed-data/` (idempotente, no pisa ediciones). Métodos de pago en `seed:base`. `codigo` con contador atómico (`counters`). N3: precio entero ≥ 0; imagen ≤ 2 MB y JSON ≤ 3 MB, avisos claros en el admin. Backend 160 tests, frontend 66. |
| 0.6 | Referencias ObjectId + migración | PARCIAL | HECHO | 2277d4a | Catálogo con `id` = ObjectId (`codigo` se conserva para enlaces). Pedidos y reseñas con `productoRef`; `productoId` numérico aceptado (deprecado, 0.12). `DetallePedido.producto` y `Comentario.producto` obligatorios. `npm run migrate:0.6` (`--dry-run`, `--down`) aplicada en BD local tras `mongodump` (`backups/pre-0.6-20261105T214807Z`): 2 líneas de pedido completadas; up→down→up verificado (tras down idéntico al original; segundo up idéntico al primero). Backend 170 tests, frontend 68. |
| 0.10 | Fechas UTC + util America/Bogota | FALTA | PENDIENTE | — | |
| 0.8 | Unificar reservas/perfil + /api/v1 | FALTA | PENDIENTE | — | |
| 0.9 | Transacción + Idempotency-Key | PARCIAL | PENDIENTE | — | |
| 0.11 | Refactor por dominios (cierre) | FALTA | PENDIENTE | — | incremental |
| 0.12 | Limpieza | FALTA | PENDIENTE | — | |
| 0.13 | Endpoints staff de pedido | PARCIAL | PENDIENTE | — | |

> El diagnóstico de la Fase A (mapa del repo, hallazgos T1–T11, N1–N8, riesgos) está en [DIAGNOSTICO_FASE_A.md](DIAGNOSTICO_FASE_A.md).

## Decisiones tomadas (fecha · decisión · quién)
- 2026-11-05 · Fase A ejecutada sin modificar código; solo se creó este archivo · Claude
- 2026-11-05 · Orden de Fase 0 aprobado: 0.7 antes de 0.5; refactor 0.11 incremental · Brayan
- 2026-11-05 · Git: se trabaja directamente en la rama `Brayan` (no ramas por fase); un commit por ítem; sin push/merge sin pedirlo · Brayan

**Técnicas**
- 2026-11-05 · Herramientas: Vitest + Supertest + mongodb-memory-server (replica set), ESLint 9 flat config, pino + pino-http · Brayan
- 2026-11-05 · Seguridad: helmet + express-rate-limit. Login: 5 intentos / 15 min por IP+correo. Registro: 10 / hora por IP. Registro con mensaje genérico (no revela si el correo existe) · Brayan
- 2026-11-05 · Revocación (opción A): JWT de 2 h en cookie httpOnly; releer usuario, rol y permisos desde BD en cada petición (caché 30 s). Usuario desactivado = acceso cortado. Token inválido o vencido = 401 · Brayan
- 2026-11-05 · Primer admin por `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NOMBRE`; seed idempotente; contraseña ≥ 10 caracteres; nunca se imprime en logs. Admins creados a mano en otras BD se respetan y reciben el rol admin con permisos · Brayan
- 2026-11-05 · Datos: BD solo de desarrollo; aun así, migraciones NO destructivas (añadir campos y conservar los viejos), con script reversible y respaldo `mongodump` previo · Brayan
- 2026-11-05 · MongoDB: `docker-compose.yml` con `mongo --replSet rs0` para dev (BD compartible); README documenta también cómo activar el replica set en el Mongo local de Windows · Brayan
- 2026-11-05 · `POST /api/reservas`: alias del servicio unificado (mismas validaciones), marcado como deprecado; se elimina al final de la Fase 0 · Brayan
- 2026-11-05 · Perfil: `GET/PATCH /api/v1/cliente/perfil` con campo `correo`; alias temporales `/customer/profile` y `/usuarios/perfil`; el frontend (incluido `Perfil.jsx`) usa un solo cliente HTTP · Brayan
- 2026-11-05 · Imágenes: se quedan en MongoDB; límite 2 MB por imagen y `express.json` 3 MB; el endpoint de menú no devuelve base64 (usa `/menu/imagenes/:nombre`) · Brayan
- 2026-11-05 · `/api/v1`: sí; las rutas actuales quedan como alias hasta migrar el frontend · Brayan

**Negocio**
- 2026-11-05 · Pedido: `pendiente → confirmado → en_preparacion → listo → en_camino → entregado` + `cancelado`. "Recibido" → `entregado` (migrar existentes). Para llevar (futuro): `listo → entregado` sin `en_camino`. Cliente cancela solo en `pendiente`; staff cancela en `pendiente` o `confirmado` con motivo obligatorio. Todo cambio queda en Evento · Brayan
- 2026-11-05 · Reserva: `pendiente → confirmada → sentada → completada` + `cancelada` y `no_show`. Confirma el admin (y el anfitrión cuando exista). Si el cliente edita una reserva confirmada vuelve a `pendiente` y se registra Evento con motivo "editada por cliente" (notificación al staff en Fase 4) · Brayan
- 2026-11-05 · Estados: el admin solo edita etiqueta, color y descripción; no crea ni borra estados. Ajustar `StatesSection.jsx` · Brayan
- 2026-11-05 · Reseñas: verificada = pedido `entregado` que contenga el producto. 1 reseña por usuario y producto (editable). Reseña general requiere ≥ 1 pedido entregado o reserva completada. Existentes: se conservan con `verificada: false` (sin borrar ni ocultar) · Brayan
- 2026-11-05 · Horarios configurables en BD (colección de configuración con seed): domicilio 08:00–16:00; reservas 08:00–19:00 (L-V) y 08:00–17:00 (S-D). Domicilio solo mismo día, ≥ 1 h de anticipación, sin horas pasadas (corrige N8) · Brayan
- 2026-11-05 · "Beneficios exclusivos" → texto neutro "Gestiona tus pedidos y reservas" hasta la Fase 6 · Brayan

**Hallazgos nuevos**
- 2026-11-05 · N1: corregir mensajes Zod 4 al tocar cada esquema · Brayan
- 2026-11-05 · N2: normalizar correo (trim + minúsculas) en registro, login y modelo; script que detecte y reporte duplicados existentes (no fusionar sin preguntar) · Brayan
- 2026-11-05 · N3: precio entero COP `z.coerce.number().int().min(0)` · Brayan
- 2026-11-05 · N6 y N7: eliminar en 0.12 · Brayan
- 2026-11-05 · `.env` local: `JWT_EXPIRES_IN` cambiado de 7d a 2h (decisión 3) · Claude
- 2026-11-05 · `.gitignore` ignora solo `docs/auditoria/`; PROGRESO.md se versiona · Brayan
- 2026-11-05 · RBAC 0.4: catálogo `Permiso` sembrado; `Rol.permisos` = claves validadas; admin con `*`; `Usuario.activo`; middleware `autenticar` (BD + caché 30 s, invalidación inmediata al cambiar rol/usuario) y `requirePermission`; 401 sin sesión, 403 sin permiso · Brayan
- 2026-11-05 · `pedido:cancelar` es un permiso aparte de `pedido:cambiar_estado` · Brayan
- 2026-11-05 · Roles de staff creados ya con permisos mínimos (mesero, anfitrion, cocina, barista, cajero, repartidor, compras); permisos de fases futuras en catálogo pero sin asignar · Brayan
- 2026-11-05 · Protecciones: no se puede desactivar, quitar admin ni borrar al último admin activo; un admin no puede quitarse admin ni desactivarse; rol admin y `*` no editables ni borrables; no se borra un rol con usuarios · Brayan
- 2026-11-05 · `PATCH /api/admin/usuarios/:id` (activo, rol) + pantalla mínima de Usuarios en el dashboard · Brayan
- 2026-11-05 · 0.7 dejará que cada transición declare su permiso; por ahora basta `pedido:cambiar_estado` · Brayan
- 2026-11-05 · Cliente sin permisos de staff; sus rutas se protegen por propiedad · Brayan
- 2026-11-05 · Respaldo antes de migrar en `backups/` (ignorado por git), con `mongodump` local o el del contenedor Docker · Brayan
- 2026-11-05 · Toda migración tiene `--dry-run` (conteo por colección + tabla de equivalencias) y `--down`; si hay estados sin equivalencia no se adivinan: se listan y se pregunta. Sin anomalías se aplica, se prueba `--down` y se vuelve a aplicar · Brayan
- 2026-11-05 · Eventos creados por migraciones: motivo "migracion 0.7", usuario `null` + actor "sistema" · Brayan
- 2026-11-05 · La regla de transiciones aplica también a reservas (incluido no reabrir un estado final) · Brayan
- 2026-11-05 · 0.7: "Recibido" se renombra a la etiqueta "Entregado" (código `entregado`); las demás etiquetas existentes se conservan · Claude
- 2026-11-05 · 0.7: el portal del cliente mantiene `status` en inglés (`pending`, `confirmed`…) y suma `on_the_way`, `seated`, `completed`, `no_show`; las respuestas añaden `codigo` · Claude
- 2026-11-05 · 0.7: `PATCH .../estado` acepta `codigo` (preferido) o `estado` (_id, compatibilidad); la ruta de pedidos admite `pedido:cambiar_estado` o `pedido:cancelar` y cada transición exige el suyo · Claude
- 2026-11-05 · 0.7b · `no_show` solo desde `confirmada` · Brayan
- 2026-11-05 · 0.7b · Staff cancela una reserva con motivo **obligatorio** (igual que en pedidos) · Brayan
- 2026-11-05 · 0.7b · Staff con `reserva:cambiar_estado` puede hacer `pendiente → sentada` (check-in sin confirmar), con Evento de motivo "check-in sin confirmar". No hay otros saltos · Brayan
- 2026-11-05 · 0.7b · Tests de frontend con Vitest + @testing-library/react + jsdom (aprobado; se añadió @testing-library/jest-dom) · Brayan
- 2026-11-05 · 0.7b · Sin `alert/confirm/prompt`: diálogo propio (`useDialogo`) para confirmaciones, avisos y motivos · Brayan
- 2026-11-05 · 0.7b · "¿Olvidaste tu contraseña?" informa que la recuperación aún no está disponible (no se simula el envío de un correo); el aviso tras crear un pedido dice "pedido recibido", no "confirmado" · Claude
- 2026-11-05 · 0.7b · `/auth/me` añade `roleLabel` y el login `rolEtiqueta` (campos nuevos); rol con usuarios → `409 ROL_CON_USUARIOS` (antes `CONFLICT`) · Claude
- 2026-11-05 · 0.7c · Verificación visual con Playwright (solo Chromium); usuarios de prueba `*.dev@brunchcafe.test` creados por `npm run seed:dev`, contraseña en `DEV_USUARIOS_PASSWORD` (fuera del código) · Brayan
- 2026-11-05 · 0.7c · Sesiones: `Usuario.tokenVersion` en el JWT (`tv`); cambiar la contraseña o desactivar sube la versión → `401 SESSION_REVOKED`. Los tokens sin `tv` valen como 0 (no se cortan sesiones al desplegar) · Brayan
- 2026-11-05 · 0.7c · Estados sin color guardado usan el color del catálogo (se quitó el default del esquema); el recoloreo solo toca `#b78103` exacto · Brayan
- 2026-11-05 · 0.7c · Roles: Tipo dentro de la celda del rol; Usuarios: correo bajo el nombre; Estados: sin la columna Etiqueta repetida (para que quepan a 1280 px) · Claude
- 2026-11-05 · 0.5 · `seed:menu` solo crea lo que falta y no modifica productos, categorías ni imágenes existentes (antes sobrescribía precio, descripción y destacado en cada ejecución) · Claude
- 2026-11-05 · 0.5 · `/api/v1/catalogo` conserva la forma de la respuesta anterior (`categorias` como lista de nombres, `id` = código numérico) para no cambiar el contrato del frontend; solo `precio` pasa a número · Claude
- 2026-11-05 · 0.5 · Pedido con producto agotado → `409 PRODUCT_UNAVAILABLE` con `details.productos` (códigos) · Claude
- 2026-11-05 · 0.5 · Los métodos de pago se crean solo con `seed:base`; un método borrado por el admin no reaparece · Brayan
- 2026-11-05 · 0.6 · Referencia a productos por ObjectId (`productoRef`); el `codigo` numérico se mantiene como número visible y en los enlaces `/menu#producto-<codigo>` · Claude
- 2026-11-05 · 0.6 · Migración 0.6 aplicada en BD local (aprobada); la colección heredada `reviews` no se tocó · Brayan
- 2026-11-05 · Tests del backend en serie en Windows (`fileParallelism: false`): reduce el crash 0xC0000409, no lo elimina · Claude
- 2026-11-05 · T4: `codigo` con contador atómico (colección `counters`, `findOneAndUpdate` + `$inc`) mientras exista `codigo` · Brayan

## Pendientes / preguntas abiertas

- **Recuperar contraseña:** no existe en el backend (haría falta envío de correo). El enlace del login lo explica; queda para una fase posterior.
- **Estados antiguos sin descripción:** "Pendiente" (pedido y reserva) y "Cancelada" (reserva) de la BD local no tienen descripción guardada (se muestran vacíos en Estados). Se puede escribir desde el dashboard; no se migró.
- **Evento sin transacción:** el cambio de estado y su Evento son dos escrituras; si la segunda falla queda el cambio sin evento. Se cierra en 0.9 (transacciones).
- **Para llevar:** la transición `listo → entregado` está definida, pero se activa cuando el pedido tenga campo de modalidad (hoy todos son domicilio).
- **`PATCH /api/reservas/:id/cancelar` (deprecado):** no valida que la reserva sea futura (el portal usa `/customer/reservations/:id/cancel`, que sí lo valida). Se elimina con el resto de `/api/reservas` del cliente al final de la Fase 0.
- **Crash intermitente de Vitest en Windows** (se queda en Pendientes; se probará Node 22 LTS antes de montar CI): en ~1 de cada 10 ejecuciones (en 0.5, con 17 archivos de test, ~1 de cada 3; desde 0.6 los tests corren en serie en Windows y ocurre menos, pero sigue) un worker muere con código nativo `3221226505` (`0xC0000409`) sin fallar ninguna aserción. También ocurre con el código de 0.4 (verificado en un worktree de `d7d8dfc`), así que no lo introdujo 0.7; con `--pool=threads` también pasa. Sospecha: Node 24.15 en Windows. Volver a ejecutar basta; investigar (¿probar Node 22 LTS?) antes de montar CI.
- **Respaldos:** en `backups/` (ignorado por git). `mongodump` no está instalado en Windows; se usa la imagen Docker `mongo:7` (requiere Docker Desktop encendido).
- **Carrera en "último admin":** dos degradaciones simultáneas de los dos últimos admins podrían dejar 0 admins (no hay transacción). Se cerrará en 0.9 con transacciones (requiere replica set).
- **Staff en el frontend:** un usuario con rol de staff (mesero, etc.) que inicia sesión se redirige a `/cuenta` (el frontend solo distingue `admin`). La interfaz de staff llega en la Fase 1.
- **Tokens sin `tv` (anteriores a 0.7c):** hoy valen como versión 0 para no cortar sesiones al desplegar. En 0.12 rechazarlos (para entonces habrán vencido, duran 2 h): quitar el `|| 0` de `payload.tv` en `validateToken.js`.
- **`productoId` numérico en pedidos y reseñas:** aceptado por compatibilidad desde 0.6; retirarlo en 0.12 (el frontend ya envía `productoRef`).
- **Alias `GET /api/productos/menu`:** el frontend ya usa `/api/v1/catalogo`; retirar el alias en 0.12.
- **Imágenes sin uso en `seed-data/imagenes/`:** hay 26 archivos y 24 productos; 2 no los usa ningún producto (no se borraron).
- **Imágenes del seed de más de 2 MB:** las del menú inicial pesan 2,4–2,8 MB; el límite de 2 MB aplica a las subidas desde el admin, no al seed.
- **`authorizeRole.js`:** sin uso desde 0.4, marcado como deprecado; se propondrá eliminarlo en 0.12.
- **Colecciones heredadas** en la BD local (`users`, `orders`, `reservations`, `reviews`): no se tocan; en 0.12 se propondrá eliminarlas con `mongodump` previo y confirmación.
- **Registro:** aún permite inferir si un correo existe (éxito vs. error). Cerrarlo del todo requiere verificación por correo (fuera de alcance de la Fase 0).

### Para fases posteriores (no bloquean la Fase 0)
- Fase 3: IVA o INC, propina (sugerida/voluntaria/%), métodos de pago en caja, consecutivo y alcance DIAN.
- Fase 5: en qué momento se descuenta inventario y cómo se revierte.

## Preguntas resueltas (ver "Decisiones tomadas")

| # | Pregunta | Resolución |
|---|---|---|
| 1 | Herramientas 0.1 | Vitest + Supertest + mongodb-memory-server, ESLint 9, pino |
| 2 | Seguridad 0.2 | helmet + express-rate-limit; login 5/15 min IP+correo; registro 10/h IP |
| 3 | Revocación | Opción A: JWT 2 h + permisos desde BD (caché 30 s) |
| 4 | Primer admin | `ADMIN_EMAIL`/`ADMIN_PASSWORD`/`ADMIN_NOMBRE`; respetar admins existentes |
| 5 | Datos existentes | Solo desarrollo; migraciones no destructivas, reversibles, con `mongodump` |
| 6 | Replica set | `docker-compose.yml` con `--replSet rs0` + README para Mongo local |
| 7 | `POST /api/reservas` | Alias deprecado del servicio unificado; se elimina al final de la Fase 0 |
| 8 | Perfil | `/api/v1/cliente/perfil` con `correo`; alias temporales; un solo cliente HTTP |
| 9 | Imágenes | En MongoDB; 2 MB por imagen; `express.json` 3 MB; menú sin base64 |
| 10 | `/api/v1` | Sí, con alias de las rutas actuales |
| 11 | Estados de pedido | `pendiente→confirmado→en_preparacion→listo→en_camino→entregado` + `cancelado` |
| 12 | Estados de reserva | `pendiente→confirmada→sentada→completada` + `cancelada`, `no_show` |
| 13 | Estados editables | Solo etiqueta, color y descripción |
| 14 | Reseña verificada | Pedido entregado con el producto; 1 por usuario/producto; existentes `verificada:false` |
| 15 | Horarios | Configurables en BD; domicilio 08–16; reservas 08–19 (L-V), 08–17 (S-D) |
| 16 | "Beneficios exclusivos" | Texto neutro "Gestiona tus pedidos y reservas" |
| 0.4 | Diseño RBAC | Ver decisiones del 2026-11-05 sobre RBAC |
| 0.4b | ¿Se creó el admin? | Sí: verificado (rol `admin`, `*`, activo, contraseña con hash; 1 admin activo) |
| 0.7 | Respaldo, simulacro y reversión | Ver decisiones del 2026-11-05 sobre migraciones |
