// Analiza CSS y devuelve los selectores "globales": los que no tienen ninguna
// clase, id ni atributo (p. ej. `span`, `ul li`, `*`, `h1, h2`).
// Lo usan el test cssSinFugas y la auditoría manual.

// Quita comentarios y devuelve [{ selector, linea }] de cada regla (también dentro de @media)
export const reglasCss = (css) => {
  const sinComentarios = css.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " "));
  const reglas = [];
  let buffer = "";
  let inicioBuffer = 0;
  let linea = 1;
  for (const caracter of sinComentarios) {
    if (caracter === "\n") linea += 1;
    if (caracter === "{") {
      const texto = buffer.trim();
      if (texto && !texto.startsWith("@")) {
        for (const selector of texto.split(",")) reglas.push({ selector: selector.trim(), linea: inicioBuffer });
      }
      buffer = "";
      continue;
    }
    if (caracter === "}" || caracter === ";") {
      buffer = "";
      continue;
    }
    if (!buffer.trim()) inicioBuffer = linea;
    buffer += caracter;
  }
  return reglas;
};

// Selectores que no son de elementos (keyframes: from, to, 50%)
const ES_KEYFRAME = /^(from|to|\d+(\.\d+)?%)$/;

export const esSelectorGlobal = ({ selector }) =>
  Boolean(selector) && !ES_KEYFRAME.test(selector) && !/[.#[]/.test(selector);
