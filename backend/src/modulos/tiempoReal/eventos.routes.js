// 2.4 · GET /api/v1/staff/eventos?canales=a,b (Server-Sent Events). Autenticado (staff.routes.js) y con
// permiso por canal: estacion:<codigo> → kds:ver; cuenta:<id> → cuenta:ver; plano → mesa:ver;
// mesero:<id> → solo el propio usuario y con un permiso del salón (cuenta:ver o item:servir). Latido
// cada 25 s, cabeceras anti-buffer, límite de conexiones por usuario y cierre si la sesión deja de valer (contraseña cambiada, desactivado, cerrada o vencida)
// o si, con los permisos de ahora, ya no puede escuchar alguno de sus canales (rol cambiado).
import { Router } from 'express'
import mongoose from 'mongoose'
import { AppError } from '../compartido/errors.js'
import { tienePermiso } from '../identidad/permisos.js'
import { obtenerSesion } from '../identidad/sesiones.js'
import { duracionSesionMs } from '../identidad/duracionSesion.js'
import { FORMATO_CODIGO } from '../catalogo/estacion.model.js'
import { suscribir } from './bus.js'

export const LATIDO_MS = 25_000
let latidoMs = LATIDO_MS
/** Solo para tests: acorta el latido (y con él la comprobación de la sesión). */
export const configurarLatido = (ms = LATIDO_MS) => { latidoMs = ms }
export const MAX_CONEXIONES_POR_USUARIO = 5
export const MAX_CANALES = 10
// El código de estación sigue el formato del modelo (si cambia allí, cambia aquí)
const CODIGO = FORMATO_CODIGO.source.slice(1, -1) // sin ^ ni $
const FORMATO_CANAL = new RegExp(`^(plano|estacion:${CODIGO}|cuenta:[0-9a-f]{24}|mesero:[0-9a-f]{24})$`)

const conexiones = new Map() // usuarioId → número de conexiones abiertas

/** Valida los canales pedidos y el permiso de cada uno (403 con el canal que falla). */
export const validarCanales = (texto, sesion) => {
    const canales = [...new Set(String(texto || '').split(',').map((c) => c.trim().toLowerCase()).filter(Boolean))]
    if (!canales.length || canales.length > MAX_CANALES) {
        throw new AppError(400, 'CANALES_NO_VALIDOS', `Indica entre 1 y ${MAX_CANALES} canales.`)
    }
    for (const canal of canales) {
        if (!FORMATO_CANAL.test(canal)) throw new AppError(400, 'CANALES_NO_VALIDOS', `El canal «${canal}» no existe.`, { canal })
        const [tipo, id] = canal.split(':')
        const permitido = {
            plano: () => tienePermiso(sesion.permisos, 'mesa:ver'),
            estacion: () => tienePermiso(sesion.permisos, 'kds:ver'),
            cuenta: () => tienePermiso(sesion.permisos, 'cuenta:ver') && mongoose.isValidObjectId(id),
            // Solo el propio usuario, y solo personal de salón (un cliente no abre flujos en /staff)
            mesero: () => id === String(sesion.id) && ['cuenta:ver', 'item:servir'].some((p) => tienePermiso(sesion.permisos, p)),
        }[tipo]()
        if (!permitido) throw new AppError(403, 'FORBIDDEN', 'No tienes permiso para escuchar ese canal.', { canal })
    }
    return canales
}

/** Búfer de escritura máximo: si el cliente no lee (pestaña colgada, red lenta), se corta el flujo. */
export const MAX_BUFFER_BYTES = 1024 * 1024

/**
 * ¿Sigue valiendo el flujo? La sesión (activa, misma versión del token, sin vencer) y, con los permisos
 * de ahora, cada canal: si se cambió el rol o se le quitó un permiso, el flujo se cierra.
 */
const flujoVigente = async (id, { tv, iat }, canales) => {
    const sesion = await obtenerSesion(id)
    if (!sesion?.activo || sesion.tokenVersion !== tv || Date.now() >= iat * 1000 + duracionSesionMs(sesion)) return false
    try {
        validarCanales(canales.join(','), sesion)
        return true
    } catch {
        return false
    }
}

const router = Router()

router.get('/eventos', async (req, res) => {
    const sesion = req.usuario
    const canales = validarCanales(req.query.canales, sesion)
    const abiertas = conexiones.get(sesion.id) || 0
    if (abiertas >= MAX_CONEXIONES_POR_USUARIO) {
        throw new AppError(429, 'DEMASIADAS_CONEXIONES', 'Tienes demasiadas pantallas en vivo abiertas. Cierra alguna.')
    }
    const token = req.tokenSesion // { tv, iat } del token que validó autenticar

    res.status(200).set({
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no', // proxies como nginx no deben acumular el flujo
    })
    res.flushHeaders?.()
    conexiones.set(sesion.id, abiertas + 1)

    let cerrado = false
    let latido = null
    let baja = () => {}
    const cerrar = () => {
        if (cerrado) return
        cerrado = true
        clearInterval(latido)
        baja()
        const restantes = (conexiones.get(sesion.id) || 1) - 1
        if (restantes > 0) conexiones.set(sesion.id, restantes)
        else conexiones.delete(sesion.id)
    }
    // Toda escritura pasa por aquí: sobre un socket ya cerrado o con el búfer lleno, se cierra el flujo
    const escribir = (texto) => {
        if (cerrado) return
        try {
            res.write(texto)
            if (res.writableLength > MAX_BUFFER_BYTES) {
                cerrar()
                res.destroy()
            }
        } catch {
            cerrar()
        }
    }
    const enviar = (evento, datos) => escribir(`event: ${evento}\ndata: ${JSON.stringify(datos)}\n\n`)
    req.on('close', cerrar)
    res.on('close', cerrar)
    res.on('error', cerrar)
    // Si el cliente cortó antes de registrar los «close» (durante la autenticación), ya no llegarán
    if (req.destroyed || res.destroyed || req.socket?.destroyed) {
        cerrar()
        return
    }

    enviar('conectado', { canales })
    // Los avisos van como mensaje sin nombre (el tipo dentro de los datos): el navegador los recibe todos
    // con onmessage. Solo «conectado» y «sesion_cerrada» llevan nombre propio
    baja = suscribir(canales, (aviso) => escribir(`data: ${JSON.stringify(aviso)}\n\n`))

    let comprobando = false // si la BD tarda más que el latido, no se solapan comprobaciones
    latido = setInterval(async () => {
        if (res.destroyed || res.writableEnded) return cerrar()
        if (comprobando) return undefined
        comprobando = true
        let vigente
        try {
            vigente = await flujoVigente(sesion.id, token, canales)
        } catch {
            vigente = true // la BD no respondió: se mantiene y se comprueba en el siguiente latido
        } finally {
            comprobando = false
        }
        if (cerrado) return undefined
        if (!vigente) {
            enviar('sesion_cerrada', { motivo: 'La sesión ya no es válida.' })
            cerrar()
            res.end()
            return undefined
        }
        escribir(': latido\n\n')
        return undefined
    }, latidoMs)
})

export default router
