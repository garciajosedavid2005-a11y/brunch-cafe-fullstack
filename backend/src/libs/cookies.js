import { config } from '../config.js'

export const COOKIE_SESION = 'token'

// Convierte "2h", "30m", "7d", "45s" o milisegundos en milisegundos
export const duracionEnMs = (valor) => {
    if (/^\d+$/.test(String(valor))) return Number(valor) * 1000 // jsonwebtoken: número = segundos
    const match = /^(\d+)\s*(s|m|h|d)$/i.exec(String(valor).trim())
    if (!match) throw new Error(`Duración no soportada: ${valor}`)
    const unidades = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }
    return Number(match[1]) * unidades[match[2].toLowerCase()]
}

const opcionesBase = () => ({
    httpOnly: true,
    secure: config.COOKIE_SECURE,
    sameSite: config.COOKIE_SAMESITE,
    path: '/',
})

export const ponerCookieSesion = (res, token) => {
    res.cookie(COOKIE_SESION, token, { ...opcionesBase(), maxAge: duracionEnMs(config.JWT_EXPIRES_IN) })
}

export const borrarCookieSesion = (res) => {
    res.clearCookie(COOKIE_SESION, opcionesBase())
}
