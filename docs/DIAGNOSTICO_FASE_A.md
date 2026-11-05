# Diagnóstico Fase A — Brunch Café

> Movido desde `PROGRESO.md` el 2026-11-05. Es una foto del código al inicio de la Fase 0: el estado actual de cada ítem está en [PROGRESO.md](PROGRESO.md).

## Fase A — Diagnóstico (terminada 2026-11-05)

Fecha del diagnóstico: 2026-11-05 · Rama: `Brayan` (commit `a948ca9`) · Informe base: `docs/auditoria/Informe_consolidado_auditoria_Brunch_Cafe.docx` (corte 30-oct-2026).

> El informe está **parcialmente desactualizado**: después del 30-oct se integraron los commits `aab4d0c`/`a948ca9` (dashboard admin, endpoints de pedidos, catálogo en MongoDB). La tabla refleja el código actual.

---

## 1. Mapa del repositorio

### Estructura
```
backend/   Express 5.2 · Mongoose 9.10 · Zod 4.6 · JWT · bcryptjs · ESM ("type":"module")
  src/index.js            arranque, CORS, cookie-parser, morgan, error handler básico
  src/config.js           validación de env con Zod
  src/db.js               mongoose.connect (sin replica set)
  src/routes/             11 routers montados en /api (index.routes.js)
  src/controllers/        9 controladores (auth, usuario, reserva, pedido, producto, categoria, estado, rol, metodoPago, comentario)
  src/models/             12 modelos (Review.js sin uso)
  src/schema/             esquemas Zod (+ comunes.js)
  src/middlewares/        validateToken, authorizeRole, validateSchema
  src/libs/               jwt, manejarError, utils, ensureOrderOptions (upserts de estados/métodos)
  scripts/seed-menu.js    importa frontend/src/data/menu.json + imágenes a MongoDB
frontend/  React 19 · Vite 8 · react-router 7 · ESLint 9
  src/services/api.js, adminApi.js   dos clientes fetch distintos
  src/pages/AdminDashboard/          dashboard admin (mockData.js / mockExtraData.js sin uso)
  src/pages/CustomerDashboard/       cuenta del cliente
  src/data/menu.json                 24 productos (solo lo usa el seed)
docs/auditoria/  informe + PROMPT_MAESTRO.md
```

### Scripts
| Paquete | Scripts |
|---|---|
| backend | `dev` (nodemon), `seed:menu` |
| frontend | `dev`, `build`, `lint`, `preview` |

**No hay**: tests, lint en backend, Docker/docker-compose, replica set, CI.

### Variables de entorno
- backend (`backend/.env.example`): `PORT`, `MONGO_URI`, `JWT_SECRET`, `JWT_EXPIRES_IN=7d`, `CLIENT_URL`, `NODE_ENV`.
- frontend (`frontend/.env.example`): `VITE_API_URL`.

### Rutas montadas (`backend/src/routes/index.routes.js:16-28`)
| Prefijo | Router | Protección |
|---|---|---|
| `/api/auth` | registro, login, logout, me | `me` con token |
| `/api/usuarios` | `GET/PUT /perfil`, `PUT /perfil/contrasena` | token |
| `/api/reservas` | POST/GET mias/PATCH cancelar (cliente); GET y PATCH estado (admin) | token / `admin` |
| `/api/customer` | perfil, pedidos, métodos de pago, reservas, reseñas | token |
| `/api/comentarios` y `/api/reviews` | **mismo router montado dos veces** | mixto |
| `/api/categorias`, `/metodos-pago`, `/estados`, `/roles` | CRUD | `admin` |
| `/api/productos` | `GET /menu`, `GET /menu/imagenes/:nombre` públicos; CRUD | `admin` |
| `/api/pedidos` | `GET /`, `PATCH /:id/estado` | `admin` |

### Endpoints que consume el frontend (contrato a preservar)
`/auth/{login,registro,logout,me}` · `/productos/menu` · `/comentarios` · `/comentarios/product-ratings` · `/customer/{profile,orders,payment-methods,reservations,reservations/:id,reservations/:id/cancel,comentarios}` · `/usuarios/perfil` (+ `/contrasena`) · admin: `/pedidos`, `/pedidos/:id/estado`, `/reservas`, `/comentarios/admin`, `/comentarios/:id/visibility`, CRUD de categorías, productos, estados, roles, métodos de pago.
**No lo usa el frontend:** `POST /api/reservas`, `GET /api/reservas/mias`, `PATCH /api/reservas/:id/cancelar`, `/api/reviews` (alias).

---

## 2. Tabla de seguimiento

### Hallazgos técnicos T1–T11

