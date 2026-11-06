# API del cliente

## Inicio local

1. Copia `.env.example` a `.env` y configura `MONGO_URI` y un `JWT_SECRET` aleatorio.
2. Ejecuta `npm install` si todavía no están instaladas las dependencias.
3. Define `ADMIN_EMAIL`, `ADMIN_PASSWORD` (≥ 10 caracteres) y `ADMIN_NOMBRE` en `.env` y ejecuta `npm run seed:base` para crear los roles base, el primer administrador y los métodos de pago.
4. `npm run seed:menu` para cargar el menú inicial (categorías, productos e imágenes de `seed-data/`).
5. Inicia MongoDB **en modo replica set** (ver «MongoDB en replica set») y ejecuta `npm run dev`. Sin replica set el servidor no arranca: pedidos, cambios de estado y usuarios usan transacciones.
6. En `frontend`, copia `.env.example` a `.env` y ejecuta `npm run dev`.

El backend escucha por defecto en `http://localhost:4000`; el cliente usa cookies con credenciales habilitadas. En producción, frontend y API deben servirse por HTTPS y `CLIENT_URL` debe apuntar al origen exacto del frontend.

## Desarrollo

| Comando | Acción |
|---|---|
| `npm run dev` | Servidor con recarga (nodemon) |
| `npm start` | Servidor sin recarga |
| `npm test` | Suite de tests (Vitest + Supertest + mongodb-memory-server en replica set) |
| `npm run test:watch` | Tests en modo observación |
| `npm run lint` | ESLint 9 (flat config) |
| `npm run migrate:0.7` | Migración de estados (ver abajo) |
| `npm run seed:base` | Roles, primer admin, estados y métodos de pago (ver abajo) |
| `npm run seed:menu` | Menú inicial desde `seed-data/` (ver abajo) |
| `npm run mongo:replica-set` | Inicia el replica set `rs0` de un nodo en el Mongo de `MONGO_URI` (idempotente; `-- --dry-run`) |
| `npm run seed:dev` | Usuarios de prueba `*.dev@brunchcafe.test` (solo desarrollo; contraseña en `DEV_USUARIOS_PASSWORD`) |

- La primera ejecución de `npm test` descarga el binario de `mongod` (~100 MB) y lo deja en caché; no necesita un Mongo instalado.
- `src/app.js` construye la app de Express (lo usan los tests); `src/index.js` conecta a MongoDB y escucha.
- Logs con pino: legibles en desarrollo (`pino-pretty`), JSON en producción y silenciados en tests. Cookies, cabeceras de autorización y contraseñas nunca se registran. Nivel configurable con `LOG_LEVEL`.

### MongoDB en replica set (0.9)

Las transacciones de MongoDB solo funcionan en un replica set (o mongos). Un nodo basta para desarrollo. Sin replica set el servidor **no arranca** y muestra estas instrucciones. Hay dos caminos:

#### Camino A: Mongo local de Windows (servicio `MongoDB`)

Conserva los datos y la misma `MONGO_URI`.

1. Respaldo previo con `mongodump` (ver «Migraciones y respaldo»).
2. Simulacro, en una PowerShell **abierta como administrador** desde la raíz del repo (muestra el archivo y el cambio, no toca nada):
   ```powershell
   powershell -ExecutionPolicy Bypass -File backend\scripts\activar-replica-set-windows.ps1 -DryRun
   ```
3. El mismo comando sin `-DryRun`: guarda `mongod.cfg.bak-AAAAMMDDTHHMMSS`, añade `replication.replSetName: rs0` a `mongod.cfg` y reinicia el servicio. Si el archivo ya tiene `replSetName` no cambia nada.
4. Sin administrador, en `backend`: `npm run mongo:replica-set -- --dry-run` (muestra la configuración) y `npm run mongo:replica-set` (ejecuta `replSetInitiate` con el host de `MONGO_URI`; si ya está iniciado no hace nada).
5. Comprobar: `npm run mongo:replica-set` responde «Replica set ya iniciado: rs0 (primario: sí)» y `npm run dev` arranca.

Para volver atrás: el mismo script con `-Revertir` (restaura el último `mongod.cfg.bak-*` y reinicia; `-Revertir -DryRun` dice cuál restauraría). Mongo vuelve a standalone y el backend deja de arrancar.

#### Camino B: Docker (`docker-compose.yml` en la raíz)

No toca el Mongo local; la BD empieza vacía.

