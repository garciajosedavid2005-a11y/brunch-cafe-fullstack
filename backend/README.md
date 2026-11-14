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
   | 6 | `npm run migrate:1.1 -- --dry-run` | Permisos de salón para mesero y anfitrión (el anfitrión se elimina en 1.5b; solo si tienen los permisos anteriores a 1.1; requiere 0.15). Para revertir 1.1 y 0.15: primero `migrate:1.1 -- --down` |
   | 7 | `npm run migrate:1.3 -- --dry-run` | Estación por defecto en las categorías existentes (Bebidas → Barra, el resto → Cocina); crea Cocina y Barra si faltan. Con el servidor detenido; se detiene sin escribir si Cocina o Barra están inactivas o su nombre lo usa otra estación |
   | 8 | `npm run migrate:1.5b -- --dry-run` | Elimina los roles `anfitrion` y `compras` (1.5b): sus usuarios pasan a mesero y a cliente, y el mesero recibe `reserva:cambiar_estado`, `mesa:bloquear`, `mesa:unir` y `cuenta:transferir`. Copia de los roles en `migracion_15b_roles` para `--down`. Reinicia el backend después |
   | 9 | `npm run migrate:2.1 -- --dry-run` | Permisos de cocina y barra (Fase 2): `kds:ver`, `item:preparar`, `pedido:preparar`, `producto:agotar` y `producto:reactivar` para cocina y barista; `item:servir` y `producto:agotar` para el mesero. Solo toca un rol que no tenga ninguna (BD anterior a 2.1); si tiene algunas, el admin ya decidió y no se toca; `--down` quita solo lo que agregó |
   | 10 | `npm run migrate:2.5b -- --dry-run` | Estaciones del KDS en los roles (2.5b): cocina → Cocina, barista → Barra. Solo toca los roles sin el campo `estaciones` (si el admin ya las decidió, aunque sea ninguna, no se tocan); requiere 1.3 y 2.1. `--down` quita solo lo que puso, si nadie lo cambió después. Las sesiones abiertas lo ven en ≤ 30 s |

   Antes de aplicar una que tenga cambios: respaldo con `mongodump` (ver «Migraciones y respaldo»). Luego el mismo comando sin `--dry-run`; para revertir, `-- --down` (también con `--dry-run`).
4. **Datos base**: `npm run seed:base` solo inserta lo que falte (roles, estados, horarios, métodos de pago, estaciones Cocina y Barra); no cambia lo que el admin personalizó.
5. Arranca con `npm run dev` y comprueba `http://localhost:4000/api/health`; después, `npm test` si vas a hacer cambios.

## Panel Mesero y recuperación de contraseña

El rol nuevo `mesero` recibe `pedido:ver`, `pedido:cambiar_estado`, `reserva:ver` y `reserva:crear`. No recibe `reserva:cambiar_estado`; la confirmación y gestión de estados sigue dependiendo de ese permiso. El seed no sobrescribe permisos que un administrador ya haya personalizado. En una base existente, reinicia el backend para actualizar el catálogo y desde **Admin → Roles** asigna al rol Mesero los permisos que necesite. Para habilitar los módulos configurados por defecto, activa `pedido:ver`, `pedido:cambiar_estado`, `reserva:ver` y `reserva:crear`. Desde 1.1 el mesero recibe además los permisos de salón (`mesa:ver`, `mesa:operar`, `cuenta:abrir`, `cuenta:ver`, `comanda:tomar`, `comanda:enviar`, `cuenta:solicitar`) ; en una BD existente los agrega `npm run migrate:1.1`. **Desde 1.5b no hay rol anfitrión:** el mesero recibe además sus tareas (`reserva:cambiar_estado`, `mesa:bloquear`, `mesa:unir`, `cuenta:transferir`; en una BD existente, `npm run migrate:1.5b`). `item:anular`, `cuenta:cerrar_sin_cobro` y `salon:configurar` quedan solo para el admin.

### Panel de sala (`/staff`, Fase 1)

Pensado para tablet (1024×768 en horizontal y 768×1024 en vertical, botones de 44 px o más), con su propio layout sin la barra ni el pie del sitio. Las pestañas dependen de los permisos del rol, nunca de su nombre:

- **Mesas** (`mesa:ver`; es la primera si está): plano por zonas con el estado de cada mesa en texto e icono. El panel de la mesa permite abrir la cuenta (comensales y mesero responsable), bloquear, marcar limpia, mover, unir, separar y transferir.
- **Toma de comanda** («Ver cuenta / Tomar comanda» desde una mesa con cuenta): menú por categorías, modificadores, nota, ronda en curso, «Enviar ronda» (con `Idempotency-Key` y versión de la cuenta), rondas enviadas, anular con motivo (`item:anular`), solicitar y cancelar la cuenta. Subtotal sin impuestos ni propina hasta la Fase 3.
- **Cuentas** (`cuenta:ver` o `pedido:ver`): vista de solo lectura «Cuentas abiertas» con el salón y los domicilios en curso (1.9).
- **Resumen**, **Reservas** y **Pedidos** (según `reserva:*` y `pedido:*`), y **Mi perfil** y **Seguridad**.
- **«Cambiar de usuario»** cierra la sesión en tablets compartidas (la del personal dura 12 h).
- **El administrador** entra desde «Panel de sala» en la cabecera del admin (F1-19) para anular ítems. Su inicio sigue siendo `/admin`. No queda como mesero responsable: al abrir una cuenta elige un mesero.

Desde la Fase 2 (2.4) el plano, las cuentas y la cuenta abierta se actualizan **en vivo** (SSE, `GET /api/v1/staff/eventos`) y el polling queda de respaldo, más espaciado mientras el canal está vivo; si se cae, la pantalla dice «Reconectando» y vuelve al intervalo normal. Sin el canal, el plano se refresca cada 10 s y la cuenta y «Cuentas abiertas» cada 15 s, siempre con la pestaña visible. También se refrescan al volver a la pestaña, al enfocar la ventana, al recuperar la conexión y con «Actualizar». Si otra persona cambió la cuenta mientras la editabas, la API responde `409 CUENTA_MODIFICADA` y la tablet recarga y avisa.

**Probar en local:** `npm run seed:dev` crea `admin.dev`, `mesero.dev`, `cliente.dev` y `cocina.dev` (para el KDS en `/kds`) (@brunchcafe.test), con la contraseña de `DEV_USUARIOS_PASSWORD`. Las zonas y mesas de ejemplo las crea `npm run seed:salon` (solo si no hay zonas) y se editan en Admin › Salón.

