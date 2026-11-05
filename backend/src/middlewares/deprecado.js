// Marca una ruta antigua como alias deprecado de su versión /api/v1 (RFC 8594 / 9745).
// La respuesta es la misma de siempre; solo se añaden las cabeceras.
export const deprecado = (sucesor) => (req, res, next) => {
    res.set('Deprecation', 'true')
    res.set('Link', `<${sucesor}>; rel="successor-version"`)
    next()
}

// Para un router montado completo: el sucesor es `base` + la subruta pedida
// (/api/auth/me → /api/v1/auth/me).
export const deprecadoBajo = (base) => (req, res, next) =>
    deprecado(`${base}${req.path === '/' ? '' : req.path}`)(req, res, next)
