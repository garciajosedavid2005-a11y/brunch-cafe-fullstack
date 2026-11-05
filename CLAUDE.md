# CLAUDE.md

**IMPORTANTE: responde SIEMPRE en español**: mensajes, resúmenes, `docs/PROGRESO.md`, comentarios de código y mensajes de commit.

## Proyecto

Brunch Café: evolución a un POS de servicio a la mesa. Backend Node 24 + Express 5 + Mongoose 9 + Zod 4 (ESM); frontend React 19 + Vite + Foundation. La guía es la auditoría de `docs/auditoria/`; el diagnóstico inicial está en `docs/DIAGNOSTICO_FASE_A.md`.

**`docs/PROGRESO.md` es el archivo de seguimiento**: estado de cada ítem, decisiones (fecha · decisión · quién) y pendientes. Léelo al empezar y actualízalo al cerrar cada ítem.

## Proceso de trabajo

- Un ítem a la vez, en el orden acordado en PROGRESO.md. Por ítem: verificar el estado real (HECHO / PARCIAL / FALTA), proponer, implementar, verificar y registrar en PROGRESO.md.
- Test primero: cada corrección lleva un test que se ve fallar antes del cambio.
- Todo cambio visual se revisa con capturas (`npm run capturas -- <etiqueta>` en `frontend/`, usuarios de `npm run seed:dev`; nunca el admin real ni contraseñas en el código). No dar algo por listo sin haberlo visto en una captura.
- No desactivar reglas de lint (sin `eslint-disable`), no borrar funcionalidades, no simular lo que no existe y mantener las protecciones en el backend.
- Convenciones: montos en COP como enteros; fechas en UTC en la BD y `America/Bogota` solo para mostrar; estados como enums; errores con formato `{ error: { code, message, details } }`.

## Antes de cada commit

- `npm test`, `npm run lint` y `npm run build` en backend y frontend, todo en verde. Si aparece el crash conocido de Vitest en Windows (código `3221226505`), repetir una vez. Si algo falla, no hay commit ni push.

## Cuándo detenerse y preguntar

1. Antes de ejecutar una migración real: primero `mongodump` a `backups/` y mostrar el `--dry-run`. Las migraciones son no destructivas, reversibles y admiten `--dry-run` y `--down`.
2. Antes de borrar archivos, colecciones o rutas.
3. Ante decisiones de negocio nuevas o cambios de contrato no previstos.
4. Si un problema no se resuelve en 2 intentos: explicar qué pasa y esperar.
5. En las pausas de revisión acordadas (p. ej. al terminar 0.8, con capturas antes/después).

## Git

- Rama `Brayan`. Commits pequeños en español, uno por punto o grupo, terminados en `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Push a `origin Brayan` después de cada ítem en verde. Nunca `--force` ni merge a `main`.
- Nunca subir `.env`, `backups/` ni `capturas/` (verificar con `git status` antes del push).

## Seguridad

- No imprimir contraseñas en logs ni en la consola; no enviar el correo del usuario a servicios externos.
- Colecciones heredadas (`users`, `orders`, `reservations`, `reviews`): no se tocan sin aprobación.