1. `docker compose up -d mongo`: levanta `mongo:7` con `--replSet rs0` en el puerto **27018** (para no chocar con un Mongo local en 27017). El healthcheck inicia el replica set solo; espera a que `docker compose ps` lo muestre `healthy`.
2. En `backend/.env`: `MONGO_URI=mongodb://127.0.0.1:27018/brunch-cafe?directConnection=true`.
3. Datos: `npm run seed:base` y `npm run seed:menu`, o `mongorestore` de un respaldo de `backups/`.
4. Parar: `docker compose stop mongo` (conserva el volumen `mongo-datos`); `docker compose down -v` lo borra.

Los dos caminos se probaron el 2026-11-05: el A en el equipo de desarrollo y el B con una transacción de prueba.

### Integridad de pedidos (0.9)

- Pedido, líneas (con nombre y precio del momento) y Evento inicial se guardan en una transacción; lo mismo cada cambio de estado con su Evento y la creación de reservas.
- Quitar el rol o desactivar a un admin cuenta los admins restantes dentro de una transacción que escribe un documento común (`counters/bloqueo-ultimo-admin`): dos degradaciones simultáneas no pueden dejar 0 admins.
- `POST /api/v1/cliente/pedidos` acepta la cabecera `Idempotency-Key` (8–100 caracteres `A-Z a-z 0-9 _ -`; opcional). Misma clave y mismos datos → la respuesta original con `Idempotent-Replayed: true`; otros datos → `422 IDEMPOTENCY_KEY_REUSED`; aún en curso → `409 IDEMPOTENCY_IN_PROGRESS`. Si la petición falla, la clave se libera. Las claves son por usuario y caducan a las 24 h (colección `solicitudes_idempotentes`, índice TTL). El checkout genera una clave por compra.

### Datos base (`npm run seed:base`)

Idempotente: se puede ejecutar las veces que quieras.

- Asegura los roles de sistema `admin` y `cliente` (no pisa etiqueta ni descripción editadas). El servidor también los asegura al arrancar, así que el registro nunca crea roles durante una petición.
- Crea el primer administrador con `ADMIN_EMAIL`, `ADMIN_PASSWORD` y `ADMIN_NOMBRE` ("Nombre Apellido"). Si el correo ya existe, **no cambia su contraseña ni sus datos**: solo le asigna el rol `admin`. Sin esas variables, este paso se omite.
- Si en la BD hay roles creados a mano como `Admin` o `Administrador`, sus usuarios pasan al rol canónico `admin` (el rol viejo se conserva).
- Pone la etiqueta del catálogo ("Cliente", "Mesero"…) a los roles cuya etiqueta guardada es el código, vacía o ausente.
- Crea los métodos de pago que falten (Contra Entrega, Tarjeta débito, Tarjeta crédito). Las peticiones ya no los crean: un método que el admin borre no reaparece hasta volver a ejecutar el seed.

### Menú inicial (`npm run seed:menu`)

Lee `seed-data/menu.json` (categorías con descripción y productos con `codigo`, precio entero en COP y nombre de archivo de imagen) y las imágenes de `seed-data/imagenes/`. No depende de la carpeta del frontend.

- Valida todo el archivo antes de escribir (precios enteros, categorías existentes, imágenes presentes, códigos únicos).
- Idempotente y conservador: crea las categorías, imágenes y productos que falten y **no modifica** los existentes (precio, descripción, disponibilidad o destacado editados en el admin se respetan).

### Catálogo

- `GET /api/v1/catalogo` (público): categorías y productos **disponibles**, precio entero en COP (el frontend lo formatea) e imagen siempre como URL (`/productos/menu/imagenes/...`), nunca base64. `GET /api/productos/menu` es un alias con la misma respuesta mientras queden clientes que lo usen.
- `Producto.disponible` (por defecto `true`): los agotados no salen en el catálogo y `POST /api/customer/orders` los rechaza con `409 PRODUCT_UNAVAILABLE` (indica cuáles). El admin los sigue viendo y los activa con un interruptor.
- Imágenes subidas desde el admin: máximo 2 MB (PNG, JPG, WEBP o GIF); se guardan en `MenuImage` y el producto guarda su URL. El cuerpo JSON admite hasta 3 MB (`413 PAYLOAD_TOO_LARGE`).
- Precio: entero ≥ 0 (`"12000"` se acepta; decimales y negativos no).
- `codigo` (número que usan carrito y pedidos) sale de un contador atómico (colección `counters`); nunca se repite ni se reutiliza.

