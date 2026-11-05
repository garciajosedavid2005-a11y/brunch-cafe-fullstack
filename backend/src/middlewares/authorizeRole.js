// DEPRECADO (0.4): reemplazado por requirePermission. Sin uso; se propone eliminar en 0.12.
export const authorizeRole = (...rolesPermitidos) => {
    return (req, res, next) => {
        if (!rolesPermitidos.includes(req.usuario.rol)) {
            return res.status(403).json({ message: "No tienes permiso para realizar esta accion" })
        }
        next()
    }
}