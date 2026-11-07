# API del cliente

## Inicio local

0. Usa **Node 22 LTS** (`.nvmrc` en la raíz y `"engines": ">=22.12 <23"` en backend y frontend). Con nvm-windows: `nvm install 22` y `nvm use 22`; con nvm (macOS/Linux): `nvm use` en la raíz. Con Node 24 en Windows, Vitest se cae a veces con el código `3221226505` (ver PROGRESO, 0.14). Tras traer cambios de otra rama, ejecuta `npm install` en `backend` y en `frontend` antes de `npm run dev`: si falta una dependencia (p. ej. `nodemailer`), nodemon se queda esperando, el puerto 4000 no responde y el login muestra «No se pudo conectar con el servidor».
1. Copia `.env.example` a `.env` y configura `MONGO_URI` y un `JWT_SECRET` aleatorio.
2. Ejecuta `npm install` si todavía no están instaladas las dependencias.
3. Define `ADMIN_EMAIL`, `ADMIN_PASSWORD` (≥ 10 caracteres) y `ADMIN_NOMBRE` en `.env` y ejecuta `npm run seed:base` para crear los roles base, el primer administrador y los métodos de pago.
4. `npm run seed:menu` para cargar el menú inicial (categorías, productos e imágenes de `seed-data/`).
5. Inicia MongoDB **en modo replica set** (ver «MongoDB en replica set») y ejecuta `npm run dev`. Sin replica set el servidor no arranca: pedidos, cambios de estado y usuarios usan transacciones.
6. En `frontend`, copia `.env.example` a `.env` y ejecuta `npm run dev`.

El backend escucha por defecto en `http://localhost:4000`; el cliente usa cookies con credenciales habilitadas. En producción, frontend y API deben servirse por HTTPS y `CLIENT_URL` debe apuntar al origen exacto del frontend.

## Al traer cambios

Cada vez que traigas cambios de otra rama (`git pull`, fusión de `developers`, etc.):

1. **Node 22**: `nvm use 22` (o `nvm use` en la raíz, que lee `.nvmrc`).
2. **Dependencias**: `npm install` en `backend` **y** en `frontend`. Si falta una (p. ej. `nodemailer`), nodemon se queda esperando, el puerto 4000 no responde y el login muestra «No se pudo conectar con el servidor».
3. **Migraciones pendientes, en este orden**, cada una primero con `--dry-run` (si ya está aplicada, el simulacro lo dice y no hay nada que hacer):

   | Orden | Comando | Qué hace |
   |---|---|---|
   | 1 | `npm run migrate:0.7 -- --dry-run` | Estados con `codigo` (el servidor no arranca sin ella) |
   | 2 | `npm run migrate:0.6 -- --dry-run` | Referencias por `ObjectId` |
   | 3 | `npm run migrate:0.10 -- --dry-run` | Instantes UTC (`Reserva.inicio`, `Pedido.entregaEn`) |
   | 4 | `npm run migrate:0.12 -- --dry-run` | Elimina las colecciones heredadas (usa `-- --respaldo <carpeta>`) |
   | 5 | `npm run migrate:0.15 -- --dry-run` | `reserva:ver` y `reserva:crear` para el mesero (solo si tiene los permisos antiguos) |
   | 6 | `npm run migrate:1.1 -- --dry-run` | Permisos de salón para mesero y anfitrión (solo si tienen los permisos anteriores a 1.1; requiere 0.15). Para revertir 1.1 y 0.15: primero `migrate:1.1 -- --down` |

   Antes de aplicar una que tenga cambios: respaldo con `mongodump` (ver «Migraciones y respaldo»). Luego el mismo comando sin `--dry-run`; para revertir, `-- --down` (también con `--dry-run`).
4. **Datos base**: `npm run seed:base` solo inserta lo que falte (roles, estados, horarios, métodos de pago); no cambia lo que el admin personalizó.
5. Arranca con `npm run dev` y comprueba `http://localhost:4000/api/health`; después, `npm test` si vas a hacer cambios.

## Panel Mesero y recuperación de contraseña