Para habilitar el enlace de recuperación configura `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` y, opcionalmente, `SMTP_FROM` en `backend/.env`. La solicitud se hace en `POST /api/v1/auth/recuperar-contrasena`; el enlace de un solo uso vence a los 30 minutos y actualiza la contraseña en `POST /api/v1/auth/restablecer-contrasena`. La API responde siempre `202` con el mismo mensaje y sin esperar el envío: así ni la respuesta ni su tiempo revelan si existe una cuenta. El token se guarda con hash (SHA-256), es de un solo uso, vence a los 30 minutos y, al usarlo, sube `tokenVersion` (se cierran todas las sesiones). Límites (2.8): 3 solicitudes por hora por IP + correo y 5 restablecimientos por hora por IP + enlace, con un tope de 30 por hora por IP en cada ruta (las tablets del local comparten IP: el error de una persona no bloquea a las demás). Si el envío falla, el enlace se invalida y el error se registra sin el correo.

**Probar sin SMTP (solo desarrollo):** con `NODE_ENV=development` y sin `SMTP_HOST`/`SMTP_USER`/`SMTP_PASSWORD`, el enlace no se envía: aparece en el log del backend (`SMTP sin configurar: enlace de recuperación`) y sigue siendo válido 30 minutos. Pide el enlace en `/recuperar-contrasena` con un usuario de `npm run seed:dev`, copia el `enlace` del log y ábrelo. En `test` y `production` el enlace nunca se escribe en el log.

**Confirmación de reservas (0.16):** al crear una reserva con correo (cliente o personal), el backend envía el resumen por el mismo SMTP, después de guardarla y sin bloquear la respuesta; si el envío falla, la reserva queda guardada y el error va al log (sin la dirección). Sin correo no se envía nada. En desarrollo sin SMTP, el contenido aparece en el log (`SMTP sin configurar: confirmación de reserva`). El frontend ya no usa EmailJS.

### Cocina y barra (`/kds`, Fase 2)

Pantalla de cocina y barra para tablet o TV (1024×768, 768×1024 y 1920×1080), con su propio layout. Cada persona entra con su cuenta (sin PIN ni dispositivo, F2-6) y la pantalla no se cierra por inactividad: solo con «Cambiar de usuario» o al vencer la sesión (12 h para el personal; el admin, que también entra, tiene 2 h).

- **Estaciones por rol (2.5b):** cada rol opera solo las estaciones que el admin le asigna en Admin › Roles (cocina → Cocina, barista → Barra). Con una sola, `/kds` entra directo; con varias (o el admin), botones para cambiar, recordados en el dispositivo.
- **Cola (2.3, 2.5):** rondas enviadas con los ítems de la estación (y los pedidos a domicilio con líneas de esa estación), de la más antigua a la más nueva, con el tiempo de espera en texto, icono y color según los umbrales de la estación («A tiempo», «Atención», «Retrasada»). Los ítems anulados se ven tachados con su motivo.
- **Marcar (2.2):** «Empezar» (en preparación), «Listo» y «Todo listo» por ronda (`item:preparar`); el domicilio por estación (`pedido:preparar`). «Deshacer» durante 10 s para quien lo marcó; después, solo el admin con motivo desde la cuenta en `/staff` (F2-7).
- **Sonido (F2-8):** en `/kds` suena al llegar una ronda, activado por defecto (con «Activar sonido» si el navegador lo bloquea); en `/staff` suena al aumentar los ítems listos del mesero, apagado por defecto.
- **Aviso al mesero (2.6):** en `/staff`, franja «Listo para servir» con las cuentas del propio mesero, insignia en la mesa y en la cuenta, y «Servir» (`item:servir`).
- **Agotados (2.7, F2-5):** pestaña «Agotados» en `/staff` y botón «Agotados» en `/kds`. Agotan cocina, barista, mesero y admin (`producto:agotar`); reactivan cocina, barista y admin (`producto:reactivar`). Cada cambio deja un Evento y llega al momento a la toma de comanda, el carrito y el menú.
- **Límite de errores (2.6b):** si una sección no puede dibujarse, muestra «Algo salió mal en esta sección» con «Recargar» y el resto de la pantalla sigue.

**Probar el ciclo completo:** `cocina.dev` (de `seed:dev`, rol Cocina) entra en `/kds`; el admin ve todas las estaciones. Abre `/staff` con `mesero.dev` en otra ventana, envía una ronda y márcala en `/kds`.

### Configurar el correo (SMTP)

Sin `SMTP_HOST`, `SMTP_USER` y `SMTP_PASSWORD` no sale ningún correo: en desarrollo, los enlaces («Crea tu contraseña», recuperación) quedan en el log del backend y Admin › Usuarios avisa «No hay servidor de correo configurado: el enlace quedó en el registro (log) del backend». Para enviarlos de verdad, agrega en `backend/.env` (nunca en el repositorio) uno de estos dos y **reinicia el backend**. Los valores de abajo son de ejemplo: usa los de tu cuenta.

**Mailtrap (recomendado para desarrollo: los correos no llegan a nadie, se ven en su bandeja de pruebas).** Crea una cuenta gratuita en mailtrap.io, abre *Email Testing › Inboxes › tu bandeja › SMTP Settings* y copia el usuario y la contraseña que muestra:

```env
SMTP_HOST=sandbox.smtp.mailtrap.io
SMTP_PORT=2525
SMTP_USER=usuario-que-muestra-mailtrap
SMTP_PASSWORD=contraseña-que-muestra-mailtrap
SMTP_FROM=Brunch Café <no-responder@example.com>
```

