// 0.8: el frontend solo llama a /api/v1. Las rutas anteriores quedan como alias
// deprecados en el backend y se retiran en 0.12.
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

const SRC = join(import.meta.dirname, "..");
const fuentes = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? fuentes(join(dir, e.name))
    : /\.(jsx?|mjs)$/.test(e.name) && !/\.test\./.test(e.name) ? [join(dir, e.name)] : []
);
// apiRequest("/x"), api.get(`/x`), adminApi.patch('/x'), useAdminResource("/x")
const LLAMADA = /(?:apiRequest|(?:adminApi|api)\.(?:get|post|put|patch|delete)|useAdminResource)\(\s*["'`](\/[^"'`]*)/g;

describe("Rutas de la API en el frontend", () => {
  it("todas las llamadas usan /v1/", () => {
    const llamadas = fuentes(SRC).flatMap((archivo) =>
      [...readFileSync(archivo, "utf8").matchAll(LLAMADA)].map((m) => `${relative(SRC, archivo).split(sep).join("/")}: ${m[1]}`)
    );
    expect(llamadas.length).toBeGreaterThan(20);
    expect(llamadas.filter((l) => !l.split(": ")[1].startsWith("/v1/"))).toEqual([]);
  });
});
