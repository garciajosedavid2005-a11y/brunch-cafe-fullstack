import { describe, expect, it } from "vitest";
import { textoCambioReserva } from "./avisoReserva";

// 4.5 · Texto del aviso en vivo cuando un cliente edita su reserva confirmada (F4-7)
const ANTES = { id: "r1", codigo: "RES-00000A", cliente: "Laura Gómez", fecha: "2026-11-20T12:00:00Z", hora: "08:00", personas: 2, mesa: { id: "m2", numero: 2 }, estadoCodigo: "confirmada" };

describe("4.5 · textoCambioReserva", () => {
  it("dice quién, qué reserva y qué cambió (hora, personas, mesa y estado)", () => {
    const despues = { ...ANTES, hora: "09:00", personas: 4, mesa: null, estadoCodigo: "pendiente" };
    expect(textoCambioReserva(ANTES, despues)).toBe(
      "Laura Gómez cambió su reserva RES-00000A: hora 8:00 a. m. → 9:00 a. m.; 2 → 4 personas; ya no tiene la mesa 2 (no cabe); vuelve a estar pendiente de confirmar.",
    );
  });

  it("con otra fecha lo dice; sin datos anteriores, solo que cambió", () => {
    expect(textoCambioReserva(ANTES, { ...ANTES, fecha: "2026-11-21T12:00:00Z", estadoCodigo: "pendiente" }))
      .toMatch(/^Laura Gómez cambió su reserva RES-00000A: fecha 20 de noviembre → 21 de noviembre; vuelve a estar pendiente de confirmar\.$/);
    expect(textoCambioReserva(null, { ...ANTES, estadoCodigo: "pendiente" })).toBe("Laura Gómez cambió su reserva RES-00000A (8:00 a. m.).");
  });

  it("termina sin doble punto tras «a. m.» y dice «pendiente» aunque la agenda anterior ya la tuviera así", () => {
    const antes = { ...ANTES, estadoCodigo: "pendiente" };
    expect(textoCambioReserva(antes, { ...antes, hora: "11:00" })).toBe("Laura Gómez cambió su reserva RES-00000A: hora 8:00 a. m. → 11:00 a. m.; vuelve a estar pendiente de confirmar.");
    expect(textoCambioReserva({ ...ANTES, hora: "10:00" }, { ...ANTES, hora: "11:00" })).toBe("Laura Gómez cambió su reserva RES-00000A: hora 10:00 a. m. → 11:00 a. m.");
  });

  it("sin cambios visibles (solo observaciones) lo dice igual", () => {
    expect(textoCambioReserva(ANTES, { ...ANTES })).toBe("Laura Gómez cambió su reserva RES-00000A (sin cambios de fecha, hora ni personas).");
  });
});
