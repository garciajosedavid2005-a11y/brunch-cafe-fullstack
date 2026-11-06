import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";

vi.mock("../../services/api", () => ({ apiRequest: vi.fn() }));
vi.mock("@emailjs/browser", () => ({ default: { send: vi.fn() } }));
vi.mock("../../context/useAuth", () => ({
  useAuth: () => ({ user: { id: "u1", nombre: "Ana", apellido: "Pérez", email: "ana@example.com", telefono: "3001234567" } }),
}));

import { apiRequest } from "../../services/api";
import { reiniciarHorarios } from "../../hooks/useHorarios";
import FormularioReservas from "./FormularioReservas";

const HORARIOS = {
  domicilio: { desde: "08:00", hasta: "16:00", anticipacionMinutos: 60 },
  reservas: { entreSemana: { desde: "08:00", hasta: "19:00" }, finDeSemana: { desde: "08:00", hasta: "17:00" } },
};

describe("Formulario de reservas: horas del horario configurado", () => {
  beforeEach(() => {
    reiniciarHorarios();
    apiRequest.mockReset();
    apiRequest.mockResolvedValue({ horarios: HORARIOS });
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-05T10:15:00-05:00") }); // jueves
  });
  afterEach(() => vi.useRealTimers());

  const horasPara = async (fecha) => {
    render(<FormularioReservas />);
    fireEvent.change(screen.getByLabelText(/fecha/i), { target: { value: fecha } });
    const selector = screen.getByLabelText(/hora/i);
    return (await within(selector).findAllByRole("option", { name: /m\./ })).map((o) => o.value);
  };

  it("entre semana de 8:00 a 19:00, en punto", async () => {
    const horas = await horasPara("2026-11-12");
    expect(horas[0]).toBe("08:00");
    expect(horas.at(-1)).toBe("19:00");
    expect(horas.every((h) => h.endsWith(":00"))).toBe(true);
  });

  it("sábado hasta las 17:00", async () => {
    expect((await horasPara("2026-11-14")).at(-1)).toBe("17:00");
  });

  it("hoy no ofrece horas que ya pasaron", async () => {
    expect((await horasPara("2026-11-05"))[0]).toBe("11:00");
  });

  it("muestra el horario configurado y pide el teléfono (prellenado)", async () => {
    render(<FormularioReservas />);
    expect((await screen.findByText(/lunes a viernes/i)).textContent.replace(/\s/g, " ")).toMatch(/8:00 a. m. a 7:00 p. m./);
    expect(screen.getByLabelText(/teléfono/i)).toHaveValue("3001234567");
  });
});
