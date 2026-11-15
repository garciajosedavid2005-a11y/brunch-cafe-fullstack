# Plan Fase 4 — Reservas conectadas al salón

Pedido por Brayan el 2026-11-15. Orden: 4.1 → 4.5, un commit por ítem y una sola pausa al final de la fase. **Cerrada el 2026-11-15** (estado y commits en [PROGRESO.md](PROGRESO.md)).

## Ítems

| ID | Ítem | Qué entrega |
|---|---|---|
| 4.1 | Mesa asignada sin solapamientos | La reserva guarda `mesa`. El mesero y el admin asignan o quitan la mesa desde la pestaña «Reservas» de /staff. Dos reservas activas de una mesa no se solapan, y eso se comprueba dentro de la transacción. |
| 4.2 | Aforo por franja | En Admin › Horarios se define un máximo general de personas por hora y, si hace falta, uno distinto para cada hora. Crear o editar una reserva que lo supere responde 409 `AFORO_COMPLETO`. |
| 4.3 | Plano, «Sentar» y no-show | El plano muestra las reservas próximas de cada mesa. Una mesa reservada no se puede abrir para otra persona. «Sentar» abre la cuenta en la mesa asignada. A los 15 min de retraso se sugiere marcar el no-show. |
| 4.4 | Lista de espera | Clientes sin reserva, con nombre, personas y teléfono. «Sentar» abre la cuenta en una mesa libre. |
| 4.5 | Aviso en vivo | Canal SSE `reservas`. Cuando se edita una reserva confirmada, el staff recibe al momento un aviso con el antes y el después. Con esto se cierra la fase. |

## Decisiones de Brayan (2026-11-15)

- **F4-1 · Duración.** Cada reserva dura 90 min y la mesa queda reservada desde 15 min antes: el bloque es `[inicio − 15 min, inicio + 90 min)`. Dos reservas activas (pendiente, confirmada o sentada) de la misma mesa no pueden tener bloques que se crucen. Se comprueba en la transacción y, si chocan, responde 409 `MESA_OCUPADA_EN_HORARIO`.
- **F4-2 · Aforo.** Se configura por franja horaria (máximo de personas por hora) en Admin › Horarios.
- **F4-3 · Quién.** Reservan y asignan mesa el mesero y el admin, con los permisos `reserva:*` que ya tienen: no hace falta migrar permisos. El plano muestra las mesas con reservas próximas.
- **F4-4 · Lista de espera.** Nombre, personas y teléfono, con el botón «Sentar».
- **F4-5 · No-show.** Se sugiere a los 15 min de retraso y lo marca el staff.
- **F4-6 · «Sentar».** Abre la cuenta en la mesa asignada.
- **F4-7 · Avisos.** Al editar una reserva confirmada, el staff recibe un aviso en vivo.

## Decisiones técnicas: Claude (a confirmar por Brayan)

- **F4-a · Serialización.** Asignar una mesa «toca» la mesa (`updatedAt`) dentro de la transacción. Así, dos asignaciones simultáneas chocan y la segunda ve la primera. El aforo «toca» un contador por franja (`aforo:<fecha> <hora>`) con el mismo fin.
- **F4-b · Capacidad.** Solo se asigna una mesa activa con capacidad ≥ personas. Si no, responde 409 `MESA_PEQUENA`. Los grupos grandes se sientan uniendo mesas después de «Sentar».
- **F4-c · Mesa reservada.** Entre `inicio − 15 min` y el final del bloque, la mesa de una reserva pendiente o confirmada no se abre para nadie más, ni desde el plano ni desde la lista de espera (409 `MESA_RESERVADA`). La libera «Sentar», cancelar o el no-show. Antes de esos 15 min la mesa se usa con normalidad.
- **F4-d · Aforo.** Suma las personas de las reservas activas que empiezan en esa hora. Vacío = sin límite (así queda hoy, sin migración de datos). Se aplica a las reservas del cliente y a las del personal. La lista de espera no cuenta.
- **F4-e · Reservas próximas en el plano.** Se muestra la siguiente reserva activa de cada mesa cuyo bloque empiece en las próximas 2 h. La tarjeta dice «Reservada · 7:00 p. m.».
- **F4-f · «Sentar».** Se puede sentar una reserva pendiente o confirmada, de hoy y con mesa asignada y libre. Pasa a `sentada` y abre la cuenta (comensales = personas) en la misma transacción. La reserva guarda `cuenta`. Sin mesa responde 409 `RESERVA_SIN_MESA`.
- **F4-g · No-show.** También una reserva pendiente que no llegó se puede marcar como no-show (transición nueva `pendiente → no_show`, solo en el código). La sugerencia aparece desde `inicio + 15 min`.
- **F4-h · Lista de espera.** Colección nueva `esperas` (estado `esperando | sentada | retirada`). Se agrega con `reserva:crear` y se sienta o retira con `reserva:cambiar_estado`. Solo muestra la lista de hoy.
- **F4-i · Edición y mesa.** Si al editar una reserva su nueva hora choca con la mesa asignada (o la mesa queda pequeña), la mesa se quita. El aviso lo dice.

## Migraciones

Solo agregan (aprobadas de antemano): el índice `{ mesa, inicio }` de `reservas` y los índices de `esperas`. Se hace `mongodump`, `--dry-run` y up → down → up.