### Seguridad de la sesión

- Sesión en cookie `token` **httpOnly**, `sameSite` configurable (`lax` por defecto) y `secure` automático en producción; dura lo mismo que el JWT (`JWT_EXPIRES_IN`, **2 h** por defecto).
- Token ausente, inválido o vencido → `401` (`UNAUTHORIZED`, `INVALID_TOKEN` o `SESSION_EXPIRED`); la cookie inválida se borra.
- Login y registro responden con mensajes genéricos (no revelan si un correo está registrado).
- Rate limit en memoria (una sola instancia): login 5 intentos **fallidos** cada 15 min por IP + correo; registro 10 por hora por IP → `429 TOO_MANY_REQUESTS`. Detrás de un proxy configura `TRUST_PROXY`.
- `helmet` activo; CORS solo para los orígenes de `CLIENT_URL` (lista separada por comas).
- Correos normalizados (trim + minúsculas). Para revisar cuentas antiguas: `npm run report:correos` (solo reporta, no modifica).

### Roles y permisos (RBAC)

- El catálogo de permisos vive en `src/libs/permisos.js` (fuente de verdad) y se refleja en la colección `permisos` al arrancar. Las claves marcadas como `reservado` son de fases futuras: aparecen en el catálogo pero aún no se pueden asignar.
- El JWT solo identifica al usuario. En cada petición `autenticar` relee usuario, rol y permisos desde la BD (caché en memoria de 30 s). Editar un rol o un usuario invalida su caché al instante; un usuario desactivado o borrado recibe `401` (`ACCOUNT_DISABLED` / `INVALID_TOKEN`) y no puede iniciar sesión (`403 ACCOUNT_DISABLED`).
- Protege rutas con `requirePermission('clave')` (con varias claves basta una). Sin sesión → `401`; sin permiso → `403 FORBIDDEN`.
- Roles sembrados: `admin` (`*`, no editable ni borrable), `cliente` (sin permisos de staff; sus rutas se protegen por propiedad) y los de staff `mesero`, `anfitrion`, `cocina`, `barista`, `cajero`, `repartidor` y `compras` con permisos mínimos (editables desde el dashboard, no borrables).
- `GET /api/admin/usuarios` y `PATCH /api/admin/usuarios/:id` (`{ activo?, rolId? }`, permiso `usuario:gestionar`). Un admin no puede desactivarse ni quitarse el rol admin, y siempre debe quedar al menos un admin activo (`409 AUTO_BLOQUEO` / `409 ULTIMO_ADMIN`).
- `GET /api/permisos` (permiso `rol:gestionar`) alimenta las casillas de la pantalla de Roles. No se borra un rol con usuarios asignados.
- Limitación: la caché de sesiones y el rate limit son por proceso (una sola instancia del backend).

### Estados y transiciones

- El catálogo de estados y la máquina de transiciones viven en `src/libs/estados.js` (fuente de verdad). Cada `Estado` tiene un `codigo` fijo; el admin solo edita etiqueta (`nombre`), descripción y colores (`PUT /api/estados/:id`). Crear o borrar estados responde `405 ESTADOS_FIJOS`.
- Pedido: `pendiente → confirmado → en_preparacion → listo → en_camino → entregado`, más `cancelado`. Reserva: `pendiente → confirmada → sentada → completada`, más `cancelada` y `no_show`. Los estados finales no se reabren.
- Cada transición declara quién la hace y qué permiso exige: avanzar un pedido → `pedido:cambiar_estado`; cancelarlo (solo en `pendiente`/`confirmado`) → `pedido:cancelar` + motivo obligatorio; reservas → `reserva:cambiar_estado`. El cliente cancela su pedido solo en `pendiente` y su reserva en `pendiente`/`confirmada`; si edita una confirmada, vuelve a `pendiente`.
- `PATCH /api/pedidos/:id/estado` y `PATCH /api/reservas/:id/estado` reciben `{ codigo, motivo? }` (o `{ estado: <_id> }` por compatibilidad). Errores: `400 ESTADO_INVALIDO | MOTIVO_REQUERIDO`, `403 FORBIDDEN`, `409 TRANSICION_INVALIDA | ESTADO_FINAL | CONFLICTO_ESTADO`. Los listados de staff incluyen `estadoCodigo`, `esFinal` y `transiciones` (las que el usuario puede hacer).
- Cada cambio (y la creación) queda en la colección `eventos` (`de`, `a`, `motivo`, `usuario`, `actor`).
- El servidor siembra los estados al arrancar; si encuentra estados sin `codigo` (BD anterior a 0.7) no arranca y pide ejecutar la migración.

