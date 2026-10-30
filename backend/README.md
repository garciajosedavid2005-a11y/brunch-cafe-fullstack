# API del cliente

## Inicio local

1. Copia `.env.example` a `.env` y configura `MONGO_URI` y un `JWT_SECRET` aleatorio.
2. Ejecuta `npm install` si todavía no están instaladas las dependencias.
3. Inicia MongoDB y ejecuta `npm run dev`.
4. En `frontend`, copia `.env.example` a `.env` y ejecuta `npm run dev`.

El backend escucha por defecto en `http://localhost:4000`; el cliente usa cookies con credenciales habilitadas. En producción, frontend y API deben servirse por HTTPS y `CLIENT_URL` debe apuntar al origen exacto del frontend.

## Endpoints

La autenticación usa una cookie JWT `HttpOnly`. Los endpoints `/api/customer` requieren una sesión válida y limitan todas las consultas al usuario autenticado.

| Método | Ruta | Acción |
|---|---|---|
| POST | `/api/auth/register` | Crear cuenta de cliente |
| POST | `/api/auth/login` | Iniciar sesión |
| POST | `/api/auth/logout` | Cerrar sesión |
| GET | `/api/auth/me` | Consultar la sesión |
| GET, PATCH | `/api/customer/profile` | Consultar y editar el perfil |
| GET | `/api/customer/orders` | Listar pedidos propios |
| GET | `/api/customer/orders/:id` | Consultar detalle de un pedido propio |
| GET, POST | `/api/customer/reservations` | Listar y crear reservas |
| PATCH | `/api/customer/reservations/:id` | Editar una reserva propia y volverla a pendiente de aprobación |
| PATCH | `/api/customer/reservations/:id/cancel` | Cancelar una reserva propia futura |
| GET, POST | `/api/customer/reviews` | Listar y publicar comentarios con calificación |
| GET | `/api/reviews/product-ratings` | Consultar promedios públicos de calificación por producto |

Los pedidos son de solo lectura en el dashboard. Para que aparezcan, el flujo de checkout debe persistirlos en `Order` con el `user` autenticado, sus artículos, total y estado; esta API no admite que el cliente cambie su propio total ni su estado. Las reservas se crean desde la página protegida `/reservas`; nombre y correo se precargan desde la cuenta y pueden ajustarse como datos de contacto de esa reserva. Editar una reserva activa la devuelve a `pending` para una nueva aprobación. Las reservas aceptan horas en punto de 8:00 a 12:00 entre semana y de 8:00 a 11:00 los fines de semana, además de requerir un motivo. Los comentarios pueden ser generales o asociarse a un producto; las calificaciones de producto se agregan en el endpoint público de promedios.
