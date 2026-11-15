import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const estado = vi.hoisted(() => ({ apiRequest: vi.fn(), confirmar: vi.fn() }));
vi.mock("../../../services/api", () => ({ apiRequest: estado.apiRequest }));
vi.mock("../../../context/useDialogo", () => ({ useDialogo: () => ({ confirmar: estado.confirmar, avisar: vi.fn() }) }));

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

describe("4.3 · Agenda: hoy, próximas y acciones", () => {
  // Hoy es 2026-11-20 a las 8:20 a. m. en Bogotá
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-20T13:20:00Z") });
    estado.apiRequest.mockReset();
    estado.confirmar.mockReset();
    estado.apiRequest.mockImplementation((ruta) => (ruta === "/v1/staff/salon/mesas" ? Promise.resolve(PLANO) : Promise.resolve({})));
  });
  afterEach(() => vi.useRealTimers());
  const hoy = (hora, extra = {}) => ({ ...RESERVA, id: `h${hora}`, codigo: `RES-H${hora.slice(0, 2)}`, hora, inicio: `2026-11-20T${String(Number(hora.slice(0, 2)) + 5).padStart(2, "0")}:00:00Z`, ...extra });

  it("agrupa en Hoy (en orden de hora), Próximas y Anteriores", () => {
    const reservas = [
      { ...RESERVA, id: "f", codigo: "RES-FUT", fecha: "2026-11-25T12:00:00Z", inicio: "2026-11-25T14:00:00Z" },
      hoy("10:00"), hoy("08:00"),
      { ...RESERVA, id: "p", codigo: "RES-PAS", fecha: "2026-11-10T12:00:00Z", inicio: "2026-11-10T14:00:00Z", estado: "Completada", estadoCodigo: "completada" },
    ];
    render(<AgendaReservas reservas={reservas} onCambio={vi.fn()} />);
    const hoySec = screen.getByRole("region", { name: /^Hoy/ });
    expect(within(hoySec).getAllByText(/RES-H/).map((n) => n.textContent)).toEqual(["RES-H08", "RES-H10"]);
    expect(within(screen.getByRole("region", { name: /^Próximas/ })).getByText("RES-FUT")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: /^Anteriores/ })).getByText("RES-PAS")).toBeInTheDocument();
  });

  it("«Sentar» (hoy, con mesa) y «Confirmar» (pendiente) llaman al backend", async () => {
    const onCambio = vi.fn();
    render(<AgendaReservas reservas={[hoy("09:00", { mesa: { id: "m1", numero: 1, capacidad: 4 } }), hoy("10:00", { estado: "Pendiente", estadoCodigo: "pendiente" })]}
      puedeGestionar puedeSentar onCambio={onCambio} />);
    fireEvent.click(screen.getByRole("button", { name: "Sentar a Lucía Pérez (RES-H09)" }));
    await waitFor(() => expect(estado.apiRequest).toHaveBeenCalledWith("/v1/staff/reservas/h09:00/sentar", expect.objectContaining({ method: "POST" })));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar RES-H10" }));
    await waitFor(() => expect(estado.apiRequest).toHaveBeenCalledWith("/v1/staff/reservas/h10:00/estado", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ codigo: "confirmada" }) })));
    await waitFor(() => expect(onCambio).toHaveBeenCalledTimes(2));
    // Sin mesa no se ofrece «Sentar»
    expect(screen.queryByRole("button", { name: /Sentar a Lucía Pérez \(RES-H10\)/ })).toBeNull();
  });

  it("a los 15 min de retraso sugiere «No llegó» (texto, no solo color) y lo marca tras confirmar", async () => {
    estado.confirmar.mockResolvedValue({ confirmado: true });
    render(<AgendaReservas reservas={[hoy("08:00"), hoy("09:00")]} puedeGestionar onCambio={vi.fn()} />);
    expect(screen.getByText("Retrasada 20 min")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^No llegó/ })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "No llegó RES-H08" }));
    await waitFor(() => expect(estado.apiRequest).toHaveBeenCalledWith("/v1/staff/reservas/h08:00/estado", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ codigo: "no_show" }) })));
  });
});