| ID | Ítem | Estado inicial | Estado actual | Commit | Notas / evidencia |
|---|---|---|---|---|---|
| T1 | Lado interno del pedido | PARCIAL | PARCIAL | — | Ya existe `GET /api/pedidos` y `PATCH /api/pedidos/:id/estado` (`pedido.routes.js:10-12`, `pedido.controller.js:41-97`). Falta: cancelar con motivo, permisos por rol de staff (solo `admin`), historial. La secuencia Pendiente→Confirmado→Recibido está escrita a mano por nombre (`pedido.controller.js:74-84`). |
| T2 | Backend lee menu.json y precios desde texto | PARCIAL | PARCIAL | — | En ejecución ya **no** lee menu.json; solo el seed (`scripts/seed-menu.js:12`, convierte a entero en `:48`). Pero `GET /productos/menu` devuelve el precio **como texto** `"$12.000"` (`producto.controller.js:33`) y el frontend lo vuelve a parsear (`CarritoContext.jsx:54`). El README sigue diciendo que se valida contra menu.json (desactualizado). |
| T3 | producto.model.js no exporta | HECHO | HECHO | — | `producto.model.js:45` exporta el modelo. |
| T4 | Límite fijo de 24 IDs | PARCIAL | PARCIAL | — | Ya no hay límite de 24 (`comentario.model.js:16-24`, `customer.routes.js:40`). Pero las referencias siguen siendo el número `codigo`, no ObjectId: ítems del pedido (`customer.routes.js:40,258`), `Comentario.productoId: Number` (`comentario.model.js:18`). `DetallePedido` guarda ambos (`detallePedido.model.js:9-16`). El `codigo` nuevo se calcula como máx+1 (`producto.controller.js:79-82`): condición de carrera. |
| T5 | Rutas duplicadas de reservas y perfil | FALTA | FALTA | — | Reservas: `/api/reservas` (`reserva.routes.js:17-19`) valida con `reserva.schema.js`, sin fecha futura ni horario, y acepta `nombre/correo/motivo` sin validar (`reserva.controller.js:23`). `/api/customer/reservations` sí valida (`customer.routes.js:25-36,110-119`). Perfil: `PUT /usuarios/perfil` usa el campo `correo` y teléfono opcional (`usuario.schema.js:3-8`), mientras que `PATCH /customer/profile` usa `email` y teléfono obligatorio con mín. 7 (`customer.routes.js:18-23`). **El frontend usa los dos perfiles**: admin y `Perfil.jsx` usan `/usuarios/perfil`, y el dashboard del cliente usa `/customer/profile`. `Perfil.jsx:12` tiene escrito `http://localhost:4000`. |
| T6 | Seguridad de cookie/login, rate limit | FALTA | FALTA | — | `res.cookie("token", token)` sin opciones (`auth.controller.js:34,64,83`). Mensajes distintos "Usuario no encontrado" y "Contraseña incorrecta" (`:57,:60`); el registro también revela si el correo existe (`:11`). No hay rate limit ni helmet. CORS ya es explícito (`index.js:11-16`). Errores 500 devuelven `error.message` (`manejarError.js:20`, `auth.controller.js:48,78`). Token inválido responde 403 en vez de 401 (`validateToken.js:14`). |
| T7 | Estados por texto, upserts en peticiones, sin transiciones | FALTA | FALTA | — | Inferencia por texto: `customer.routes.js:64-69` (reserva) y `:121-129` (pedido). Upserts durante peticiones: `customer.routes.js:94-108,237,277`, `reserva.controller.js:25-29,75-79`, `estado.controller.js:50`, rol cliente en el registro (`auth.controller.js:13-17`); `ensureOrderPaymentMethods` incluso reescribe descripciones (`ensureOrderOptions.js:71-77`). Los estados son documentos que el admin puede renombrar (`estado.controller.js:89-118`), y renombrarlos rompe la inferencia. El cambio de estado de reservas no tiene transiciones ni comprueba `esFinal` (`reserva.controller.js:110-131`). |
| T8 | Pedido+detalles sin transacción ni idempotencia | PARCIAL | PARCIAL | — | Ya hay snapshot de nombre y precio por línea (`detallePedido.model.js:17-24`, `customer.routes.js:299-307`). Falta la transacción (el rollback es manual, `customer.routes.js:285-312`) y la cabecera Idempotency-Key. `db.js` conecta sin replica set. |
| T9 | Lógica concentrada en customer.routes.js | FALTA | FALTA | — | 465 líneas con esquemas, serializadores, reglas y handlers en el mismo archivo (`customer.routes.js:1-465`). |
| T10 | Sin historial de estados ni tiempo real | FALTA | FALTA | — | No hay modelo de evento ni de historial, y no hay socket/SSE. |
| T11 | Zona horaria fija -05:00, fecha T12:00Z, hora en texto | FALTA | FALTA | — | `customer.routes.js:62,370,410`; `Reserva.hora: String` (`reserva.model.js:23`); `Pedido.horaEntrega: String` sin fecha (`pedido.model.js:39`). En el frontend se compensa con `timeZone:'UTC'` (`ResumenReserva.jsx:26-34`, `ReservationsSection.jsx:116`). |

### Extras

