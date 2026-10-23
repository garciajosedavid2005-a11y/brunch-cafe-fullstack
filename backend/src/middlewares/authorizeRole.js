export const authorizeRole = (...rolesPermitidos) => {
    return (req, res, next) => {
        if (!rolesPermitidos.includes(req.usuario.rol)) {
            return res.status(403).json({ message: "No tienes permiso para realizar esta accion" })
        }
        next()
    }
}