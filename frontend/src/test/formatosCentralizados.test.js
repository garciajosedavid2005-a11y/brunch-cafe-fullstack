// 0.15f: precios y fechas se formatean solo en utils/moneda.js y utils/fechas.js
// (COP enteros y hora de America/Bogota en un único sitio).
import { describe, it, expect } from "vitest";

const fuentes = import.meta.glob(["../**/*.{js,jsx}", "!../**/*.test.{js,jsx}", "!../test/**"], {
  query: "?raw",
  import: "default",
  eager: true,
});

const PERMITIDOS = ["../utils/moneda.js", "../utils/fechas.js"];

describe("Formatos de moneda y fecha centralizados", () => {
  it("ningún archivo fuera de utils/moneda.js y utils/fechas.js crea un Intl.NumberFormat o Intl.DateTimeFormat", () => {
    const hallazgos = Object.entries(fuentes)
      .filter(([archivo]) => !PERMITIDOS.includes(archivo))
      .flatMap(([archivo, codigo]) => codigo.split("\n")
        .map((linea, i) => [linea, i])
        .filter(([linea]) => /new\s+Intl\.(NumberFormat|DateTimeFormat)\b/.test(linea))
        .map(([linea, i]) => `${archivo}:${i + 1} ${linea.trim()}`));
    expect(hallazgos).toEqual([]);
  });
});
