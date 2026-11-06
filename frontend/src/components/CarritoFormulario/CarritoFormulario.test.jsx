import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { DialogoProvider } from "../../context/DialogoContext";

vi.mock("../../services/api", () => ({ apiRequest: vi.fn() }));
vi.mock("../../context/useAuth", () => ({
  useAuth: () => ({ user: { id: "u1", nombre: "Ana", apellido: "Pérez", email: "ana@example.com", telefono: "300 123 4567" } }),
}));
vi.mock("../../context/CarritoContext", () => ({
  useCarrito: () => ({ calcularTotal: () => 9000, limpiarCarrito: vi.fn(), productos: [{ id: 1, cantidad: 1 }] }),
}));

import { apiRequest } from "../../services/api";
import { reiniciarHorarios } from "../../hooks/useHorarios";
import CarritoFormulario from "./CarritoFormulario";

const HORARIOS = {
  domicilio: { desde: "08:00", hasta: "16:00", anticipacionMinutos: 60 },
  reservas: { entreSemana: { desde: "08:00", hasta: "19:00" }, finDeSemana: { desde: "08:00", hasta: "17:00" } },
};

const montar = () => render(<MemoryRouter><DialogoProvider><CarritoFormulario /></DialogoProvider></MemoryRouter>);

describe("Checkout: hora de entrega y teléfono", () => {
  beforeEach(() => {
    reiniciarHorarios();
    apiRequest.mockReset();
    apiRequest.mockImplementation((ruta) => Promise.resolve(
      ruta === "/v1/horarios" ? { horarios: HORARIOS } : [{ id: "m1", nombre: "Contra entrega", descripcion: "" }],
    ));
  });
  afterEach(() => vi.useRealTimers());

  it("solo ofrece horas en punto de hoy con 1 h de anticipación (sin selector de minutos)", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-05T07:30:00-05:00") });
    const { container } = montar();
    const selector = await screen.findByLabelText(/hora de entrega/i);
    expect(container.querySelector('input[type="time"]')).toBeNull();
    const opciones = await within(selector).findAllByRole("option", { name: /m\./ });
    expect(opciones.map((o) => o.value)).toEqual(["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00"]);
  });

  it("si ya no quedan horas hoy lo dice y no deja elegir", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-05T15:30:00-05:00") });
    montar();
    expect(await screen.findByText(/hoy ya no hay horarios de domicilio/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/hora de entrega/i)).toBeDisabled();
  });

  it("el teléfono viene prellenado con el del perfil y se puede editar", async () => {
    montar();
    expect(await screen.findByLabelText(/teléfono de contacto/i)).toHaveValue("300 123 4567");
  });
});