### Migraciones y respaldo

1. Respaldo (carpeta `backups/`, ignorada por git). Con MongoDB Database Tools: `mongodump --uri "$MONGO_URI" --out backups/<nombre>`. Sin ellas, con Docker:
   `docker run --rm -v "<ruta-del-repo>/backups:/backups" mongo:7 mongodump --uri "mongodb://host.docker.internal:27017/brunch-cafe" --out /backups/<nombre>`
2. Simulacro: `npm run migrate:0.7 -- --dry-run` (cuántos documentos cambiarían por colección y tabla de equivalencias estado viejo → código). Si algún estado no encaja, se lista y no se escribe nada.
3. Aplicar: `npm run migrate:0.7`. Revertir: `npm run migrate:0.7 -- --down` (también admite `--dry-run`); no revierte si un estado nuevo ya está en uso.

### Formato de errores

Todas las respuestas de error usan el mismo formato:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Correo invalido", "details": [{ "campo": "correo", "mensaje": "Correo invalido" }] } }
```

Códigos habituales: `BAD_REQUEST`, `VALIDATION_ERROR`, `INVALID_JSON`, `INVALID_ID`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `DUPLICATE`, `PAYLOAD_TOO_LARGE`, `TOO_MANY_REQUESTS`, `INTERNAL_ERROR`. Los errores 5xx nunca exponen el detalle interno (queda en el log). En código nuevo, lanza `AppError` (`src/libs/errors.js`) y deja que el manejador central responda.

## Endpoints

La autenticación conserva las cuentas existentes de `Usuario` y `Rol`; no crea una colección de usuarios paralela. El endpoint de perfil de sesión y todos los endpoints `/api/customer` requieren la cookie JWT y limitan las consultas al usuario autenticado.

| Método | Ruta | Acción |
|---|---|---|
| POST | `/api/auth/registro` | Crear cuenta de cliente |
| POST | `/api/auth/login` | Iniciar sesión |
| POST | `/api/auth/logout` | Cerrar sesión |
| GET | `/api/auth/me` | Consultar la sesión |
| GET, PATCH | `/api/customer/profile` | Consultar y editar el perfil |
| GET, POST | `/api/customer/orders` | Consultar historial propio y crear un pedido con artículos y entrega validados |
| GET | `/api/customer/orders/:id` | Consultar detalle de un pedido propio |
| GET, POST | `/api/customer/reservations` | Listar y crear reservas |
| PATCH | `/api/customer/orders/:id/cancel` | Cancelar un pedido propio mientras está pendiente |
| PATCH | `/api/customer/reservations/:id` | Editar una reserva propia y volverla a pendiente de aprobación |
| PATCH | `/api/customer/reservations/:id/cancel` | Cancelar una reserva propia futura |
| GET, POST | `/api/customer/reviews` | Consultar y publicar los comentarios propios |
| GET | `/api/reviews` | Listar comentarios públicos publicados desde el dashboard |
| GET | `/api/reviews/product-ratings` | Consultar promedios públicos de calificación por producto |
| GET | `/api/v1/catalogo` | Catálogo público (alias: `/api/productos/menu`) |

Los pedidos se guardan en `Pedido` y `DetallePedido`. El backend valida los productos contra el catálogo en MongoDB (existentes y disponibles) y calcula precios y total desde allí, sin confiar en importes del navegador; guarda también los datos de entrega para el historial. Las reservas se almacenan en `Reserva` y referencian un `Estado` del catálogo fijo, y se crean desde la página protegida `/reservas`. Nombre y correo se precargan desde la cuenta y pueden ajustarse como datos de contacto de esa reserva. Editar una reserva activa la devuelve a `Pendiente` para una nueva aprobación. Las reservas aceptan horas en punto de 8:00 a 12:00 entre semana y de 8:00 a 11:00 los fines de semana, además de requerir un motivo. Los comentarios se guardan en la colección `Review`: el dashboard es el único formulario para publicarlos, y la página pública de comentarios muestra las reseñas reales sin permitir publicaciones duplicadas. Pueden ser generales o asociarse a un producto; las calificaciones de producto se agregan en el endpoint público de promedios.