El rol nuevo `mesero` recibe `pedido:ver`, `pedido:cambiar_estado`, `reserva:ver` y `reserva:crear`. No recibe `reserva:cambiar_estado`; la confirmación y gestión de estados sigue dependiendo de ese permiso. El seed no sobrescribe permisos que un administrador ya haya personalizado. En una base existente, reinicia el backend para actualizar el catálogo y desde **Admin → Roles** asigna al rol Mesero los permisos que necesite. Para habilitar los módulos configurados por defecto, activa `pedido:ver`, `pedido:cambiar_estado`, `reserva:ver` y `reserva:crear`. Desde 1.1 el mesero recibe además los permisos de salón (`mesa:ver`, `mesa:operar`, `cuenta:abrir`, `cuenta:ver`, `comanda:tomar`, `comanda:enviar`, `cuenta:solicitar`) y el anfitrión `mesa:ver`, `mesa:operar`, `mesa:bloquear`, `mesa:unir`, `cuenta:abrir` y `cuenta:transferir`; en una BD existente los agrega `npm run migrate:1.1`. `item:anular`, `cuenta:cerrar_sin_cobro` y `salon:configurar` quedan solo para el admin.

El panel de Mesero inicia en Resumen y carga reservas y pedidos desde las rutas protegidas de `/api/v1/staff`. Perfil y cambio de contraseña usan las mismas rutas de cuenta ya disponibles.

Para habilitar el enlace de recuperación configura `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` y, opcionalmente, `SMTP_FROM` en `backend/.env`. La solicitud se hace en `POST /api/v1/auth/recuperar-contrasena`; el enlace de un solo uso vence a los 30 minutos y actualiza la contraseña en `POST /api/v1/auth/restablecer-contrasena`. La API responde siempre `202` con el mismo mensaje y sin esperar el envío: así ni la respuesta ni su tiempo revelan si existe una cuenta. El token se guarda con hash (SHA-256), es de un solo uso, vence a los 30 minutos y, al usarlo, sube `tokenVersion` (se cierran todas las sesiones). Límites: 5 solicitudes y 10 restablecimientos por hora por IP. Si el envío falla, el enlace se invalida y el error se registra sin el correo.

**Probar sin SMTP (solo desarrollo):** con `NODE_ENV=development` y sin `SMTP_HOST`/`SMTP_USER`/`SMTP_PASSWORD`, el enlace no se envía: aparece en el log del backend (`SMTP sin configurar: enlace de recuperación`) y sigue siendo válido 30 minutos. Pide el enlace en `/recuperar-contrasena` con un usuario de `npm run seed:dev`, copia el `enlace` del log y ábrelo. En `test` y `production` el enlace nunca se escribe en el log.

**Confirmación de reservas (0.16):** al crear una reserva con correo (cliente o personal), el backend envía el resumen por el mismo SMTP, después de guardarla y sin bloquear la respuesta; si el envío falla, la reserva queda guardada y el error va al log (sin la dirección). Sin correo no se envía nada. En desarrollo sin SMTP, el contenido aparece en el log (`SMTP sin configurar: confirmación de reserva`). El frontend ya no usa EmailJS.

## MongoDB Atlas en Windows

Si el backend muestra `querySrv ECONNREFUSED`, Node.js no puede consultar por DNS el registro SRV de una URI `mongodb+srv://`. El error ocurre antes de la autenticación; cambiar la contraseña o la lista de acceso de IP de Atlas no resuelve este error específico.

En `backend/.env`, configura `MONGO_URI` con la URI estándar `mongodb://` del clúster (la que enumera los nodos y sus puertos), obtenida desde Atlas o construida siguiendo sus instrucciones oficiales. Conserva las opciones de TLS, replica set y autenticación que proporciona Atlas, y reemplaza las credenciales de muestra. La URI estándar evita la consulta SRV y Node puede resolver los nombres de los nodos mediante el resolvedor de Windows. Como alternativa, corrige el DNS o firewall para que Node pueda consultar DNS por el puerto 53.

