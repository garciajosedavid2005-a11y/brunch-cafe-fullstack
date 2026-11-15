import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const estado = vi.hoisted(() => ({ apiRequest: vi.fn() }));
vi.mock("../../../services/api", () => ({ apiRequest: estado.apiRequest }));

import AgendaReservas from "./AgendaReservas";

const RESERVA = {
  id: "r1", codigo: "RES-000001", cliente: "Lucía Pérez", telefono: "3001234567", personas: 3,
  fecha: "2026-11-20T12:00:00Z", hora: "09:00", inicio: "2026-11-20T14:00:00Z", estado: "Confirmada", estadoCodigo: "confirmada", mesa: null,
};
const PLANO = { zonas: [{ id: "z1", nombre: "Interior" }], mesas: [
  { id: "m1", numero: 1, zona: "z1", capacidad: 4, estado: "libre" },
  { id: "m2", numero: 2, zona: "z1", capacidad: 2, estado: "libre" },
] };

describe("4.1 · Mesa de la reserva en la agenda", () => {
  beforeEach(() => {
    estado.apiRequest.mockReset();
    estado.apiRequest.mockImplementation((ruta) => {
      if (ruta === "/v1/staff/salon/mesas") return Promise.resolve(PLANO);
      if (ruta === "/v1/staff/reservas/r1/mesa") return Promise.resolve({ id: "r1", mesa: { id: "m1", numero: 1, capacidad: 4 } });
      return Promise.reject(new Error(`Ruta inesperada: ${ruta}`));
    });
  });

  it("asigna una mesa: solo ofrece las que caben y envía el PATCH", async () => {
    const onCambio = vi.fn();
    render(<AgendaReservas reservas={[RESERVA]} puedeAsignar onCambio={onCambio} />);
    const selector = await screen.findByRole("combobox", { name: "Mesa de la reserva RES-000001" });
    await waitFor(() => expect(screen.getByRole("option", { name: /Mesa 1 · 4 personas/ })).toBeInTheDocument());
    expect(screen.getByRole("option", { name: /Mesa 2 · 2 personas/ })).toBeDisabled();
    fireEvent.change(selector, { target: { value: "m1" } });
    await waitFor(() => expect(estado.apiRequest).toHaveBeenCalledWith("/v1/staff/reservas/r1/mesa", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ mesaId: "m1" }) })));
    await waitFor(() => expect(onCambio).toHaveBeenCalled());
  });

  it("muestra el error del backend (choque de horario) junto a la reserva", async () => {
    estado.apiRequest.mockImplementation((ruta) => ruta === "/v1/staff/salon/mesas"
      ? Promise.resolve(PLANO)
      : Promise.reject(new Error("La mesa 1 ya está reservada a las 9:00 a. m.")));
    render(<AgendaReservas reservas={[RESERVA]} puedeAsignar onCambio={vi.fn()} />);
    const selector = await screen.findByRole("combobox", { name: "Mesa de la reserva RES-000001" });
    await waitFor(() => expect(screen.getByRole("option", { name: /Mesa 1/ })).toBeInTheDocument());
    fireEvent.change(selector, { target: { value: "m1" } });
    expect(await screen.findByRole("alert")).toHaveTextContent("ya está reservada");
  });

  it("sin permiso para asignar (o con la reserva cerrada) solo muestra la mesa", () => {
    render(<AgendaReservas reservas={[{ ...RESERVA, mesa: { id: "m1", numero: 1, capacidad: 4 } }]} puedeAsignar={false} onCambio={vi.fn()} />);
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.getByText("Mesa 1")).toBeInTheDocument();
    expect(estado.apiRequest).not.toHaveBeenCalled();
  });
});
