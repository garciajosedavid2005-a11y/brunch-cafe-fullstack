# Brunch Café · POS de servicio a la mesa

Sistema de un café-restaurante de Neiva: sitio público con menú, reservas y domicilios, y un punto de venta para el personal (salón, cocina y barra, caja, reparto, inventario y reportes). Tiene backend y frontend en el mismo repositorio.

| Parte | Tecnología | Detalle |
|---|---|---|
| `backend/` | Node 22 LTS (`.nvmrc`), Express 5, Mongoose 9, Zod 4 (ESM) | API REST `/api/v1`, Server-Sent Events, transacciones de MongoDB (replica set obligatorio). Referencia completa de endpoints, migraciones y seguridad en [backend/README.md](backend/README.md) |
| `frontend/` | React 19, Vite, Foundation | Sitio público, Mi cuenta, `/staff`, `/kds` y `/admin` |
| `docs/` | Markdown | Seguimiento ([PROGRESO.md](docs/PROGRESO.md)), planes por fase, [manual de usuario](docs/MANUAL_USUARIO.md), [guía de la demo](docs/GUIA_DEMO.md) y [texto del PR final](docs/PR_FINAL.md) |

Convenciones: montos en pesos colombianos (COP) como enteros; fechas en UTC en la base de datos y en `America/Bogota` solo para mostrar; estados como catálogo con código; errores siempre con el formato `{ error: { code, message, details } }`.

## Inicio rápido (desarrollo)

1. MongoDB **en replica set** (`docker compose up -d` en la raíz, o `npm run mongo:replica-set` sobre un Mongo local; ver backend/README › «MongoDB en replica set»).
2. `backend/`: copia `.env.example` a `.env` y define `MONGO_URI`, `JWT_SECRET`, `CLIENT_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NOMBRE` y `DEV_USUARIOS_PASSWORD`. Después ejecuta `npm install`, `npm run seed:base`, `npm run seed:menu`, `npm run seed:dev`, `npm run seed:demo` y `npm run dev`. La API queda en `http://localhost:4000` (salud: `/api/health`).
3. `frontend/`: copia `.env.example` a `.env` (`VITE_API_URL`), ejecuta `npm install` y `npm run dev` (`http://localhost:5173`).
4. Entra con los usuarios de prueba `*.dev@brunchcafe.test` (contraseña en `DEV_USUARIOS_PASSWORD`; nunca se imprime): `admin.dev`, `mesero.dev`, `cocina.dev`, `cajero.dev`, `repartidor.dev`, `compras.dev` y `cliente.dev` (un barista se crea desde Admin › Usuarios con el rol Barista).

Al traer cambios, aplica las migraciones pendientes en orden, cada una primero con `--dry-run` y con un `mongodump` antes (tabla completa en backend/README › «Al traer cambios»).

## Módulos

