// Decisiones de acceso del frontend (0.15d): por permisos, nunca por el nombre del rol.
// El backend protege cada ruta con requirePermission; esto solo decide qué se muestra.
const permisosDe = (user) => user?.permisos || [];

export const tienePermiso = (user, clave) => {
  const permisos = permisosDe(user);
  return permisos.includes("*") || permisos.includes(clave);
};

// 1.7 · Lo mismo sobre una lista de permisos (plano y comanda reciben la lista, no el usuario)
export const incluyePermiso = (permisos = [], clave) => permisos.includes("*") || permisos.includes(clave);

// Panel de administración: el permiso comodín "*"
export const esAdministrador = (user) => permisosDe(user).includes("*");

// Personal sin "*" (mesero, cocina…): lo indica el backend con esPersonal,
// así un rol nuevo o sin permisos todavía no cae en el portal del cliente
export const esPersonal = (user) => Boolean(user?.esPersonal) && !esAdministrador(user);

// F1-19: el panel de sala (/staff) es del personal y también del administrador, que entra desde el
// admin para anular ítems (item:anular). Su inicio sigue siendo /admin.
export const puedeEntrarAStaff = (user) => esPersonal(user) || esAdministrador(user);

// 2.5 · Pantalla de cocina (/kds): personal con kds:ver y también el administrador
export const puedeEntrarAKds = (user) => puedeEntrarAStaff(user) && tienePermiso(user, "kds:ver");

export const rutaInicio = (user) => {
  if (esAdministrador(user)) return "/admin";
  // 2.5 · Cocina y barista (kds:ver sin mesa:ver) empiezan en el KDS; con los dos, /staff enlaza al KDS
  if (esPersonal(user) && tienePermiso(user, "kds:ver") && !tienePermiso(user, "mesa:ver")) return "/kds";
  if (esPersonal(user)) return "/staff";
  return "/cuenta";
};