**Gmail con contraseña de aplicación (envía correos reales).** Gmail no acepta la contraseña normal de la cuenta: activa la verificación en dos pasos en la cuenta de Google y crea una *contraseña de aplicación* en *Cuenta de Google › Seguridad › Contraseñas de aplicaciones* (16 letras; se escribe sin espacios). Usa una cuenta del negocio, no una personal:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=cuenta-del-negocio@gmail.com
SMTP_PASSWORD=contraseña-de-aplicación-de-16-letras
SMTP_FROM=Brunch Café <cuenta-del-negocio@gmail.com>
```

Con el puerto 465 la conexión es TLS directa; con cualquier otro (por defecto 587, `config.js`) se pasa a STARTTLS si el servidor lo ofrece, como hacen Mailtrap y Gmail (lo decide `compartido/correo.js`, que aún no lo exige: ver Pendientes en PROGRESO). Fuera de desarrollo, sin SMTP el enlace ni se envía ni se registra: Admin › Usuarios lo avisa y la persona puede pedir uno nuevo con «¿Olvidaste tu contraseña?». Para comprobarlo, crea un usuario en Admin › Usuarios: el aviso debe decir «Enviamos a … el enlace» y el correo debe aparecer en la bandeja de Mailtrap o llegar al destinatario (Gmail). Si el envío falla, el error queda en el log sin la dirección de correo.

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
| `npm run seed:base` | Roles, primer admin, estados, métodos de pago, horarios y estaciones (ver abajo) |
| `npm run seed:menu` | Menú inicial desde `seed-data/` (ver abajo) |
| `npm run mongo:replica-set` | Inicia el replica set `rs0` de un nodo en el Mongo de `MONGO_URI` (idempotente; `-- --dry-run`) |
| `npm run seed:modificadores` | Grupos de modificadores de ejemplo (Leche, Tamaño, Término del huevo, Extras; marcados como ejemplo) y su asignación a los productos del menú inicial que aún no tienen grupos (1.3) |
| `npm run migrate:1.3` | Estación por defecto en las categorías existentes (ver «Al traer cambios») |
| `npm run verificar:salon` | Consistencia de cuentas, rondas y mesas, solo lectura (1.4; ver «Cuentas y comandas del salón») |
| `npm run seed:salon` | Salón de ejemplo (Interior y Terraza, mesas de 2 y 4, marcadas como ejemplo); solo si no hay zonas (1.2) |
| `npm run seed:dev` | Usuarios de prueba `*.dev@brunchcafe.test` (solo desarrollo; contraseña en `DEV_USUARIOS_PASSWORD`) |

- La primera ejecución de `npm test` descarga el binario de `mongod` (~100 MB) y lo deja en caché; no necesita un Mongo instalado.
- **Windows: ejecuta los tests (backend y frontend) desde una ruta con la unidad en mayúscula**, `C:\Users\…\brunch-cafe-fullstack`, no `c:\…`. Con la unidad en minúscula (la que abren a veces VS Code o Git Bash como `/c/…`), Vitest carga dos veces sus módulos y todos los archivos fallan con «Vitest failed to find the current suite» y 0 tests. En PowerShell: `Set-Location C:\Users\<usuario>\Documents\GitHub\brunch-cafe-fullstack\frontend; npm test`. No es el crash `3221226505` de Node 24 (ver «Inicio local»).
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
- Crea las estaciones Cocina y Barra si no existe una con ese código (1.3); no toca nombre ni «activa» editados. Sin ellas, una categoría nueva sin estación elegida responde `400 ESTACION_NO_VALIDA`.

### Menú inicial (`npm run seed:menu`)

Lee `seed-data/menu.json` (categorías con descripción y productos con `codigo`, precio entero en COP y nombre de archivo de imagen) y las imágenes de `seed-data/imagenes/`. No depende de la carpeta del frontend.

- Valida todo el archivo antes de escribir (precios enteros, categorías existentes, imágenes presentes, códigos únicos).
- Idempotente y conservador: crea las categorías, imágenes y productos que falten y **no modifica** los existentes (precio, descripción, disponibilidad o destacado editados en el admin se respetan).
- Las categorías nuevas nacen con su estación (Bebidas → Barra, el resto → Cocina); asegura antes Cocina y Barra.

### Catálogo

- `GET /api/v1/catalogo` (público): categorías y productos **disponibles**, precio entero en COP (el frontend lo formatea) e imagen siempre como URL (`/productos/menu/imagenes/...`), nunca base64.
- `Producto.disponible` (por defecto `true`): los agotados no salen en el catálogo y `POST /api/v1/cliente/pedidos` los rechaza con `409 PRODUCT_UNAVAILABLE` (indica cuáles). El admin los sigue viendo y los activa con un interruptor.
- Imágenes subidas desde el admin: máximo 2 MB (PNG, JPG, WEBP o GIF); se guardan en `MenuImage` y el producto guarda su URL. El cuerpo JSON admite hasta 3 MB (`413 PAYLOAD_TOO_LARGE`).
- Precio: entero ≥ 0 (`"12000"` se acepta; decimales y negativos no).
- `codigo` (número que usan carrito y pedidos) sale de un contador atómico (colección `counters`); nunca se repite ni se reutiliza.
- **Estaciones (1.3, F1-3):** cada categoría tiene una estación por defecto (obligatoria al crear; sin `estacionId`, Cocina) y cada producto puede sobrescribirla (`estacionId`, `null` = hereda). La estación efectiva sale de una sola función (`catalogo/estaciones.js`). Una estación en uso no se borra ni se desactiva (`409 ESTACION_EN_USO`); una inactiva no se asigna (`400 ESTACION_NO_VALIDA`).
- **Modificadores (1.3, F1-4):** grupos reutilizables `{ nombre, obligatorio, min, max, opciones: [{ id, nombre, precioExtra (entero COP ≥ 0), disponible }], activo }`. Reglas en el esquema: `min ≤ max`, `max ≤` número de opciones (todas, también las agotadas), obligatorio ⇔ `min ≥ 1`, opciones sin repetir. Al editar, una opción con `id` conserva su id y los campos que no se envían. El producto los referencia en orden (`gruposModificadoresIds`, hasta 10). Un grupo en uso no se borra (`409 GRUPO_EN_USO`) pero sí se desactiva (el producto deja de ofrecerlo). «Sin ingrediente» va como nota del ítem.
- `GET /api/v1/catalogo?incluir=modificadores` añade a cada producto `estacion: { codigo, nombre }` (efectiva) y `modificadores` (solo grupos activos, con todas sus opciones y `disponible`). Sin el parámetro la respuesta no cambia; otro valor → `400 VALIDATION_ERROR`.

### Seguridad de la sesión

- Sesión en cookie `token` **httpOnly**, `sameSite` configurable (`lax` por defecto) y `secure` automático en producción; dura lo mismo que el JWT. **Clientes y admin: 2 h** (`JWT_EXPIRES_IN`); **personal sin `*`** (mesero, cocina o un rol creado por el admin): **12 h** (`JWT_EXPIRES_IN_STAFF`), para el turno en tablet (F1-10). La duración se vuelve a comprobar en cada petición con el rol actual: si un mesero pasa a cliente o a admin, su sesión vale 2 h desde que se inició.
- Token ausente, inválido o vencido → `401` (`UNAUTHORIZED`, `INVALID_TOKEN` o `SESSION_EXPIRED`); la cookie inválida se borra.
- Login y registro responden con mensajes genéricos (no revelan si un correo está registrado).
- Rate limit en memoria (una sola instancia): login 5 intentos **fallidos** cada 15 min por IP + correo; registro 30 por hora por IP; recuperación 3 por hora por IP + correo y restablecimiento 5 por hora por IP + enlace, ambos con tope de 30 por hora por IP → `429 TOO_MANY_REQUESTS`. Las tablets del local salen por la misma IP: por eso lo que lleva correo o enlace cuenta por persona (2.8). Detrás de un proxy configura `TRUST_PROXY`.
- **`TRUST_PROXY` en producción:** el número exacto de proxies (saltos) entre Internet y la API, para que Express tome la IP real del cliente de `X-Forwarded-For` (`app.set('trust proxy', n)`). Ejemplos: la API detrás de un solo Nginx o del balanceador de Render/Railway → `TRUST_PROXY=1`; Cloudflare delante de Nginx → `TRUST_PROXY=2`; la API expuesta directamente (desarrollo) → `0` o sin la variable (valor por defecto). Con un número menor, todos los clientes comparten la IP del proxy y agotan juntos los límites; con uno mayor (o con `true`, que no se admite), cualquiera puede falsificar su IP con la cabecera `X-Forwarded-For` y saltarse los límites.
- `helmet` activo; CORS solo para los orígenes de `CLIENT_URL` (lista separada por comas).
- Correos normalizados (trim + minúsculas). Para revisar cuentas antiguas: `npm run report:correos` (solo reporta, no modifica).

### Roles y permisos (RBAC)

- El catálogo de permisos vive en `src/modulos/identidad/permisos.js` (fuente de verdad) y se refleja en la colección `permisos` al arrancar. Las claves marcadas como `reservado` son de fases futuras: aparecen en el catálogo pero aún no se pueden asignar.
- El JWT solo identifica al usuario. En cada petición `autenticar` relee usuario, rol y permisos desde la BD (caché en memoria de 30 s). Editar un rol o un usuario invalida su caché al instante; un usuario desactivado o borrado recibe `401` (`ACCOUNT_DISABLED` / `INVALID_TOKEN`) y no puede iniciar sesión (`403 ACCOUNT_DISABLED`).
- Protege rutas con `requirePermission('clave')` (con varias claves basta una). Sin sesión → `401`; sin permiso → `403 FORBIDDEN`.
- Roles sembrados: `admin` (`*`, no editable ni borrable), `cliente` (sin permisos de staff; sus rutas se protegen por propiedad) y los de staff `mesero`, `cocina`, `barista`, `cajero` y `repartidor` con permisos mínimos (1.5b: se eliminaron `anfitrion` y `compras`) (editables desde el dashboard, no borrables).
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

### Cuentas y comandas del salón (1.4)

- Núcleo en `src/modulos/salon/cuentas.service.js` (los endpoints llegan en 1.5). Máquinas de mesa, cuenta e ítem en `src/modulos/compartido/estadosSalon.js` (estados como enums en cada documento, sin colección `Estado`).
- Una mesa solo está en una cuenta abierta (`Mesa.cuentaActual` + índice único parcial en `cuentas`); el ítem guarda la copia de nombre, precio, modificadores y estación del momento en que se agregó; los montos (COP enteros) se recalculan siempre desde los ítems. Cada cambio queda en `eventos` (entidades `mesa` y `cuenta`).
- `npm run verificar:salon` (solo lectura) revisa las cuentas abiertas y las cerradas en las últimas 48 h (`-- --horas N` para otro rango): montos que no cuadran, mesas y cuentas que no se apuntan entre sí y rondas incoherentes. Sale con código 1 si encuentra algo.

### Migraciones y respaldo

1. Respaldo (carpeta `backups/`, ignorada por git). Con MongoDB Database Tools: `mongodump --uri "$MONGO_URI" --out backups/<nombre>`. Sin ellas, con Docker:
   `docker run --rm -v "<ruta-del-repo>/backups:/backups" mongo:7 mongodump --uri "mongodb://host.docker.internal:27017/brunch-cafe" --out /backups/<nombre>`
2. Simulacro: `npm run migrate:0.7 -- --dry-run` (cuántos documentos cambiarían por colección y tabla de equivalencias estado viejo → código). Si algún estado no encaja, se lista y no se escribe nada.
3. Aplicar: `npm run migrate:0.7`. Revertir: `npm run migrate:0.7 -- --down` (también admite `--dry-run`); no revierte si un estado nuevo ya está en uso.
4. Las demás siguen el mismo patrón: `migrate:0.6` (referencias por ObjectId), `migrate:0.10` (instantes UTC) y `migrate:0.12` (elimina las colecciones heredadas `users`, `orders`, `reservations` y `reviews`; `-- --respaldo <carpeta>` guarda cada una en EJSON antes de eliminarla y `-- --down --respaldo <carpeta>` las restaura).
5. **Eventos inmutables (1.15):** el modelo `Evento` rechaza actualizar, reemplazar o borrar (consultas, documentos y `bulkWrite`). Una migración que de verdad deba tocar eventos lo hace de forma explícita: con el modelo, pasando `{ modificarEventos: '<motivo>' }` (p. ej. `Evento.deleteMany(filtro).setOptions({ modificarEventos: 'migración X --down' })`), o con el driver directo (`db.collection('eventos')`) y un comentario que explique por qué, como el `--down` de 0.7. La opción vale para consultas del modelo y `bulkWrite`, no para operaciones de documento (`save` de uno existente, `doc.deleteOne()`, `doc.updateOne()`, `bulkSave`), que se rechazan siempre. Las agregaciones con `$out` o `$merge` hacia `eventos` cuentan como acceso directo.

### Capturas de pantalla (`npm run capturas` en `frontend/`, 1.3b)

Las capturas para revisar cambios visuales usan un **entorno aislado**: nunca la BD de trabajo ni datos personales.

- `npm run capturas -- <etiqueta>` (en `frontend/`) arranca su propia API (`backend/scripts/entorno-capturas.js`, puerto `CAPTURAS_API_PORT`, 4100) y su propio Vite (`CAPTURAS_FRONT_PORT`, 5174), toma las capturas en `frontend/capturas/<etiqueta>/` y los detiene al terminar. El servidor de desarrollo (4000/5173) puede seguir encendido.
- La API usa la BD **`brunch-cafe-capturas`**: el mismo `MONGO_URI` del `.env` con otro nombre de base. En cada ejecución la vacía (se niega con cualquier otra base) y la siembra: `seed:base` **sin el admin real** (`ADMIN_*` se ignoran), `seed:menu`, `seed:modificadores`, `seed:salon` y los usuarios `*.dev@brunchcafe.test`, con un pedido, una reserva y (1.6) un salón en servicio creado con el propio servicio: cuentas abiertas, una pedida, una mesa bloqueada y otra por limpiar. Sin SMTP: no se envía ningún correo.
- La contraseña de los usuarios de prueba es `DEV_USUARIOS_PASSWORD` (≥ 10 caracteres), del entorno o de `backend/.env`; no se muestra. Sin ella solo se pueden capturar las vistas públicas (`SOLO=inicio,menu,…`).
- Opciones: `ANCHOS=1280,1024,768` (ancho con alto 900 y página completa) o `ANCHOS=1024x768,768x1024` (pantalla de tablet: solo lo visible), `SOLO=<vistas separadas por coma>` (ver `VISTAS` en `frontend/scripts/capturas.mjs`), `ZONA_NAVEGADOR`, `MEDIR_TACTIL=1` (1.5c: mide con Playwright los botones visibles de cada vista y, desde 1.6b, también los campos —input, select y textarea, sin casillas ni radios—, y deja en `medicion-tactil.json` los de menos de 44 px de alto), `MEDIR_SOLAPES=1` (1.6b: en las tablas del admin con acciones fijas lista las columnas que quedan debajo de las columnas fijas sin desplazar, y si la de estado queda bajo «Acciones», en `medicion-solapes.json`).
- (2.6b) Una vista **falla** (y el script sale con código 1, con un resumen al final) si la pantalla queda en blanco o si el navegador registra un error de página (excepción sin capturar) o un `console.error` (incluidos el límite de errores y los avisos de React). No cuentan los «Failed to load resource» (respuestas HTTP de error que algunas vistas provocan a propósito). Las vistas que provocan un fallo a propósito (p. ej. `staff-limite-errores`) declaran los errores que esperan en `erroresEsperados`, una lista cerrada; un error de página nunca se exime.
- Hora fija: la API de capturas y el navegador ven **hoy a las 6:00 a. m. de Bogotá**, con el reloj en marcha desde ahí (`CAPTURAS_HORA=HH:MM` para otra). Así ninguna vista depende de la hora real (antes `carrito-problema` fallaba después de las 4:00 p. m.).
- `frontend/capturas/` no se versiona.

### Prueba de humo del frontend en marcha (`npm run humo` en `frontend/`, 2.6b)

Revisa lo que ve el personal en el frontend **que está corriendo** (no el código del disco): `mesero.dev` abre la cuenta de una mesa ocupada y un ítem pasa a «listo» con la cuenta abierta, `cocina.dev` abre `/kds` y `admin.dev` el admin. Sale con código 1 si alguna pantalla queda en blanco o registra errores de página o de consola.

- Requiere el frontend y la API en marcha (`HUMO_FRONT`, por defecto `http://localhost:5173`; `HUMO_API`, por defecto `http://localhost:4000/api/v1`), los usuarios de `npm run seed:dev` y `DEV_USUARIOS_PASSWORD` (del entorno o de `backend/.env`; no se muestra).
- Usa la BD de trabajo **solo en lectura**: el ítem «listo» se simula cambiando la respuesta de la cuenta en el navegador.
- Útil tras cambios de frontend con un Vite de desarrollo abierto hace tiempo: detecta si sirve una versión que no es la del disco (lo que pasó en 2.6).

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
| GET | `/api/v1/catalogo` (`?incluir=modificadores`) | Categorías y productos disponibles (precio entero COP, imagen como URL); con el parámetro, estación y modificadores |
| GET | `/api/productos/menu/imagenes/:nombre` | Imagen de un producto |
| GET | `/api/v1/horarios` | Horarios de domicilio y reservas (solo lectura) |
| GET | `/api/v1/comentarios` | Reseñas visibles (con `verificada`) |
| GET | `/api/v1/comentarios/calificaciones` | Promedio y cantidad por producto |