No publiques `.env` ni incluyas credenciales en mensajes o commits. Si una contraseña fue expuesta, rótala en Atlas y actualiza `MONGO_URI`.

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
| `npm run seed:salon` | Salón de ejemplo (Interior y Terraza, mesas de 2 y 4, marcadas como ejemplo); solo si no hay zonas (1.2) |
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

- `GET /api/v1/catalogo` (público): categorías y productos **disponibles**, precio entero en COP (el frontend lo formatea) e imagen siempre como URL (`/productos/menu/imagenes/...`), nunca base64.
- `Producto.disponible` (por defecto `true`): los agotados no salen en el catálogo y `POST /api/v1/cliente/pedidos` los rechaza con `409 PRODUCT_UNAVAILABLE` (indica cuáles). El admin los sigue viendo y los activa con un interruptor.
- Imágenes subidas desde el admin: máximo 2 MB (PNG, JPG, WEBP o GIF); se guardan en `MenuImage` y el producto guarda su URL. El cuerpo JSON admite hasta 3 MB (`413 PAYLOAD_TOO_LARGE`).
- Precio: entero ≥ 0 (`"12000"` se acepta; decimales y negativos no).
- `codigo` (número que usan carrito y pedidos) sale de un contador atómico (colección `counters`); nunca se repite ni se reutiliza.

### Seguridad de la sesión

- Sesión en cookie `token` **httpOnly**, `sameSite` configurable (`lax` por defecto) y `secure` automático en producción; dura lo mismo que el JWT. **Clientes y admin: 2 h** (`JWT_EXPIRES_IN`); **personal sin `*`** (mesero, anfitrión, cocina o un rol creado por el admin): **12 h** (`JWT_EXPIRES_IN_STAFF`), para el turno en tablet (F1-10). La duración se vuelve a comprobar en cada petición con el rol actual: si un mesero pasa a cliente o a admin, su sesión vale 2 h desde que se inició.
- Token ausente, inválido o vencido → `401` (`UNAUTHORIZED`, `INVALID_TOKEN` o `SESSION_EXPIRED`); la cookie inválida se borra.
- Login y registro responden con mensajes genéricos (no revelan si un correo está registrado).
- Rate limit en memoria (una sola instancia): login 5 intentos **fallidos** cada 15 min por IP + correo; registro 10 por hora por IP → `429 TOO_MANY_REQUESTS`. Detrás de un proxy configura `TRUST_PROXY`.
- `helmet` activo; CORS solo para los orígenes de `CLIENT_URL` (lista separada por comas).
- Correos normalizados (trim + minúsculas). Para revisar cuentas antiguas: `npm run report:correos` (solo reporta, no modifica).

### Roles y permisos (RBAC)

- El catálogo de permisos vive en `src/modulos/identidad/permisos.js` (fuente de verdad) y se refleja en la colección `permisos` al arrancar. Las claves marcadas como `reservado` son de fases futuras: aparecen en el catálogo pero aún no se pueden asignar.
- El JWT solo identifica al usuario. En cada petición `autenticar` relee usuario, rol y permisos desde la BD (caché en memoria de 30 s). Editar un rol o un usuario invalida su caché al instante; un usuario desactivado o borrado recibe `401` (`ACCOUNT_DISABLED` / `INVALID_TOKEN`) y no puede iniciar sesión (`403 ACCOUNT_DISABLED`).
- Protege rutas con `requirePermission('clave')` (con varias claves basta una). Sin sesión → `401`; sin permiso → `403 FORBIDDEN`.
- Roles sembrados: `admin` (`*`, no editable ni borrable), `cliente` (sin permisos de staff; sus rutas se protegen por propiedad) y los de staff `mesero`, `anfitrion`, `cocina`, `barista`, `cajero`, `repartidor` y `compras` con permisos mínimos (editables desde el dashboard, no borrables).
- `GET /api/v1/admin/usuarios` y `PATCH /api/v1/admin/usuarios/:id` (`{ activo?, rolId? }`, permiso `usuario:gestionar`). Un admin no puede desactivarse ni quitarse el rol admin, y siempre debe quedar al menos un admin activo (`409 AUTO_BLOQUEO` / `409 ULTIMO_ADMIN`).
- `GET /api/v1/admin/permisos` (permiso `rol:gestionar`) alimenta las casillas de la pantalla de Roles. No se borra un rol con usuarios asignados.
- Limitación: la caché de sesiones y el rate limit son por proceso (una sola instancia del backend).

