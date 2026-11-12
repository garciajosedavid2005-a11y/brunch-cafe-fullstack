import { formatearCOP } from "../../../utils/moneda";

// 1.7 · Textos de la toma de comanda. Los códigos son los del backend (compartido/estadosSalon.js).
export const BASE = "/v1/staff/salon";

export { incluyePermiso as puede } from "../../../utils/permisos";

// Estados del ítem (1.4): el KDS de la Fase 2 moverá en_preparacion → listo → servido
export const ESTADOS_ITEM = {
  borrador: "Sin enviar",
  enviado: "Enviado",
  en_preparacion: "En preparación",
  listo: "Listo",
  servido: "Servido",
  anulado: "Anulado",
};
export const ANULABLES = ["enviado", "en_preparacion", "listo"]; // D1: servido no

// Catálogo de motivos de anulación (D1). Mismas claves que MOTIVOS_ANULACION del backend.
export const MOTIVOS_ANULACION = {
  error_toma: "Error de toma",
  cliente_cambio: "El cliente cambió el pedido",
  producto_defectuoso: "Producto defectuoso",
  demora: "Demora",
  otro: "Otro",
};

// Motivos con los que el backend rechaza una ronda (PRODUCT_UNAVAILABLE, D3)
export const PROBLEMAS_ITEM = {
  producto_agotado: "agotado",
  producto_eliminado: "ya no está en el menú",
  opcion_agotada: "una opción elegida se agotó",
  sin_estacion: "sin estación de preparación",
};

export const ESTADOS_CUENTA = {
  abierta: "Abierta",
  cuenta_pedida: "Cuenta pedida",
  cerrada: "Cerrada",
  cerrada_sin_cobro: "Cerrada sin cobro",
  cancelada: "Cancelada",
};
export const CUENTA_EDITABLE = ["abierta", "cuenta_pedida"];

export const MAX_CANTIDAD = 50;
export const MAX_NOTA = 140;

/** «Tamaño: Grande (+ $ 3.000) · Extras: Tocineta, Aguacate» a partir de los modificadores de un ítem. */
export const textoModificadores = (modificadores = []) => {
  const grupos = new Map();
  for (const m of modificadores) {
    const opcion = m.precioExtra > 0 ? `${m.opcion} (+ ${formatearCOP(m.precioExtra)})` : m.opcion;
    grupos.set(m.grupo, [...(grupos.get(m.grupo) || []), opcion]);
  }
  return [...grupos].map(([grupo, opciones]) => `${grupo}: ${opciones.join(", ")}`).join(" · ");
};

/** Regla de un grupo en palabras: «obligatorio, elige 1», «opcional, hasta 2»… */
export const reglaGrupo = (g) => {
  const tipo = g.obligatorio ? "obligatorio" : "opcional";
  if (g.max === 1) return `${tipo}, elige 1`;
  if (g.min > 0) return `${tipo}, elige de ${g.min} a ${g.max}`;
  return `${tipo}, hasta ${g.max}`;
};
