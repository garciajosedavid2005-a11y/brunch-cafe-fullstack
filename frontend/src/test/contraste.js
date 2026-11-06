// Contraste WCAG entre dos colores hex (#rgb o #rrggbb) y lectura de variables CSS.

const aRgb = (hex) => {
  const limpio = hex.replace("#", "");
  const completo = limpio.length === 3 ? [...limpio].map((c) => c + c).join("") : limpio;
  return [0, 2, 4].map((i) => parseInt(completo.slice(i, i + 2), 16));
};

const luminancia = (hex) => {
  const [r, g, b] = aRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

export const contraste = (a, b) => {
  const [claro, oscuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (claro + 0.05) / (oscuro + 0.05);
};

// { "--color-fondo": "#F7E7E2", ... } a partir del texto de variables.css
export const variablesCss = (css) =>
  Object.fromEntries([...css.matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{3,6})\b/g)].map((m) => [m[1], m[2]]));

// Resuelve "var(--x)" o un hex literal
export const resolverColor = (valor, variables) => {
  const v = valor.trim().replace(/\s*!important$/, "");
  const ref = v.match(/^var\((--[\w-]+)\)$/);
  return ref ? variables[ref[1]] : v;
};
