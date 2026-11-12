// 1.7 · Los motivos de anulación y los problemas de una ronda se repiten en el frontend: deben tener las
// mismas claves que el backend (si se desincronizan, el select mandaría un motivo que el servidor rechaza).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MOTIVOS_ANULACION, PROBLEMAS_ITEM } from "./estadosComanda";

const backend = join(import.meta.dirname, "../../../../../backend/src/modulos");

describe("Catálogos de la comanda iguales a los del backend", () => {
  it("motivos de anulación (compartido/estadosSalon.js)", () => {
    const fuente = readFileSync(join(backend, "compartido/estadosSalon.js"), "utf8");
    const bloque = fuente.match(/export const MOTIVOS_ANULACION = \{([\s\S]*?)\}/)?.[1] ?? "";
    const claves = [...bloque.matchAll(/^\s*(\w+):/gm)].map((m) => m[1]);
    expect(claves.length).toBeGreaterThan(0);
    expect(Object.keys(MOTIVOS_ANULACION)).toEqual(claves);
  });

  it("problemas al enviar una ronda (salon/cuentas.service.js, revisarRonda)", () => {
    const fuente = readFileSync(join(backend, "salon/cuentas.service.js"), "utf8");
    const bloque = fuente.match(/const revisarRonda = [\s\S]*?const motivo = ([\s\S]*?): null/)?.[1] ?? "";
    const claves = [...bloque.matchAll(/'(\w+)'/g)].map((m) => m[1]);
    expect(claves.length).toBeGreaterThan(0);
    expect(Object.keys(PROBLEMAS_ITEM).sort()).toEqual([...claves].sort());
  });
});
