// Valida req.body con un esquema Zod. Si falla, el manejador central responde
// 400 { error: { code: 'VALIDATION_ERROR', message, details: [{ campo, mensaje }] } }
export const validateSchema = (schema) => (req, res, next) => {
    const resultado = schema.safeParse(req.body)
    if (!resultado.success) return next(resultado.error)
    next()
}
