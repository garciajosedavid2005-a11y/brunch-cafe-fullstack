// 1.11 · Dirección colombiana: validación flexible, la MISMA en el backend y en el frontend.
// Este archivo y frontend/src/utils/direccion.js deben ser idénticos (un test del frontend lo comprueba):
// si cambias uno, copia el otro.
//
// Forma: [Av.] <vía> <número>[letra][ Bis[ letra]][ cardinal] <separador> <número>[letra] <- o espacio> <número>[ cardinal][ complemento]
//   vía: Carrera, Cra, Cr, Kr, Kra, Calle, Cl, Cll, Avenida, Av, Diagonal, Dg, Transversal, Tv, Tr, Ak, Ac (con punto opcional)
//   cardinal: Sur, Norte, Este, Oeste, Oriente, Occidente
//   separador: #, No., No, N°, Nº, N, Nro., Número
// Ejemplos: «Cra 36b Oriente #30-06», «Calle 10 Sur # 43A-12», «Dg 25 Bis A No. 30-15 apto 301».

// «Av.» puede ir antes de otra vía: «Av. Calle 80 # 69-70», «Avenida Carrera 68 # 22-31»
const TIPO_VIA = String.raw`(?:carrera|cra|kra|cr|kr|calle|cll|cl|avenida|av|diagonal|dg|transversal|tv|tr|ak|ac)\.?`;
const VIA = String.raw`(?:(?:avenida|av)\.?\s*)?${TIPO_VIA}`;
const CARDINAL = String.raw`(?:sur|norte|este|oeste|oriente|occidente)`;
const LETRAS = String.raw`(?:\s?[a-z]{1,2})?`; // 36B, 6AB
const NUMERO = String.raw`\d{1,3}${LETRAS}(?:\s+bis(?:\s?[a-z])?)?`;
const SEPARADOR = String.raw`(?:#|n[°º]|no\.?|nro\.?|n[uú]mero|n)`;
const PLACA = String.raw`\d{1,3}${LETRAS}`;
const GUION = String.raw`(?:[-‐–—]|\s)`; // también el guion largo que ponen los autocorrectores
const COMPLEMENTO = String.raw`(?:[\s,]+\S.*)?`;

export const DIRECCION_REGEX = new RegExp(
  String.raw`^${VIA}\s*${NUMERO}(?:\s+${CARDINAL})?\s*${SEPARADOR}\s*${NUMERO}\s*${GUION}\s*${PLACA}(?:\s+${CARDINAL})?${COMPLEMENTO}$`,
  "i",
);

export const DIRECCION_MIN = 8;
export const DIRECCION_MAX = 60;
export const MENSAJE_DIRECCION = "Ingresa una dirección válida. Ejemplo: Cra 36B Oriente #30-06.";

/** Sin espacios de más (al principio, al final ni repetidos). */
export const normalizarDireccion = (texto = "") => String(texto).trim().replace(/\s+/g, " ");

export const esDireccionValida = (texto) => {
  const direccion = normalizarDireccion(texto);
  return direccion.length >= DIRECCION_MIN && direccion.length <= DIRECCION_MAX && DIRECCION_REGEX.test(direccion);
};
