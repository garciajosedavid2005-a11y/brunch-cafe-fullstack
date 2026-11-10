// Decisiones de acceso del frontend (0.15d): por permisos, nunca por el nombre del rol.
// El backend protege cada ruta con requirePermission; esto solo decide qué se muestra.
const permisosDe = (user) => user?.permisos || [];

export const tienePermiso = (user, clave) => {
  const permisos = permisosDe(user);
  return permisos.includes("*") || permisos.includes(clave);
};

// Panel de administración: el permiso comodín "*"
export const esAdministrador = (user) => permisosDe(user).includes("*");

// Personal sin "*" (mesero, cocina…): lo indica el backend con esPersonal,
// así un rol nuevo o sin permisos todavía no cae en el portal del cliente
export const esPersonal = (user) => Boolean(user?.esPersonal) && !esAdministrador(user);

export const rutaInicio = (user) => {
  if (esAdministrador(user)) return "/admin";
  if (esPersonal(user)) return "/staff";
  return "/cuenta";
};