### Autenticación (`/api/v1/auth`)

| Método | Ruta | Acción |
|---|---|---|
| POST | `/api/v1/auth/registro` | Crear cuenta de cliente (rate limit 30/h por IP) |
| POST | `/api/v1/auth/login` | Iniciar sesión (rate limit 5 fallos/15 min por IP + correo) |
| POST | `/api/v1/auth/recuperar-contrasena` | Pedir el enlace de recuperación (siempre `202`; rate limit 3/h por IP + correo y 30/h por IP) |
| POST | `/api/v1/auth/restablecer-contrasena` | Cambiar la contraseña con el enlace (rate limit 5/h por IP + enlace y 30/h por IP) |
| POST | `/api/v1/auth/logout` | Cerrar sesión. Personal (incluido el admin): sube `tokenVersion`, así el token deja de servir al instante y se cierran sus otras sesiones (1.1b). Cliente: solo borra la cookie |
| GET | `/api/v1/auth/me` | Usuario de la sesión, rol y permisos |

### Cliente (`/api/v1/cliente`, sesión; cada uno ve y edita solo lo suyo)

| Método | Ruta | Acción |
|---|---|---|
| GET, PATCH | `/api/v1/cliente/perfil` | Ver y editar el perfil (`nombre`, `apellido`, `correo`, `telefono` opcional) |
| PUT | `/api/v1/cliente/perfil/contrasena` | Cambiar la contraseña (`actual`, `nueva`); cierra las demás sesiones |
| GET, POST | `/api/v1/cliente/pedidos` | Historial y crear un pedido a domicilio (teléfono obligatorio, hora en punto de hoy con 1 h de anticipación, dirección con la validación flexible de 1.11, `Idempotency-Key` opcional). 1.12: cada ítem admite `modificadores: [{ grupoId, opcionIds }]` y `nota` (≤ 140), validados con el mismo validador que las cuentas del salón: `400 MODIFICADOR_REQUERIDO`, `MODIFICADORES_FUERA_DE_RANGO`, `GRUPO_NO_VALIDO`, `OPCION_NO_VALIDA` y `409 OPCION_NO_DISPONIBLE`, con `details.linea` (índice del ítem) y `details.producto`. Precio y total los calcula el servidor (base + recargos). En las respuestas, cada ítem trae además `options: [{ group, option, extraPrice }]` y `note`, y `unitPrice` incluye los recargos (las líneas anteriores: `[]`, `''` y el precio base). 1.14, errores con el formato de las cuentas: `400 VALIDATION_ERROR` con `details: [{ campo, mensaje }]` (p. ej. `items.1.nota`), `400 HORA_NO_DISPONIBLE`, `404 PRODUCTO_NO_ENCONTRADO`, `409 PRODUCT_UNAVAILABLE` (`details.productos`) y `400 METODO_PAGO_NO_DISPONIBLE`; los errores de una línea traen `details.lineas` (índices de `items`) |
| GET | `/api/v1/cliente/pedidos/:id` | Detalle de un pedido propio |
| PATCH | `/api/v1/cliente/pedidos/:id/cancelar` | Cancelar un pedido propio en `pendiente` (`motivo` opcional) |
| GET | `/api/v1/cliente/metodos-pago` | Métodos de pago activos |
| GET, POST | `/api/v1/cliente/reservas` | Listar y crear reservas (teléfono obligatorio, hora en punto dentro del horario) |
| PATCH | `/api/v1/cliente/reservas/:id` | Editar una reserva pendiente o confirmada (vuelve a `pendiente`) |
| PATCH | `/api/v1/cliente/reservas/:id/cancelar` | Cancelar una reserva propia que no ha empezado |
| GET, POST | `/api/v1/cliente/comentarios` | Mis reseñas y publicar una (producto: pedido entregado que lo contenga; general: pedido entregado o reserva completada). 1.15: validación `400 VALIDATION_ERROR` con `[{ campo, mensaje }]` y mensajes en español; producto inexistente `404 PRODUCTO_NO_ENCONTRADO` |
| PATCH | `/api/v1/cliente/comentarios/:id` | Editar calificación y texto de una reseña propia (`400 VALIDATION_ERROR`; `404 NOT_FOUND` si no existe o no es tuya) |

