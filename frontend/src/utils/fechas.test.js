import { describe, it, expect, vi, afterEach } from "vitest";
import {
  ZONA_HORARIA, formatearFecha, formatearHora, formatearFechaCalendario, formatearHoraTexto, fechaLocal, hoyLocal,
} from "./fechas";

const normal = (t) => t.replace(/\s/g, " ");
afterEach(() => vi.useRealTimers());

describe("Fechas en el frontend (America/Bogota)", () => {
  // 22:30 del 5 de noviembre en Bogotá; en UTC ya es el 6
  const casiMedianoche = "2026-11-06T03:30:00.000Z";

  it("usa la zona del negocio", () => {
    expect(ZONA_HORARIA).toBe("America/Bogota");
  });

  it("los instantes se muestran en hora de Bogotá, sin depender de la zona del navegador", () => {
    expect(formatearFecha(casiMedianoche)).toBe("5/11/2026");
    expect(formatearFecha(casiMedianoche, "long")).toBe("5 de noviembre de 2026");
    expect(normal(formatearHora(casiMedianoche))).toBe("10:30 p. m.");
    expect(fechaLocal(casiMedianoche)).toBe("2026-11-05");
  });

  it("las fechas de calendario (reservas) no se corren de día", () => {
    expect(formatearFechaCalendario("2026-12-01")).toBe("1/12/2026");
    expect(formatearFechaCalendario("2026-12-01T12:00:00.000Z", "long")).toBe("1 de diciembre de 2026");
  });

  it("las horas en texto (HH:mm) se muestran en formato de 12 h", () => {
    expect(normal(formatearHoraTexto("08:00"))).toBe("8:00 a. m.");
    expect(normal(formatearHoraTexto("16:30"))).toBe("4:30 p. m.");
    expect(formatearHoraTexto("x")).toBe("x");
  });

  it('"hoy" es el día de Bogotá', () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date(casiMedianoche) });
    expect(hoyLocal()).toBe("2026-11-05");
  });

  it("valores vacíos o inválidos → texto vacío", () => {
    expect(formatearFecha("no")).toBe("");
    expect(formatearHora(undefined)).toBe("");
    expect(formatearFechaCalendario("")).toBe("");
  });
});
