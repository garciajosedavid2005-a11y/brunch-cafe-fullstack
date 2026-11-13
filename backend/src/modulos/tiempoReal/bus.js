// 2.4 · Bus de eventos en memoria (PLAN_FASE_2 §2, aprobado): un solo proceso Node basta. Si un día hay
// varios procesos, se cambia por Redis Pub/Sub detrás de esta misma interfaz (publicar / suscribir) sin
// tocar las pantallas. Los eventos solo llevan tipo e ids: cada pantalla vuelve a leer con su permiso.
//
// Canales: `estacion:<codigo>` (KDS), `cuenta:<id>` (toma de comanda), `plano` (mesas) y
// `mesero:<id>` (avisos de «listo»). `estaciones` es el aviso a todas las estaciones (domicilio): quien
// escucha cualquier `estacion:<codigo>` también lo recibe.
const suscriptores = new Set()

export const CANAL_TODAS_LAS_ESTACIONES = 'estaciones'

const recibe = (canalesSuscritos, canal) =>
    canalesSuscritos.has(canal) || (canal === CANAL_TODAS_LAS_ESTACIONES && [...canalesSuscritos].some((c) => c.startsWith('estacion:')))

/**
 * Publica `{ tipo, ids }` en cada canal (sin repetir canales). Llamar solo DESPUÉS de confirmar la
 * transacción: si falla, no se avisa. Nunca lanza: un suscriptor que falle no afecta a los demás.
 */
export const publicar = (canales, { tipo, ids = {} }) => {
    const unicos = [...new Set(canales.filter(Boolean))]
    for (const s of suscriptores) {
        for (const canal of unicos) {
            if (!recibe(s.canales, canal)) continue
            try {
                s.alRecibir({ canal, tipo, ids, en: new Date().toISOString() })
            } catch {
                // Un cliente roto no corta el reparto
            }
        }
    }
}

/** Suscribe a esos canales; devuelve la función para darse de baja. */
export const suscribir = (canales, alRecibir) => {
    const suscriptor = { canales: new Set(canales), alRecibir }
    suscriptores.add(suscriptor)
    return () => suscriptores.delete(suscriptor)
}

/** Solo para tests y diagnóstico. */
export const totalSuscriptores = () => suscriptores.size