### Staff (`/api/v1/staff`, sesión + permiso)

| Método | Ruta | Permiso | Acción |
|---|---|---|---|
| GET | `/api/v1/staff/pedidos` | `pedido:ver` | Listar, más recientes primero. Filtros opcionales: `estado=pendiente,confirmado` (códigos), `fecha=AAAA-MM-DD` (día de Bogotá), `limite=1..200`. Cabecera `X-Total-Count` con el total sin límite. Cada pedido trae las `transiciones` que el usuario puede hacer |
| GET | `/api/v1/staff/pedidos/:id` | `pedido:ver` | Detalle con líneas e `historial` (de, a, motivo, actor, usuario, fecha). 1.12: cada línea trae `precio` (unitario con recargos), `precioBase`, `subtotal`, `modificadores: [{ grupo, opcion, precioExtra }]` y `nota`; también en el listado |
| PATCH | `/api/v1/staff/pedidos/:id/estado` | el de la transición | `{ codigo, motivo? }`: avanzar (`pedido:cambiar_estado`) o cancelar (`pedido:cancelar` + motivo). Salto inválido o estado final → 409 |
| PATCH | `/api/v1/staff/pedidos/:id/cancelar` | `pedido:cancelar` | `{ motivo }` (3–300 caracteres). Solo desde `pendiente` o `confirmado`; deja el Evento en la misma transacción |
| GET | `/api/v1/staff/reservas` | `reserva:ver` | Listar reservas con sus transiciones |
| PATCH | `/api/v1/staff/reservas/:id/estado` | `reserva:cambiar_estado` | `{ codigo, motivo? }` (cancelar exige motivo) |
| POST | `/api/v1/staff/items/:itemId/estado` | `item:preparar` o `item:servir` | 2.2: `{ a, de, motivo? }` con `a` = `en_preparacion` o `listo` (`item:preparar`) o `servido` (`item:servir`; el permiso del destino se exige antes de mirar el ítem). `de` (obligatorio) = estado que vio la pantalla: si otro ya lo movió, `409 ITEM_MODIFICADO`. `motivo` solo al deshacer (si no, `400 MOTIVO_NO_APLICA`). `Idempotency-Key` opcional. Sin saltos (`enviado → listo` es `409 TRANSICION_INVALIDA`: para eso está «Todo listo»). «Deshacer» de listo (`a: en_preparacion` desde listo): quien lo marcó en 10 s; después solo el admin con `motivo` (si no, `403 DESHACER_NO_PERMITIDO` o `400 MOTIVO_REQUERIDO`). Guarda `iniciadoEn/Por`, `listoEn/Por` o `servidoEn/Por` en el ítem, sube `versionCocina` de la cuenta (no `version`: el mesero no recibe 409 por esto; 409 si la cuenta está cerrada) y deja el Evento `item_estado_cambiado`. Responde `{ item, cuenta: { id, versionCocina } }`. Al preparar, `403 ESTACION_NO_ASIGNADA` si la estación del ítem no es del rol (2.5b); servir no depende de la estación |
| POST | `/api/v1/staff/cocina/rondas/:comandaId/todo-listo` | `item:preparar` | 2.2 (F2-1): `{ estacion }`: pasa a listo los ítems pendientes de esa estación en la ronda enviada, pasando por `en_preparacion` en la misma transacción (dos tiempos y dos Eventos); `409 NADA_PENDIENTE` si no queda ninguno; ronda sin enviar, `404 RONDA_NO_ENCONTRADA`. `Idempotency-Key` opcional. Responde `{ items, cuenta }`. `403 ESTACION_NO_ASIGNADA` si la estación no es del rol (2.5b; el admin opera todas) |
| GET | `/api/v1/staff/cocina/estaciones` | `kds:ver` | 2.5: estaciones activas asignadas al rol (todas con `*`), con sus umbrales, ordenadas por nombre (máximo 50). Para el filtro de `/kds`; el listado del admin exige `salon:configurar` |
| GET | `/api/v1/staff/cocina/cola?estacion=cocina` | `kds:ver` | 2.3: `{ estacion: { codigo, nombre, umbralAvisoMin, umbralAlertaMin }, actualizadoEn, truncado, salon[], domicilio[] }`. Salón: rondas enviadas de cuentas abiertas o pedidas con ítems de la estación pendientes (o terminados hace menos de 10 s, para el «Deshacer»), de la más antigua a la más nueva, con mesas, mesero, ítems (opciones, nota, estado, tiempos y anulación con motivo). Domicilio (F2-3): pedidos confirmados o en preparación con líneas de esa estación que aún no terminó (código, hora de entrega, líneas; sin datos de contacto). Máximo 200 por tipo. `404 ESTACION_NO_ENCONTRADA`. `403 ESTACION_NO_ASIGNADA` si la estación no es del rol (2.5b; el admin opera todas) |
| POST | `/api/v1/staff/cocina/pedidos/:pedidoId/estacion` | `pedido:preparar` | 2.3 (F2-3): `{ estacion, a }` con `a` = `en_preparacion` (la estación empieza; el pedido confirmado pasa a en preparación) o `listo` (la estación terminó su parte; cuando terminaron todas las estaciones con líneas, el pedido pasa a listo). Eventos `cambio_estado` y `estacion_lista`. `409 PEDIDO_NO_PREPARABLE`, `ESTACION_SIN_LINEAS`, `ESTACION_YA_LISTA` o `PEDIDO_MODIFICADO`. La cocina no pasa el pedido a en camino ni entregado. `Idempotency-Key` opcional. `403 ESTACION_NO_ASIGNADA` si la estación no es del rol (2.5b; el admin opera todas) |
| GET | `/api/v1/staff/agotados` | `producto:agotar` o `producto:reactivar` | 2.7 (F2-5): `{ productos[], grupos[] }`. Productos (también los agotados) con `id`, `nombre`, `categoria`, `estacion`, `disponible` y los ids de sus grupos; grupos activos usados por algún producto, con sus opciones (`id`, `nombre`, `disponible`). Sin tope: es la carta |
| POST | `/api/v1/staff/agotados/productos/:id` | `producto:agotar` (agotar) o `producto:reactivar` (reactivar) | 2.7 (F2-5): cuerpo estricto `{ disponible }`. Escritura condicional sobre el estado contrario, en una transacción con su Evento (`producto_agotado` o `producto_reactivado`, con quién) y, ya confirmada, aviso en el canal `catalogo`. Responde `{ id, disponible, cambiado }`; repetir (dos tablets a la vez) da `cambiado: false` sin Evento ni aviso, por eso no usa `Idempotency-Key`. El permiso se comprueba antes de leer nada (`403` aunque el id no exista). `404 PRODUCTO_NO_ENCONTRADO` |
| POST | `/api/v1/staff/agotados/grupos/:grupoId/opciones/:opcionId` | `producto:agotar` (agotar) o `producto:reactivar` (reactivar) | 2.7 (F2-5): igual que el anterior para una opción de un grupo de modificadores (Evento `opcion_agotada` u `opcion_reactivada` sobre el grupo, con la opción en `datos`). Sube la versión del grupo: una edición del admin abierta desde antes no la pisa (`409`). `404 OPCION_NO_ENCONTRADA` |
| GET | `/api/v1/staff/eventos?canales=plano,cuenta:<id>` | según el canal | 2.4: Server-Sent Events. Canales: `plano` (`mesa:ver`), `estacion:<codigo>` (`kds:ver` y estación asignada al rol; el admin, todas), `cuenta:<id>` (`cuenta:ver`), `mesero:<id>` (solo el propio usuario, con `cuenta:ver` o `item:servir`) y `catalogo` (2.7: `comanda:tomar`, `kds:ver`, `producto:agotar` o `producto:reactivar`; aviso `disponibilidad` al agotar o reactivar un producto o una opción); hasta 10 por conexión y 5 conexiones por usuario (`429 DEMASIADAS_CONEXIONES`). Abre con `event: conectado`; cada aviso llega como mensaje sin nombre `{ canal, tipo, ids }` (`item_estado`, `ronda_lista`, `salon_cambio`, `pedido_estado`, `pedido_estacion`, `disponibilidad`), nunca con datos: el cliente vuelve a leer con su permiso. Latido cada 25 s; si la sesión deja de valer (cerrada, contraseña cambiada, usuario desactivado o vencida) o ya no tiene permiso de algún canal envía `event: sesion_cerrada` y cierra. `400 CANALES_NO_VALIDOS`, `403` con el canal que falla |
| GET | `/api/v1/staff/cuentas-abiertas` | `cuenta:ver` o `pedido:ver` | 1.9 (F1-11), solo lectura: `{ actualizadoEn, canales: { salon, domicilio }, truncado, cuentas[] }`. Cuentas de salón abiertas o pedidas (con `cuenta:ver`) y domicilios sin terminar (con `pedido:ver`), de la más antigua a la más nueva; cada fila con `canal`, `codigo`, `estado { codigo, nombre }`, `referencia` (mesas o barrio), `responsable` o `cliente`, `total`, `pendiente`, `desde` y `minutos`, sin datos de contacto. Máximo 200 por canal (las más nuevas, con `truncado: true`) |

