// 1.11 · Dirección colombiana: validación flexible, la MISMA en el backend y en el frontend.
// Este archivo y frontend/src/utils/direccion.js deben ser idénticos (un test del frontend lo comprueba):
// si cambias uno, copia el otro.
//
// Se aceptan tres formas:
// 1. Malla vial: [Av.] <vía> <número>[letra][ Bis[ letra]][ cardinal] <separador> <número>[letra] <- o espacio> <número>[ cardinal][ complemento]
//      vía: Carrera, Cra, Cr, Kr, Kra, Calle, Cl, Cll, Avenida, Av, Diagonal, Dg, Transversal, Tv, Tr, Ak, Ac (con punto opcional)
//      cardinal: Sur, Norte, Este, Oeste, Oriente, Occidente
//      separador: #, No., No, N°, Nº, N, Nro., Número
//      Ejemplos: «Cra 36b Oriente #30-06», «Calle 10 Sur # 43A-12», «Dg 25 Bis A No. 30-15 apto 301».
// 2. Avenida con nombre (1.14): Av. <nombre de 1 a 4 palabras> <separador> <número> - <número>[ cardinal][ complemento]
//      Ejemplos: «Av. El Dorado # 68-51», «Av. Boyacá # 12-30».
// 3. Manzana y casa o lote (1.14), con el barrio opcional antes o después:
//      Ejemplos: «Mz 5 Cs 3», «Manzana 5 Casa 3», «Barrio Las Palmas Mz 5 Cs 3», «Mz 5 Cs 3, Villa del Sol».

// «Av.» puede ir antes de otra vía: «Av. Calle 80 # 69-70», «Avenida Carrera 68 # 22-31»
const TIPO_VIA = String.raw`(?:carrera|cra|kra|cr|kr|calle|cll|cl|avenida|av|diagonal|dg|transversal|tv|tr|ak|ac)\.?`;
const AVENIDA = String.raw`(?:avenida|av)\.?`;
const VIA = String.raw`(?:${AVENIDA}\s*)?${TIPO_VIA}`;
const CARDINAL = String.raw`(?:sur|norte|este|oeste|oriente|occidente)`;
const LETRAS = String.raw`(?:\s?[a-z]{1,2})?`; // 36B, 6AB
const NUMERO = String.raw`\d{1,3}${LETRAS}(?:\s+bis(?:\s?[a-z])?)?`;
const SEPARADOR = String.raw`(?:#|n[°º]|no\.?|nro\.?|n[uú]mero|n)`;
const PLACA = String.raw`\d{1,3}${LETRAS}`;
const GUION = String.raw`(?:[-‐–—]|\s)`; // también el guion largo que ponen los autocorrectores
const COMPLEMENTO = String.raw`(?:[\s,]+\S.*)?`;
// Una palabra de un nombre propio: letras con tildes, sin dígitos («El», «Dorado», «Boyacá»)
const PALABRA = String.raw`[a-záéíóúüñ]+`;
// El nombre no empieza por un tipo de vía («Av. Calle # 80-10» es una malla vial sin número)
const NOMBRE_AVENIDA = String.raw`(?!${TIPO_VIA}(?:\s|$))${PALABRA}(?:\s+${PALABRA}){0,3}`;
// Tras «Av» va un punto o un espacio («Avanzan» no es una avenida) y, antes de un separador en
// letras, un espacio (la «n» final de «Colón» no es «N»)
const PREFIJO_AVENIDA = String.raw`(?:avenida|av)(?:\.\s*|\s+)`;
const SEPARADOR_AVENIDA = String.raw`(?:\s*#|\s+(?:n[°º]|no\.?|nro\.?|n[uú]mero|n))`;
const NUMERO_PREDIO = String.raw`\d{1,3}\s?[a-z]?`; // 5, 12B
const MANZANA = String.raw`(?:manzana|mza|mz)\.?`;
const CASA = String.raw`(?:casa|cs|lote|lt)\.?`;
// Barrio o conjunto antes de la manzana: «Barrio Las Palmas», «Urb. Los Almendros»
const SECTOR = String.raw`(?:(?:barrio|br|urbanizaci[oó]n|urb|conjunto|conj)\.?\s+${PALABRA}(?:\s+${PALABRA}){0,3},?\s+)?`;

const MALLA_VIAL = String.raw`${VIA}\s*${NUMERO}(?:\s+${CARDINAL})?\s*${SEPARADOR}\s*${NUMERO}\s*${GUION}\s*${PLACA}(?:\s+${CARDINAL})?`;
const AVENIDA_CON_NOMBRE = String.raw`${PREFIJO_AVENIDA}${NOMBRE_AVENIDA}${SEPARADOR_AVENIDA}\s*${NUMERO}\s*${GUION}\s*${PLACA}(?:\s+${CARDINAL})?`;
const MANZANA_CASA = String.raw`${SECTOR}${MANZANA}\s*${NUMERO_PREDIO}\s*${CASA}\s*${NUMERO_PREDIO}`;

export const DIRECCION_REGEX = new RegExp(
  String.raw`^(?:${MALLA_VIAL}|${AVENIDA_CON_NOMBRE}|${MANZANA_CASA})${COMPLEMENTO}$`,
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
