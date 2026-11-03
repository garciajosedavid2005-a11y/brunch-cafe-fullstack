export const validateSchema = (schema) => (req, res, next) => {
    try {
        schema.parse(req.body)
        next()
    } catch (error) {
        const mensajes = error.issues.map((err) => err.message)

        // "message" es lo que muestra el front (apiRequest); "errors" trae la lista completa
        return res.status(400).json({ message: mensajes[0], errors: mensajes })
    }
}