#### Salón (`/api/v1/staff/salon`, 1.5)

Cualquiera con el permiso opera cualquier cuenta (F1-17); `mesero` es el responsable y cada Evento dice quién hizo la acción. Los cuerpos son estrictos (un campo no declarado → 400). `versionEsperada` (la `version` de la cuenta) es obligatoria al enviar, solicitar, cancelar y cerrar, y opcional en el resto; si no coincide → `409 CUENTA_MODIFICADA` (recargar). `Idempotency-Key` (opcional) en abrir, agregar ítem y enviar ronda; una clave que quedó «en curso» porque el proceso cayó se puede reintentar a los 5 minutos.

| Método | Ruta | Permiso | Acción |
|---|---|---|---|
| GET | `/api/v1/staff/salon/mesas?zona=` | `mesa:ver` | Plano: zonas activas y mesas activas (más las que tengan cuenta) con estado y, si hay cuenta, `codigo`, `estado`, `comensales`, `mesero { id, nombre }`, `abiertaEn`, `minutosOcupada`, `total`, `pendiente`, `mesas` unidas y `version`. `actualizadoEn` con la hora del servidor. Una mesa `bloqueada` sale en el plano; una inactiva (`activa: false`, configuración) no |
| GET | `/api/v1/staff/salon/catalogo` | `comanda:tomar` | Productos (también los agotados, `disponible: false`) con precio, categoría, estación y grupos de modificadores activos |
| GET | `/api/v1/staff/salon/meseros` | `cuenta:transferir` o `cuenta:abrir` | Usuarios activos cuyo rol tiene `comanda:tomar` (sin administradores ni clientes), por nombre: `{ id, nombre, yo }`; `yo` marca al usuario conectado, que sale aunque la lista llegue al límite de 200 (1.7b) |
| GET | `/api/v1/staff/salon/cuentas/:id` | `cuenta:ver` | Cuenta con rondas, ítems, totales, `mesero` e `historial` (tipo, de, a, motivo, por, en) |
| POST | `/api/v1/staff/salon/mesas/:id/abrir` | `cuenta:abrir` | `{ comensales, notas?, meseroId? }` → 201. Otro mesero distinto de quien abre exige `cuenta:transferir`; quien no atiende mesas (rol sin `comanda:tomar`, también el admin con `*`) debe indicarlo (`400 MESERO_REQUERIDO`); un responsable que no atiende mesas (admin, cliente, inactivo) → `400 MESERO_NO_VALIDO` (1.7b). Mesa no libre → `409 MESA_NO_DISPONIBLE` |
| POST | `/api/v1/staff/salon/cuentas/:id/items` | `comanda:tomar` | `{ productoId, cantidad, nota?, modificadores?, versionEsperada? }` → 201 `{ cuenta, item }`. Agotado → `409 PRODUCT_UNAVAILABLE` |
| PATCH | `/api/v1/staff/salon/cuentas/:id/items/:itemId` | `comanda:tomar` | `{ cantidad?, nota? }` (solo en borrador) |
| DELETE | `/api/v1/staff/salon/cuentas/:id/items/:itemId` | `comanda:tomar` | Quita un ítem del borrador (uno enviado → `409 ITEM_NO_EDITABLE`) |
| POST | `/api/v1/staff/salon/cuentas/:id/items/:itemId/anular` | `item:anular` | `{ motivo: error_toma \| cliente_cambio \| producto_defectuoso \| demora \| otro, detalle? }`. Si era el último ítem de una cuenta pedida, vuelve a abierta (F1-18) |
| POST | `/api/v1/staff/salon/cuentas/:id/rondas/:n/enviar` | `comanda:enviar` | `{ versionEsperada }`. Ya enviada → `409 RONDA_YA_ENVIADA` |
| POST | `/api/v1/staff/salon/cuentas/:id/solicitar` | `cuenta:solicitar` | Cuenta y mesas → `cuenta_pedida` (`409 RONDA_PENDIENTE` o `CUENTA_SIN_CONSUMO`) |
| POST | `/api/v1/staff/salon/cuentas/:id/cancelar` | `cuenta:abrir` | `{ motivo, versionEsperada }`: solo abierta y sin ítems enviados (`409 CUENTA_CON_ITEMS_ENVIADOS`) |
| POST | `/api/v1/staff/salon/cuentas/:id/transferir` | `cuenta:transferir` | `{ meseroId, motivo? }` (F1-8). A quien no atiende mesas → `400 MESERO_NO_VALIDO` (1.7b) |
| POST | `/api/v1/staff/salon/cuentas/:id/cerrar-sin-cobro` | `cuenta:cerrar_sin_cobro` | `{ motivo, versionEsperada }` (F1-13) |
| POST | `/api/v1/staff/salon/mesas/:id/mover` | `mesa:operar` | `{ mesaDestinoId }`: cuenta abierta a una mesa libre; la que deja pasa a por limpiar. Con mesas unidas, destino de la misma zona y combinable |
| POST | `/api/v1/staff/salon/mesas/unir` | `mesa:unir` | `{ principalId, mesaIds[] }`: mesas libres, combinables y de la misma zona se suman a la cuenta abierta de la principal (F1-9) |
| POST | `/api/v1/staff/salon/mesas/:id/separar` | `mesa:unir` | Solo si la cuenta no tiene ítems enviados; la mesa pasa a por limpiar |
| POST | `/api/v1/staff/salon/mesas/:id/estado` | `mesa:operar` / `mesa:bloquear` | `{ a, motivo? }`: `por_limpiar → libre`; `libre ↔ bloqueada` con motivo. Con cuenta → `409 MESA_CON_CUENTA` |

