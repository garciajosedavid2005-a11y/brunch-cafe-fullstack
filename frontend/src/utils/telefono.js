// Misma regla que el backend (schema/comunes.js): 7–30 caracteres de dígitos, espacios,
// +, ( ) o -, con al menos 7 dígitos.
export const MENSAJE_TELEFONO = "Ingresa un teléfono válido (7 a 30 dígitos).";
export const esTelefono = (valor) =>
  /^[\d+\s()-]{7,30}$/.test(valor) && (valor.match(/\d/g) || []).length >= 7;