### Estados y transiciones

- El catálogo de estados y la máquina de transiciones viven en `src/modulos/compartido/estados.js` (fuente de verdad). Cada `Estado` tiene un `codigo` fijo; el admin solo edita etiqueta (`nombre`), descripción y colores (`PUT /api/v1/admin/estados/:id`). Crear o borrar estados responde `405 ESTADOS_FIJOS`.
- Pedido: `pendiente → confirmado → en_preparacion → listo → en_camino → entregado`, más `cancelado`. Reserva: `pendiente → confirmada → sentada → completada`, más `cancelada` y `no_show`. Los estados finales no se reabren.
- Cada transición declara quién la hace y qué permiso exige: avanzar un pedido → `pedido:cambiar_estado`; cancelarlo (solo en `pendiente`/`confirmado`) → `pedido:cancelar` + motivo obligatorio; reservas → `reserva:cambiar_estado`. El cliente cancela su pedido solo en `pendiente` y su reserva en `pendiente`/`confirmada`; si edita una confirmada, vuelve a `pendiente`.
- `PATCH /api/v1/staff/pedidos/:id/estado` y `PATCH /api/v1/staff/reservas/:id/estado` reciben `{ codigo, motivo? }` (o `{ estado: <_id> }` por compatibilidad). Errores: `400 ESTADO_INVALIDO | MOTIVO_REQUERIDO`, `403 FORBIDDEN`, `409 TRANSICION_INVALIDA | ESTADO_FINAL | CONFLICTO_ESTADO`. Los listados de staff incluyen `estadoCodigo`, `esFinal` y `transiciones` (las que el usuario puede hacer).
- Cada cambio (y la creación) queda en la colección `eventos` (`de`, `a`, `motivo`, `usuario`, `actor`).
- El servidor siembra los estados al arrancar; si encuentra estados sin `codigo` (BD anterior a 0.7) no arranca y pide ejecutar la migración.

### Migraciones y respaldo

1. Respaldo (carpeta `backups/`, ignorada por git). Con MongoDB Database Tools: `mongodump --uri "$MONGO_URI" --out backups/<nombre>`. Sin ellas, con Docker:
   `docker run --rm -v "<ruta-del-repo>/backups:/backups" mongo:7 mongodump --uri "mongodb://host.docker.internal:27017/brunch-cafe" --out /backups/<nombre>`
2. Simulacro: `npm run migrate:0.7 -- --dry-run` (cuántos documentos cambiarían por colección y tabla de equivalencias estado viejo → código). Si algún estado no encaja, se lista y no se escribe nada.
3. Aplicar: `npm run migrate:0.7`. Revertir: `npm run migrate:0.7 -- --down` (también admite `--dry-run`); no revierte si un estado nuevo ya está en uso.
4. Las demás siguen el mismo patrón: `migrate:0.6` (referencias por ObjectId), `migrate:0.10` (instantes UTC) y `migrate:0.12` (elimina las colecciones heredadas `users`, `orders`, `reservations` y `reviews`; `-- --respaldo <carpeta>` guarda cada una en EJSON antes de eliminarla y `-- --down --respaldo <carpeta>` las restaura).

### Formato de errores