| ID | Ítem | Estado inicial | Estado actual | Commit | Notas / evidencia |
|---|---|---|---|---|---|
| X1 | Modelos Comentario y Review duplicados | PARCIAL | PARCIAL | — | `models/Review.js` no lo importa nadie (código muerto). Solo se usa `Comentario`. El README dice "colección Review" (desactualizado). |
| X2 | Reseña sin compra verificada ni límite | FALTA | FALTA | — | `comentario.controller.js:119-146` crea sin verificar compra ni duplicados; no hay índice único. |
| X3 | Seed de roles y primer admin | FALTA | FALTA | — | Solo se hace upsert de `cliente` al registrarse. El rol `admin` y el primer admin hay que crearlos a mano en la BD. |
| X4 | JWT de 7 días con rol embebido | FALTA | FALTA | — | `JWT_EXPIRES_IN=7d`; payload `{id, rol}` (`auth.controller.js:32,62`); `authorizeRole` confía en el rol del token (`authorizeRole.js:3`). `Rol.permisos` es una lista informativa (`rol.model.js:24-28`). |
| X5 | UI dice "confirmado" con pedido Pendiente | FALTA | FALTA | — | `CarritoFormulario.jsx:185`: `¡Pedido … confirmado!` |
| X6 | UI promociona puntos inexistentes | PARCIAL | PARCIAL | — | No encontré textos de "puntos" ni de "lealtad". Solo hay menciones genéricas a "beneficios" (`Login.jsx:63`, `Registro.jsx:91`). |

### Hallazgos nuevos (no estaban en el informe)

| ID | Hallazgo | Evidencia | Severidad |
|---|---|---|---|
| N1 | Zod 4 ignora `required_error`/`message` en `auth.schema.js` y `reserva.schema.js`, así que se pierden los mensajes personalizados | `auth.schema.js:4-33`, `reserva.schema.js:4-17` (contrasta con `comunes.js:3-7`) | Baja |
| N2 | El correo no se normaliza en el registro ni en el login, por lo que son posibles cuentas duplicadas que solo difieren en mayúsculas | `usuario.model.js:14-19`, `auth.controller.js:10,56` | Media |
| N3 | Precio admin `z.coerce.number().min(0)` acepta decimales (la convención es COP entero) | `producto.schema.js:10` | Baja |
| N4 | Imágenes en base64 dentro del documento Producto (hasta 5 MB) y `express.json` a 6 MB | `producto.schema.js:4-6`, `index.js:17` | Media |
| N5 | Dos clientes HTTP distintos en el frontend (`api.js`, `adminApi.js`), además de un `fetch` con URL escrita a mano | `services/*.js`, `Perfil.jsx:12` | Baja |
| N6 | Datos mock del dashboard sin uso | `AdminDashboard/mockData.js`, `mockExtraData.js` | Baja |
| N7 | El alias `/api/reviews` monta el mismo router que `/api/comentarios` | `index.routes.js:19-20` | Baja |
| N8 | `horaEntrega` se valida entre 08:00 y 16:00 sin comparar con la hora actual ni con la fecha | `customer.routes.js:48` | Media |

---

## 3. Orden propuesto para la Fase 0

Mantengo el orden del plan con estos ajustes por dependencias:

1. **0.1** Infraestructura (Vitest + Supertest + mongodb-memory-server en replica set, ESLint backend, error handler `{error:{code,message,details}}`, logger). Requiere separar `app.js` de `index.js` para poder testear.
2. **0.2** Seguridad auth.
3. **0.3** Seed de roles y primer admin.
4. **0.4** RBAC con permisos leídos desde la BD.
5. **0.7** Enums y máquina de transiciones, más el modelo Evento. **Propongo adelantarlo antes de 0.5**, porque 0.8, 0.9 y 0.13 dependen de él y es el riesgo funcional más alto.
6. **0.5** Catálogo (lo que queda: `/api/v1/catalogo`, precio entero en la respuesta, seed independiente del frontend).
7. **0.6** Referencias por ObjectId y migración (con tu aprobación).
8. **0.10** Fechas UTC y utilidad de America/Bogota (antes de unificar reservas, para no hacerlo dos veces).
9. **0.8** Unificar reservas y perfil, y estructura `/api/v1/*`.
10. **0.9** Transacción e Idempotency-Key.
11. **0.11** Refactor por dominios: lo haría **de forma incremental** dentro de 0.8 y 0.9 (cada pieza que se toca se mueve a su módulo), y dejaría en 0.11 solo el cierre.
12. **0.12** Limpieza (Review, reseñas verificadas, texto "confirmado", "beneficios").
13. **0.13** Endpoints staff de pedido (listar, transicionar, cancelar con motivo).

## Riesgos principales
- **R1 · Estados editables vs. enums:** hoy el admin crea y renombra estados desde el dashboard (`StatesSection.jsx`). Pasar a enums cambia ese contrato, así que hay que decidir qué queda editable (solo etiqueta y colores).
- **R2 · Migración de referencias numéricas:** los pedidos y comentarios existentes apuntan a `codigo`. Hace falta una migración no destructiva (añadir ObjectId y conservar `codigo`).
- **R3 · Transacciones:** necesitan replica set; hoy no hay Docker y desconozco el despliegue (¿local? ¿Atlas?).
- **R4 · Cambiar la cookie y el JWT** puede cerrar las sesiones activas (aceptable, pero hay que avisar).
- **R5 · Sin tests:** cualquier refactor antes de 0.1 sería a ciegas.
