import { describe, it, expect } from "vitest";
import { horasEnPunto, horasReserva, horasDomicilio, textoRango, opcionesDeHora } from "./horarios";

// Los mismos valores que siembra el backend (decisión 15)
const HORARIOS = {
  domicilio: { desde: "08:00", hasta: "16:00", anticipacionMinutos: 60 },
  reservas: { entreSemana: { desde: "08:00", hasta: "19:00" }, finDeSemana: { desde: "08:00", hasta: "17:00" } },
};
const enBogota = (hora, dia = "05") => new Date(`2026-11-${dia}T${hora}:00-05:00`);

describe("Horarios en el frontend (mismas reglas que el backend)", () => {
  it("horas en punto con ambos extremos", () => {
    expect(horasEnPunto({ desde: "08:00", hasta: "10:00" })).toEqual(["08:00", "09:00", "10:00"]);
  });

  it("reservas: L-V hasta las 19:00, S-D hasta las 17:00; hoy sin horas pasadas", () => {
    const ahora = enBogota("10:15"); // jueves 5
    expect(horasReserva(HORARIOS, "2026-11-12", ahora).at(-1)).toBe("19:00");
    expect(horasReserva(HORARIOS, "2026-11-14", ahora).at(-1)).toBe("17:00");
    expect(horasReserva(HORARIOS, "2026-11-05", ahora)[0]).toBe("11:00");
    expect(horasReserva(HORARIOS, "2026-11-04", ahora)).toEqual([]);
    expect(horasReserva(HORARIOS, "", ahora)).toEqual([]);
  });

  it("domicilio: hoy, 08–16 y con 1 h de anticipación (aunque el navegador esté en otra zona)", () => {
    expect(horasDomicilio(HORARIOS, enBogota("07:30"))[0]).toBe("09:00");
    expect(horasDomicilio(HORARIOS, enBogota("14:00"))).toEqual(["15:00", "16:00"]);
    expect(horasDomicilio(HORARIOS, enBogota("15:30"))).toEqual([]);
    expect(horasDomicilio(null, enBogota("07:30"))).toEqual([]);
  });

  it("textos para mostrar", () => {
    expect(textoRango({ desde: "08:00", hasta: "19:00" }).replace(/\s/g, " ")).toBe("8:00 a. m. a 7:00 p. m.");
    expect(opcionesDeHora(["09:00", "13:00"]).map((o) => o.etiqueta.replace(/\s/g, " "))).toEqual(["9:00 a. m.", "1:00 p. m."]);
  });
});