Todas las respuestas de error usan el mismo formato:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Correo invalido", "details": [{ "campo": "correo", "mensaje": "Correo invalido" }] } }
```

Códigos habituales: `BAD_REQUEST`, `VALIDATION_ERROR`, `INVALID_JSON`, `INVALID_ID`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `DUPLICATE`, `PAYLOAD_TOO_LARGE`, `TOO_MANY_REQUESTS`, `INTERNAL_ERROR`. Los errores 5xx nunca exponen el detalle interno (queda en el log). En código nuevo, lanza `AppError` (`src/modulos/compartido/errors.js`) y deja que el manejador central responda.

## Endpoints (`/api/v1`)

Desde 0.12 la API es solo `/api/v1`. Las rutas sin versión responden `404 NOT_FOUND` con el formato estándar, salvo `GET /api/health` y `GET /api/productos/menu/imagenes/:nombre` (las URL de las imágenes están guardadas en los productos). Los permisos se comprueban por clave (`requirePermission`), no por rol; «sesión» = cookie `token` válida.

### Públicos

| Método | Ruta | Acción |
|---|---|---|
| GET | `/api/health` | Estado del servidor |
| GET | `/api/v1/catalogo` | Categorías y productos disponibles (precio entero COP, imagen como URL) |
| GET | `/api/productos/menu/imagenes/:nombre` | Imagen de un producto |
| GET | `/api/v1/horarios` | Horarios de domicilio y reservas (solo lectura) |
| GET | `/api/v1/comentarios` | Reseñas visibles (con `verificada`) |
| GET | `/api/v1/comentarios/calificaciones` | Promedio y cantidad por producto |

### Autenticación (`/api/v1/auth`)

| Método | Ruta | Acción |
|---|---|---|
| POST | `/api/v1/auth/registro` | Crear cuenta de cliente (rate limit 10/h por IP) |
| POST | `/api/v1/auth/login` | Iniciar sesión (rate limit 5 fallos/15 min por IP + correo) |
| POST | `/api/v1/auth/logout` | Cerrar sesión. Personal (incluido el admin): sube `tokenVersion`, así el token deja de servir al instante y se cierran sus otras sesiones (1.1b). Cliente: solo borra la cookie |
| GET | `/api/v1/auth/me` | Usuario de la sesión, rol y permisos |

### Cliente (`/api/v1/cliente`, sesión; cada uno ve y edita solo lo suyo)

| Método | Ruta | Acción |
|---|---|---|
| GET, PATCH | `/api/v1/cliente/perfil` | Ver y editar el perfil (`nombre`, `apellido`, `correo`, `telefono` opcional) |
| PUT | `/api/v1/cliente/perfil/contrasena` | Cambiar la contraseña (`actual`, `nueva`); cierra las demás sesiones |
| GET, POST | `/api/v1/cliente/pedidos` | Historial y crear un pedido a domicilio (teléfono obligatorio, hora en punto de hoy con 1 h de anticipación, `Idempotency-Key` opcional) |
| GET | `/api/v1/cliente/pedidos/:id` | Detalle de un pedido propio |
| PATCH | `/api/v1/cliente/pedidos/:id/cancelar` | Cancelar un pedido propio en `pendiente` (`motivo` opcional) |
| GET | `/api/v1/cliente/metodos-pago` | Métodos de pago activos |
| GET, POST | `/api/v1/cliente/reservas` | Listar y crear reservas (teléfono obligatorio, hora en punto dentro del horario) |
| PATCH | `/api/v1/cliente/reservas/:id` | Editar una reserva pendiente o confirmada (vuelve a `pendiente`) |
| PATCH | `/api/v1/cliente/reservas/:id/cancelar` | Cancelar una reserva propia que no ha empezado |
| GET, POST | `/api/v1/cliente/comentarios` | Mis reseñas y publicar una (producto: pedido entregado que lo contenga; general: pedido entregado o reserva completada) |
| PATCH | `/api/v1/cliente/comentarios/:id` | Editar calificación y texto de una reseña propia |

### Staff (`/api/v1/staff`, sesión + permiso)

| Método | Ruta | Permiso | Acción |
|---|---|---|---|
| GET | `/api/v1/staff/pedidos` | `pedido:ver` | Listar, más recientes primero. Filtros opcionales: `estado=pendiente,confirmado` (códigos), `fecha=AAAA-MM-DD` (día de Bogotá), `limite=1..200`. Cabecera `X-Total-Count` con el total sin límite. Cada pedido trae las `transiciones` que el usuario puede hacer |
| GET | `/api/v1/staff/pedidos/:id` | `pedido:ver` | Detalle con líneas e `historial` (de, a, motivo, actor, usuario, fecha) |
| PATCH | `/api/v1/staff/pedidos/:id/estado` | el de la transición | `{ codigo, motivo? }`: avanzar (`pedido:cambiar_estado`) o cancelar (`pedido:cancelar` + motivo). Salto inválido o estado final → 409 |
| PATCH | `/api/v1/staff/pedidos/:id/cancelar` | `pedido:cancelar` | `{ motivo }` (3–300 caracteres). Solo desde `pendiente` o `confirmado`; deja el Evento en la misma transacción |
| GET | `/api/v1/staff/reservas` | `reserva:ver` | Listar reservas con sus transiciones |
| PATCH | `/api/v1/staff/reservas/:id/estado` | `reserva:cambiar_estado` | `{ codigo, motivo? }` (cancelar exige motivo) |

### Admin (`/api/v1/admin`, sesión + permiso)

| Método | Ruta | Permiso | Acción |
|---|---|---|---|
| GET | `/api/v1/admin/categorias` | — (público) | Listar categorías |
| POST, PUT, DELETE | `/api/v1/admin/categorias[/:id]` | `catalogo:gestionar` | Crear, editar y borrar (no se borra una categoría con productos) |
| GET, POST, PUT, DELETE | `/api/v1/admin/productos[/:id]` | `catalogo:gestionar` | Gestionar productos (imagen ≤ 2 MB, precio entero, `disponible`) |
| GET | `/api/v1/admin/estados?tipo=pedido\|reserva` | `estado:editar`, `pedido:ver` o `reserva:ver` | Catálogo de estados |
| PUT | `/api/v1/admin/estados/:id` | `estado:editar` | Editar etiqueta, descripción y colores (crear/borrar → 405) |
| GET, POST, PUT, DELETE | `/api/v1/admin/roles[/:id]` | `rol:gestionar` | Roles y sus permisos (los de sistema no se borran; `409 ROL_CON_USUARIOS`) |
| GET | `/api/v1/admin/permisos` | `rol:gestionar` | Catálogo de permisos |
| GET, POST, PUT, DELETE | `/api/v1/admin/metodos-pago[/:id]` | `metodo_pago:gestionar` | Métodos de pago |
| GET | `/api/v1/admin/usuarios` | `usuario:gestionar` | Listar usuarios |
| PATCH | `/api/v1/admin/usuarios/:id` | `usuario:gestionar` | `{ activo?, rolId? }` (`409 AUTO_BLOQUEO` / `ULTIMO_ADMIN`) |
| GET | `/api/v1/admin/comentarios` | `resena:moderar` | Todas las reseñas |
| PATCH | `/api/v1/admin/comentarios/:id/visibilidad` | `resena:moderar` | `{ visible }` |
| DELETE | `/api/v1/admin/comentarios/:id` | `resena:moderar` | Borrar una reseña |
| GET, PUT | `/api/v1/admin/horarios` | `horario:editar` | Ver y editar los horarios |
| GET, POST, PUT, DELETE | `/api/v1/admin/zonas[/:id]` | `salon:configurar` | Zonas del salón `{ nombre, orden, activa }` (nombre único sin mayúsculas ni tildes → `409 ZONA_DUPLICADA`; con mesas no se borra → `409 ZONA_CON_MESAS`; no se desactiva con mesas en uso → `409 ZONA_CON_MESAS_EN_USO`) |
| GET, POST, PUT, DELETE | `/api/v1/admin/mesas[/:id]` (`?zona=`) | `salon:configurar` | Mesas `{ numero, nombre?, zona, capacidad, combinable, activa }`; el estado no se asigna aquí. Número único → `409 MESA_NUMERO_DUPLICADO`; zona inexistente o inactiva → `400 ZONA_NO_VALIDA`; una mesa que no está libre no se borra, no se desactiva ni cambia de zona → `409 MESA_EN_USO` |

Los pedidos se guardan en `Pedido` y `DetallePedido` (nombre y precio del momento en cada línea). El backend valida los productos contra el catálogo (existentes y disponibles) y calcula precios y total desde allí, sin confiar en importes del navegador. Las reservas se guardan en `Reserva` con un `Estado` del catálogo fijo. Las reseñas se guardan en `Comentario` (una por usuario y producto; las anteriores a 0.12 cuentan como no verificadas).
