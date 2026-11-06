// Regresión: el frontend no usa alert/confirm/prompt del navegador ("localhost dice...")
import { describe, it, expect } from "vitest";

const fuentes = import.meta.glob(["../**/*.{js,jsx}", "!../**/*.test.{js,jsx}", "!./**"], { query: "?raw", import: "default", eager: true });

describe("Sin diálogos nativos", () => {
  it("ningún archivo llama a alert(), confirm() ni prompt()", () => {
    const usos = Object.entries(fuentes).flatMap(([archivo, codigo]) =>
      codigo.split("\n")
        .map((linea, i) => ({ archivo, linea: i + 1, texto: linea.trim() }))
        .filter(({ texto }) => /(^|[^.\w])(window\.)?(alert|confirm|prompt)\s*\(/.test(texto) && !texto.startsWith("//"))
    );
    expect(Object.keys(fuentes).length).toBeGreaterThan(20);
    expect(usos.map((u) => `${u.archivo}:${u.linea}`)).toEqual([]);
  });
});
