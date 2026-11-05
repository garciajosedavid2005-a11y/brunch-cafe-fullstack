// Marca una ruta antigua como alias deprecado de su versión /api/v1 (RFC 8594 / 9745).
// La respuesta es la misma de siempre; solo se añaden las cabeceras.
export const deprecado = (sucesor) => (req, res, next) => {
    res.set('Deprecation', 'true')
    res.set('Link', `<${sucesor}>; rel="successor-version"`)
    next()
}
