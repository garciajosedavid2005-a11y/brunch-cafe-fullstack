// Decisiones de acceso del frontend (0.15d): por permisos, nunca por el nombre del rol.
// El backend protege cada ruta con requirePermission; esto solo decide qué se muestra.
const permisosDe = (user) => user?.permisos || [];

export const tienePermiso = (user, clave) => {
  const permisos = permisosDe(user);
  return permisos.includes("*") || permisos.includes(clave);
};

// 1.7 · Lo mismo sobre una lista de permisos (plano y comanda reciben la lista, no el usuario)
export const incluyePermiso = (permisos = [], clave) => permisos.includes("*") || permisos.includes(clave);

// 6.3 (F6-3) · En una cuenta para llevar, `cuenta:para_llevar` permite tomar, enviar, pasar a caja, cancelar y entregar
// (el backend aplica la misma regla en permisos.js). En el salón no suma nada
export const PERMISOS_EN_PARA_LLEVAR = ["cuenta:ver", "cuenta:abrir", "comanda:tomar", "comanda:enviar", "cuenta:solicitar", "item:servir"];
export const permisosEnCuenta = (permisos = [], canal) =>
  canal === "para_llevar" && permisos.includes("cuenta:para_llevar") ? [...new Set([...permisos, ...PERMISOS_EN_PARA_LLEVAR])] : permisos;

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

// Fase 5 (F5-b) · Pantalla de inventario: cualquiera de estos permisos (cada pestaña pide el suyo)
export const PERMISOS_INVENTARIO = ["inventario:ver", "inventario:gestionar", "inventario:ajustar", "compra:gestionar", "compra:recibir"];
export const puedeVerInventario = (permisos = []) => PERMISOS_INVENTARIO.some((p) => incluyePermiso(permisos, p));

export const rutaInicio = (user) => {
  if (esAdministrador(user)) return "/admin";
  // 2.5 · Cocina y barista (kds:ver sin mesa:ver) empiezan en el KDS; con los dos, /staff enlaza al KDS
  if (esPersonal(user) && tienePermiso(user, "kds:ver") && !tienePermiso(user, "mesa:ver")) return "/kds";
  if (esPersonal(user)) return "/staff";
  return "/cuenta";
};