| Módulo | Qué hace | Pantallas | Fase |
|---|---|---|---|
| Identidad | Registro, login con cookie `httpOnly`, recuperación de contraseña, roles y permisos por clave, revocación inmediata de sesiones, alta de personal con enlace «Crea tu contraseña», consentimiento de datos (Ley 1581) | `/login`, `/registro`, `/consentimiento`, Admin › Usuarios y Roles | 0–1, 6 |
| Catálogo | Categorías, productos, modificadores con recargo, estaciones (Cocina y Barra), agotados en vivo | `/menu`, Admin › Productos, Categorías y Modificadores, `/staff` › Agotados | 0–2 |
| Salón | Plano de mesas por zona, abrir, unir, mover, bloquear y transferir, cuenta por rondas (comandas), anulaciones con motivo, cuentas para llevar | `/staff` › Salón y Para llevar | 1, 6 |
| Cocina y barra (KDS) | Cola por estación con tiempos y alertas, «Todo listo», deshacer en 10 s, aviso al mesero de lo listo para servir, domicilios en preparación | `/kds` | 2 |
| Caja | Turno con base y arqueo, cobro con propina y pago mixto, división de cuenta (iguales o por ítems), comprobante interno `CI-…` imprimible, nota crédito `NC-…`, cobro de domicilios, canje de puntos y 10 % de cumpleaños | `/staff` › Caja | 3, 3b, 6 |
| Reservas | Reservas del cliente y del personal, aforo por franja, mesa asignada, mesa apartada, «Sentar» que abre la cuenta, no-show, lista de espera | `/reservas`, `/staff` › Reservas | 0, 4 |
| Domicilios | Carrito con hora de entrega y dirección guardada, estados con Evento, repartidor asignado, cobro al recibir | `/domicilios`, `/staff` › Pedidos | 0, 3b, 6 |
| Inventario y compras | Insumos con existencias y costo promedio, recetas por producto y opción, descuento automático al enviar la ronda o confirmar el domicilio, mermas y ajustes con motivo, proveedores, órdenes de compra y recepciones con lotes y vencimientos, alertas de stock bajo | `/staff` › Inventario | 5 |
| Reportes | Ventas por día, franja, producto, categoría, canal y mesero; descuentos, ventas netas, propinas, notas crédito y métodos de pago; operación (tiempos de cocina, mermas, márgenes); exportación CSV | Admin › Reportes | 5, 6 |
| Fidelización | Perfil con fecha de nacimiento (fija tras el primer registro), alergias, preferencias y hasta 5 direcciones; alergias visibles al personal al identificar al cliente; puntos (1 por cada $1.000, canje en bloques de 100 = $10.000) y 10 % de cumpleaños una vez al año | Mi cuenta, `/staff` (cliente en la cuenta), `/kds` | 6 |
| Tiempo real | Server-Sent Events por canal (`plano`, `estacion:<código>`, `cuenta:<id>`, `mesero:<id>`, `catalogo`, `caja`, `reservas`, `para_llevar`, `repartidor:<id>`), siempre sin datos: la pantalla vuelve a leer con su permiso | Todas las del personal | 2–6 |

## Roles y permisos

Los permisos se comprueban por clave en el backend (`requirePermission`), nunca por el nombre del rol. El admin puede editar los permisos de cada rol desde Admin › Roles; esta es la asignación por defecto (`seed:base` y migraciones):

| Rol | Entra en | Permisos por defecto |
|---|---|---|
| Administrador | `/admin` (y `/staff`, `/kds`) | `*` (todo, incluidos los reservados: `item:anular`, `cuenta:cerrar_sin_cobro`, `factura:anular`, `reporte:ver`, `salon:configurar`, `catalogo:gestionar`, `usuario:gestionar`, `rol:gestionar`…) |
| Mesero | `/staff` | `pedido:ver`, `pedido:cambiar_estado`, `reserva:ver`, `reserva:crear`, `reserva:cambiar_estado`, `mesa:ver`, `mesa:operar`, `mesa:bloquear`, `mesa:unir`, `cuenta:abrir`, `cuenta:ver`, `cuenta:transferir`, `comanda:tomar`, `comanda:enviar`, `cuenta:solicitar`, `item:servir`, `producto:agotar`, `cuenta:para_llevar`, `cliente:identificar` |
| Cocina | `/kds` (estación Cocina) | `pedido:ver`, `kds:ver`, `item:preparar`, `pedido:preparar`, `producto:agotar`, `producto:reactivar` |
| Barista | `/kds` (estación Barra) | los mismos de Cocina |
| Cajero | `/staff` › Caja | `pedido:ver`, `cuenta:cobrar`, `caja:abrir`, `caja:cerrar`, `pedido:cobrar`, `pedido:asignar_repartidor`, `cuenta:para_llevar`, `cliente:identificar`, `puntos:canjear` |
| Repartidor | `/staff` › Pedidos (solo los suyos) | `pedido:ver`, `pedido:cobrar`, `pedido:entregar` |
| Compras | `/staff` › Inventario | `inventario:ver`, `inventario:gestionar`, `inventario:ajustar`, `compra:gestionar`, `compra:recibir` |
| Cliente | Sitio público y Mi cuenta | Ninguno de personal: solo ve y edita lo suyo (`/api/v1/cliente/*`) |

El catálogo completo de permisos (clave, módulo y descripción) está en `backend/src/modulos/identidad/permisos.js` y en Admin › Roles.

## Endpoints

