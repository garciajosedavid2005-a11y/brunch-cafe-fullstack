# API del cliente

## Inicio local

1. Copia `.env.example` a `.env` y configura `MONGO_URI` y un `JWT_SECRET` aleatorio.
2. Ejecuta `npm install` si todavía no están instaladas las dependencias.
3. Define `ADMIN_EMAIL`, `ADMIN_PASSWORD` (≥ 10 caracteres) y `ADMIN_NOMBRE` en `.env` y ejecuta `npm run seed:base` para crear los roles base y el primer administrador.
4. (Opcional) `npm run seed:menu` para cargar el menú inicial.
5. Inicia MongoDB y ejecuta `npm run dev`.
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

- La primera ejecución de `npm test` descarga el binario de `mongod` (~100 MB) y lo deja en caché; no necesita un Mongo instalado.
- `src/app.js` construye la app de Express (lo usan los tests); `src/index.js` conecta a MongoDB y escucha.
- Logs con pino: legibles en desarrollo (`pino-pretty`), JSON en producción y silenciados en tests. Cookies, cabeceras de autorización y contraseñas nunca se registran. Nivel configurable con `LOG_LEVEL`.

### Datos base (`npm run seed:base`)

Idempotente: se puede ejecutar las veces que quieras.

- Asegura los roles de sistema `admin` y `cliente` (no pisa etiqueta ni descripción editadas). El servidor también los asegura al arrancar, así que el registro nunca crea roles durante una petición.
- Crea el primer administrador con `ADMIN_EMAIL`, `ADMIN_PASSWORD` y `ADMIN_NOMBRE` ("Nombre Apellido"). Si el correo ya existe, **no cambia su contraseña ni sus datos**: solo le asigna el rol `admin`. Sin esas variables, este paso se omite.
- Si en la BD hay roles creados a mano como `Admin` o `Administrador`, sus usuarios pasan al rol canónico `admin` (el rol viejo se conserva).

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

Los pedidos se guardan en `Pedido` y `DetallePedido`. El backend valida los IDs contra `frontend/src/data/menu.json` y calcula precios y total desde el catálogo, sin confiar en importes del navegador; guarda también los datos de entrega para el historial. Las reservas se almacenan en `Reserva` y referencian un `Estado` del catálogo fijo, y se crean desde la página protegida `/reservas`. Nombre y correo se precargan desde la cuenta y pueden ajustarse como datos de contacto de esa reserva. Editar una reserva activa la devuelve a `Pendiente` para una nueva aprobación. Las reservas aceptan horas en punto de 8:00 a 12:00 entre semana y de 8:00 a 11:00 los fines de semana, además de requerir un motivo. Los comentarios se guardan en la colección `Review`: el dashboard es el único formulario para publicarlos, y la página pública de comentarios muestra las reseñas reales sin permitir publicaciones duplicadas. Pueden ser generales o asociarse a un producto; las calificaciones de producto se agregan en el endpoint público de promedios.
