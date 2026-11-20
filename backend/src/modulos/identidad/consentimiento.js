import { ROL_CLIENTE } from './permisos.js'

// 6.4 (F6-8, F6-f) · Consentimiento de tratamiento de datos (Ley 1581 de 2012). La versión vigente vive en el código: al
// cambiar el texto de la política se sube aquí y en el frontend (utils/consentimiento.js), y cada cliente la vuelve a
// aceptar en su próximo inicio de sesión. El personal no la necesita para trabajar.
// 2026-11b (Brayan, 2026-11-20): la fecha de nacimiento ya no se corrige desde Mi cuenta, la corrige el café
export const CONSENTIMIENTO_VERSION = '2026-11b'

/** Un cliente sin la versión vigente (sin aceptar, o con una anterior) tiene el consentimiento pendiente. */
export const consentimientoPendiente = (rolNombre, version) => rolNombre === ROL_CLIENTE && version !== CONSENTIMIENTO_VERSION

// Rutas que un cliente con el consentimiento pendiente sí puede usar: aceptarlo, saber quién es y leer su perfil
// (salir no pasa por la autenticación)
const PERMITIDAS = new Set(['GET /api/v1/auth/me', 'POST /api/v1/auth/consentimiento', 'GET /api/v1/cliente/perfil'])
// `ruta` = req.baseUrl + req.path (la ruta ya enrutada, sin query): sin distinguir mayúsculas ni la barra final, como Express
export const rutaPermitidaSinConsentimiento = (metodo, ruta) => PERMITIDAS.has(`${metodo} ${ruta.toLowerCase().replace(/\/+$/, '')}`)
