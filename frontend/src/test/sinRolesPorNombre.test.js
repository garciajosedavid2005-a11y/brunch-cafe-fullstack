// 0.15d: rutas y pantallas se deciden por permisos (src/utils/permisos.js), nunca comparando
// el nombre del rol del usuario. Igual que el test del backend que exige rutas /api/v1.
import { describe, it, expect } from "vitest";

const fuentes = import.meta.glob(["../**/*.{js,jsx}", "!../**/*.test.{js,jsx}", "!../test/**"], {
  query: "?raw",
  import: "default",
  eager: true,
});

const PATRONES = [
  { nombre: 'role === "…"', regex: /\brole\s*[!=]==?\s*["'`]/ },
  { nombre: '"…" === role', regex: /["'`]\s*[!=]==?\s*[\w?.]*\brole\b/ },
  { nombre: "[…].includes(role)", regex: /\.includes\(\s*[\w?.]*\brole\s*\)/ },
  { nombre: "switch (role)", regex: /switch\s*\(\s*[\w?.]*\brole\s*\)/ },
  { nombre: 'rol.nombre === "…"', regex: /\brol\??\.nombre\s*[!=]==?\s*["'`]/ },
];

describe("El frontend no decide por nombre de rol", () => {
  it("se revisan los archivos del frontend", () => {
    expect(Object.keys(fuentes).length).toBeGreaterThan(50);
  });

  it("ningún archivo compara el rol del usuario con un nombre", () => {
    const hallazgos = [];
    for (const [archivo, codigo] of Object.entries(fuentes)) {
      codigo.split("\n").forEach((linea, i) => {
        for (const { nombre, regex } of PATRONES) {
          if (regex.test(linea)) hallazgos.push(`${archivo}:${i + 1} (${nombre}) ${linea.trim()}`);
        }
      });
    }
    expect(hallazgos).toEqual([]);
  });
});