Todos bajo `/api/v1`. Resumen por grupo; el detalle de cada ruta (cuerpo, permisos y errores) está en [backend/README.md › Endpoints](backend/README.md#endpoints-apiv1).

| Grupo | Rutas principales | Acceso |
|---|---|---|
| Públicos | `GET /catalogo`, `GET /horarios`, `GET /comentarios`, `GET /api/health` | Sin sesión |
| Autenticación | `POST /auth/registro`, `/auth/login`, `/auth/logout`, `/auth/recuperar-contrasena`, `/auth/restablecer-contrasena`, `/auth/consentimiento`; `GET /auth/me` | Límites por IP y correo |
| Cliente | `/cliente/perfil`, `/cliente/perfil/contrasena`, `/cliente/direcciones[/:id[/principal]]`, `/cliente/puntos`, `/cliente/pedidos[/:id[/cancelar]]`, `/cliente/reservas[/:id[/cancelar]]`, `/cliente/comentarios`, `/cliente/metodos-pago` | Sesión de cliente, siempre sobre sus propios datos |
| Personal: salón | `/staff/salon/mesas`, `/staff/salon/cuentas/:id/...` (ítems, rondas, solicitar, cancelar, transferir, cerrar sin cobro, cliente), `/staff/salon/para-llevar`, `/staff/salon/clientes` | Permisos de salón |
| Personal: cocina | `/staff/cocina/cola`, `/staff/cocina/estaciones`, `/staff/items/:id/estado`, `/staff/cocina/rondas/:id/todo-listo`, `/staff/cocina/pedidos/:id/estacion`, `/staff/agotados` | `kds:ver`, `item:preparar`, `pedido:preparar`, `producto:agotar` |
| Personal: caja | `/staff/caja/turno[/abrir\|/cerrar]`, `/staff/caja/turnos`, `/staff/caja/cuentas[/:id[/cobrar\|/cobrar-parte]]`, `/staff/caja/comprobantes[/:id[/anular]]`, `/staff/caja/domicilios[/:id/cobrar]` | `cuenta:cobrar`, `caja:*`, `pedido:cobrar`, `factura:anular` |
| Personal: pedidos y reservas | `/staff/pedidos[/:id[/estado\|/cancelar\|/repartidor]]`, `/staff/pedidos/repartidores`, `/staff/reservas[/:id/estado\|/mesa\|/sentar]`, `/staff/espera[/:id/sentar\|/retirar]`, `/staff/cuentas-abiertas` | `pedido:*`, `reserva:*` |
| Inventario | `/inventario/insumos`, `/inventario/recetas`, `/inventario/movimientos`, `/inventario/proveedores`, `/inventario/ordenes[/:id/cancelar\|/recepciones]`, `/inventario/alertas`, `/inventario/lotes/:id/descartar` | `inventario:*`, `compra:*` |
| Admin | `/admin/usuarios`, `/admin/roles`, `/admin/permisos`, `/admin/categorias`, `/admin/productos`, `/admin/grupos-modificadores`, `/admin/estaciones`, `/admin/zonas`, `/admin/mesas`, `/admin/estados`, `/admin/metodos-pago`, `/admin/horarios`, `/admin/comentarios`, `/admin/reportes/ventas`, `/admin/reportes/operacion` | El permiso de cada recurso |
| Tiempo real | `GET /staff/eventos?canales=…` (SSE) | El permiso de cada canal |

## Scripts

**Backend (`backend/`)**

| Script | Para qué |
|---|---|
| `npm run dev` / `npm start` | Servidor con recarga (nodemon) / sin recarga |
| `npm test` / `npm run lint` | Vitest + Supertest con MongoDB en memoria (replica set) / ESLint |
| `npm run seed:base` | Roles, permisos, primer admin, estados, métodos de pago, horarios y estaciones. Idempotente; no pisa lo que el admin personalizó |
| `npm run seed:menu` / `seed:modificadores` / `seed:salon` | Menú inicial, modificadores de ejemplo y salón de ejemplo |
| `npm run seed:dev` | Usuarios de prueba `*.dev@brunchcafe.test` de cada rol (solo desarrollo) |
| `npm run seed:demo` | Datos para la demo en vivo (solo desarrollo; ver [GUIA_DEMO.md](docs/GUIA_DEMO.md)) |
| `npm run migrate:<versión>` | Migraciones de 0.6 a 6.7; todas admiten `-- --dry-run` y `-- --down` |
| `npm run verificar:salon` | Consistencia de cuentas, rondas y mesas (solo lectura) |
| `npm run mongo:replica-set` | Inicia el replica set de un nodo |
| `npm run correo:prueba` / `report:correos` | Prueba del SMTP / informe de correos duplicados |

**Frontend (`frontend/`)**

| Script | Para qué |
|---|---|
| `npm run dev` / `npm run build` | Vite en desarrollo / compilación de producción |
| `npm test` / `npm run lint` | Vitest + Testing Library / ESLint |
| `npm run capturas -- <etiqueta>` | Capturas con Playwright en un entorno aislado (BD `brunch-cafe-capturas`, puertos 4100 y 5174), con mediciones de contraste y paleta. Variables: `SOLO`, `ANCHOS`, `CAPTURAS_HORA` |
| `npm run humo` | Prueba de humo del frontend contra la API en marcha |

## Variables de entorno

**Backend (`backend/.env`, validadas con Zod al arrancar)**

| Variable | Obligatoria | Uso |
|---|---|---|
| `MONGO_URI` | Sí | Conexión a MongoDB (replica set) |
| `JWT_SECRET` | Sí | Firma de la sesión (cadena larga y aleatoria) |
| `CLIENT_URL` | Sí | Origen u orígenes del frontend (separados por coma) para CORS |
| `PORT` | No (4000) | Puerto de la API |
| `NODE_ENV` | No | `development`, `test` o `production` (`seed:dev` y `seed:demo` se niegan en producción) |
| `JWT_EXPIRES_IN` / `JWT_EXPIRES_IN_STAFF` | No | Duración de la sesión del cliente / del personal en tablets (12 h por defecto) |
| `COOKIE_SECURE` / `COOKIE_SAMESITE` | No | Cookie de sesión (por defecto `secure` solo en producción) |
| `TRUST_PROXY` | No | Número exacto de proxies delante de la API (para el límite por IP) |
| `LOG_LEVEL` | No | `trace` … `silent` (pino) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | No | Correos de recuperación, «Crea tu contraseña» y reservas; sin SMTP, en desarrollo el enlace va al log |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NOMBRE` | Solo para `seed:base` | Primer administrador (la contraseña nunca se imprime) |
| `DEV_USUARIOS_PASSWORD` | Solo desarrollo | Contraseña de los usuarios `*.dev` (`seed:dev`, `seed:demo`, `capturas`) |

**Frontend (`frontend/.env`)**: `VITE_API_URL`, la URL base de la API (por ejemplo `http://localhost:4000/api`).

## Seguridad (resumen)

- Sesión en cookie `httpOnly` con versión de token: desactivar a alguien, cambiarle el rol o la contraseña corta su acceso en la siguiente petición; el personal y el admin cierran todas sus sesiones al salir.
- Autorización por permiso en cada ruta, con alcance propio: el cliente solo ve lo suyo (un id ajeno da 404), el repartidor solo sus domicilios y la estación del KDS según el rol.
- Esquemas estrictos con Zod (sin asignación masiva). Montos y totales los calcula el servidor. Escrituras condicionales con versión (`409` si otro cambió antes) y transacciones para todo lo que toca varias colecciones (cobro, inventario, puntos).
- `Idempotency-Key` en cobros, pedidos, aperturas y envíos de ronda: un doble clic no cobra ni descuenta dos veces.
- Bitácora inmutable (`Evento`) de cada cambio de estado, cobro, anulación, corrección y asignación, con quién y cuándo.
- Límites de intentos en login, registro, recuperación y búsqueda de clientes; Helmet, CORS con origen exacto y logs sin cookies ni contraseñas.
- Datos personales: consentimiento versionado (Ley 1581); el personal ve alergias y preferencias, pero nunca el correo ni el teléfono completos del cliente.

## Tests

- Backend: Vitest + Supertest sobre MongoDB en memoria en modo replica set (transacciones reales).
- Frontend: Vitest + Testing Library, más capturas con Playwright y prueba de humo.
- Antes de cada commit: `npm test`, `npm run lint` y `npm run build` en backend y frontend (ver [CLAUDE.md](CLAUDE.md)).

## Fuera de alcance (trabajo futuro)

Despliegue, inicio de sesión con Google, facturación electrónica DIAN, plano C del salón, PIN de acceso en tablets, impresora térmica y escalado a varios servidores (los avisos en vivo y la caché de sesión hoy viven en un solo proceso). El detalle está en [docs/PR_FINAL.md](docs/PR_FINAL.md).
