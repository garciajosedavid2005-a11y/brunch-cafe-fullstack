export const manejarError = (res, error) => {
    // ID con formato inválido (ej. /api/productos/abc)
    if (error.name === 'CastError') {
        return res.status(400).json({ message: 'ID inválido' })
    }

    // Falló una validación del modelo (campo requerido, enum, min, max...)
    if (error.name === 'ValidationError') {
        const mensajes = Object.values(error.errors).map((e) => e.message)
        return res.status(400).json({ message: mensajes[0] })
    }

    // Valor duplicado en un campo único (ej. nombre de categoría repetido)
    if (error.code === 11000) {
        const campo = Object.keys(error.keyValue || {})[0] || 'valor'
        return res.status(400).json({ message: `Ya existe un registro con ese ${campo}` })
    }

    console.log(error)
    return res.status(500).json({ message: error.message })
}