### Admin (`/api/v1/admin`, sesión + permiso)

| Método | Ruta | Permiso | Acción |
|---|---|---|---|
| POST | `/api/v1/admin/usuarios` | `usuario:gestionar` | Crear usuario `{ nombre, apellido, correo, telefono?, rolId }` → 201 con `entrega` (`correo` \| `registro_desarrollo` \| `sin_smtp`). Sin contraseña: se envía «Crea tu contraseña» (24 h, un solo uso; en desarrollo sin SMTP, al log). Correo registrado → `409 USUARIO_EXISTENTE`; crear un admin exige `*` (1.5b) |
| POST | `/api/v1/admin/usuarios/:id/reenviar-enlace` | `usuario:gestionar` | Solo cuentas que aún no crearon su contraseña (`accesoPendiente` en la lista): invalida el enlace anterior, genera uno nuevo de 24 h y deja un Evento `enlace_reenviado`. Ya creada → `409 CONTRASENA_YA_CREADA`; inactiva → `409 USUARIO_INACTIVO`; una cuenta con más permisos que quien reenvía → 403 |
| GET | `/api/v1/admin/categorias` | — (público) | Listar categorías (con su `estacion`) |
| POST, PUT, DELETE | `/api/v1/admin/categorias[/:id]` | `catalogo:gestionar` | Crear, editar y borrar (con productos no se borra → `409 CATEGORIA_EN_USO` con `details.productos`); `estacionId` (sin él, Cocina; no admite `null`) |
| GET, POST, PUT, DELETE | `/api/v1/admin/productos[/:id]` | `catalogo:gestionar` | Gestionar productos (imagen ≤ 2 MB, precio entero, `disponible`, `estacionId` propia o `null`, `gruposModificadoresIds`); responden `estacionId`, `estacionEfectiva` y `gruposModificadores` |
| GET | `/api/v1/admin/estaciones` | `salon:configurar` o `catalogo:gestionar` | Estaciones con su uso (categorías y productos) |
| POST, PUT, DELETE | `/api/v1/admin/estaciones[/:id]` | `salon:configurar` | `{ codigo (inmutable), nombre, activa, umbralAvisoMin, umbralAlertaMin }` (umbrales del KDS en minutos; `null` = los de F2-4; el aviso antes que la alerta, si no `400 UMBRALES_NO_VALIDOS`); código o nombre repetido → `409 ESTACION_DUPLICADA`; otro la cambió antes → `409 ESTACION_MODIFICADA`; con categorías o productos no se borra ni se desactiva y asignada a un rol no se borra (sí se desactiva) → `409 ESTACION_EN_USO` |
| GET, POST, PUT, DELETE | `/api/v1/admin/grupos-modificadores[/:id]` | `catalogo:gestionar` | Grupos de modificadores; `409 GRUPO_DUPLICADO`, `409 GRUPO_EN_USO` (al borrar), `409 GRUPO_MODIFICADO` (editado a la vez), `400 OPCION_NO_VALIDA`; asignar uno inactivo o inexistente → `400 GRUPO_NO_VALIDO` |
| GET | `/api/v1/admin/estados?tipo=pedido\|reserva` | `estado:editar`, `pedido:ver` o `reserva:ver` | Catálogo de estados |
| PUT | `/api/v1/admin/estados/:id` | `estado:editar` | Editar etiqueta, descripción y colores (crear/borrar → 405) |
| GET, POST, PUT, DELETE | `/api/v1/admin/roles[/:id]` | `rol:gestionar` | Roles con sus permisos y, desde 2.5b, `estaciones` del KDS (códigos; el rol cliente no puede tenerlas; una que no existe → `400 ESTACION_NO_EXISTE`). Los de sistema no se borran; `409 ROL_CON_USUARIOS` |
| GET | `/api/v1/admin/permisos` | `rol:gestionar` | Catálogo de permisos |
| GET, POST, PUT, DELETE | `/api/v1/admin/metodos-pago[/:id]` | `metodo_pago:gestionar` | Métodos de pago |
| GET | `/api/v1/admin/usuarios` | `usuario:gestionar` | Listar usuarios |
| PATCH | `/api/v1/admin/usuarios/:id` | `usuario:gestionar` | `{ activo?, rolId? }` (`409 AUTO_BLOQUEO` / `ULTIMO_ADMIN`) |
| GET | `/api/v1/admin/comentarios` | `resena:moderar` | Todas las reseñas |
| PATCH | `/api/v1/admin/comentarios/:id/visibilidad` | `resena:moderar` | `{ visible }` |
| DELETE | `/api/v1/admin/comentarios/:id` | `resena:moderar` | Borrar una reseña (`404 NOT_FOUND` si no existe, también en `visibilidad`) |
| GET, PUT | `/api/v1/admin/horarios` | `horario:editar` | Ver y editar los horarios. 1.15: el GET devuelve `version` y `actualizadoEn` (último cambio real); el PUT exige `versionEsperada` y responde `409 HORARIOS_MODIFICADOS` si otro admin guardó antes. Cada cambio deja un Evento (`configuracion`, `horarios_cambiados`) |
| GET, POST, PUT, DELETE | `/api/v1/admin/zonas[/:id]` | `salon:configurar` | Zonas del salón `{ nombre, orden, activa }` (nombre único sin mayúsculas ni tildes → `409 ZONA_DUPLICADA`; con mesas no se borra → `409 ZONA_CON_MESAS`; no se desactiva con mesas en uso → `409 ZONA_CON_MESAS_EN_USO`) |
| GET, POST, PUT, DELETE | `/api/v1/admin/mesas[/:id]` (`?zona=`) | `salon:configurar` | Mesas `{ numero, nombre?, zona, capacidad, combinable, activa }`; el estado no se asigna aquí. Número único → `409 MESA_NUMERO_DUPLICADO`; zona inexistente o inactiva → `400 ZONA_NO_VALIDA`; una mesa que no está libre no se borra, no se desactiva ni cambia de zona → `409 MESA_EN_USO` |

Los pedidos se guardan en `Pedido` y `DetallePedido` (nombre y precio del momento en cada línea). El backend valida los productos contra el catálogo (existentes y disponibles) y calcula precios y total desde allí, sin confiar en importes del navegador. Las reservas se guardan en `Reserva` con un `Estado` del catálogo fijo. Las reseñas se guardan en `Comentario` (una por usuario y producto; las anteriores a 0.12 cuentan como no verificadas).
