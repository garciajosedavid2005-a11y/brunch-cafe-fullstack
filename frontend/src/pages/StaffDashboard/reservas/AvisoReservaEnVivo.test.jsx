import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const estado = vi.hoisted(() => ({ apiRequest: vi.fn(), usuario: null }));
vi.mock("../../../services/api", () => ({ apiRequest: estado.apiRequest, API_URL: "http://api" }));
vi.mock("../../../context/useAuth", () => ({ useAuth: () => ({ user: estado.usuario, logout: vi.fn() }) }));

import StaffDashboard from "../StaffDashboard";
import { DialogoProvider } from "../../../context/DialogoContext";

// 4.5 (F4-7) · Un cliente edita su reserva confirmada: el staff recibe el aviso por el canal «reservas» y la
// pantalla dice qué cambió (vuelve a leer la agenda y compara con lo que tenía)
class FakeEventSource {
  static instancias = [];
  static CLOSED = 2;
  constructor(url) { this.url = url; FakeEventSource.instancias.push(this); }
  addEventListener() {}
  close() {}
}

const RESERVA = { id: "r1", codigo: "RES-00000A", cliente: "Laura Gómez", fecha: "2026-11-20T12:00:00Z", hora: "08:00", inicio: "2026-11-20T13:00:00Z",
  personas: 2, estado: "Confirmada", estadoCodigo: "confirmada", mesa: { id: "m2", numero: 2, capacidad: 2 }, transiciones: [] };
let reservas;

beforeEach(() => {
  FakeEventSource.instancias = [];
  globalThis.EventSource = FakeEventSource;
  estado.usuario = { id: "u1", nombre: "Ana", role: "mesero", roleLabel: "Mesero", permisos: ["reserva:ver", "reserva:crear"] };
  reservas = [RESERVA];
  estado.apiRequest.mockReset().mockImplementation((ruta) => {
    if (ruta === "/v1/staff/reservas") return Promise.resolve(reservas);
    if (ruta === "/v1/staff/espera") return Promise.resolve({ espera: [] });
    if (ruta === "/v1/staff/pedidos?limite=20") return Promise.resolve([]);
    return Promise.reject(new Error(`Ruta inesperada ${ruta}`));
  });
});
afterEach(() => { delete globalThis.EventSource; });

describe("4.5 · Aviso en vivo de una reserva editada", () => {
  it("escucha el canal «reservas» y, con «reserva_editada», muestra qué cambió y lleva a la agenda", async () => {
    render(<DialogoProvider><MemoryRouter><StaffDashboard /></MemoryRouter></DialogoProvider>);
    await waitFor(() => expect(estado.apiRequest).toHaveBeenCalledWith("/v1/staff/reservas"));
    const fuente = FakeEventSource.instancias.find((f) => f.url.includes("canales=reservas"));
    expect(fuente).toBeTruthy();
    reservas = [{ ...RESERVA, hora: "09:00", inicio: "2026-11-20T14:00:00Z", estado: "Pendiente", estadoCodigo: "pendiente", mesa: null }];
    await act(async () => { fuente.onmessage({ data: JSON.stringify({ canal: "reservas", tipo: "reserva_editada", ids: { reserva: "r1" } }) }); });
    await screen.findByText("Reserva editada.");
    const aviso = document.querySelector(".aviso-reserva__region");
    expect(aviso).toHaveAttribute("aria-live", "polite");
    expect(aviso).toHaveTextContent("Laura Gómez cambió su reserva RES-00000A: hora 8:00 a. m. → 9:00 a. m.; ya no tiene la mesa 2 (no cabe); vuelve a estar pendiente de confirmar.");
    fireEvent.click(screen.getByRole("button", { name: "Ver en reservas" }));
    expect(await screen.findByRole("heading", { name: "Reservas" })).toBeInTheDocument();
    expect(screen.queryByText("Reserva editada.")).toBeNull();
    // Otro aviso se cierra con «Cerrar»
    await act(async () => { fuente.onmessage({ data: JSON.stringify({ canal: "reservas", tipo: "reserva_editada", ids: { reserva: "r1" } }) }); });
    await screen.findByText("Reserva editada.");
    fireEvent.click(screen.getByRole("button", { name: "Cerrar aviso" }));
    expect(screen.queryByText("Reserva editada.")).toBeNull();
  });

  it("otros cambios solo recargan la agenda (sin aviso)", async () => {
    render(<DialogoProvider><MemoryRouter><StaffDashboard /></MemoryRouter></DialogoProvider>);
    await waitFor(() => expect(estado.apiRequest).toHaveBeenCalledWith("/v1/staff/reservas"));
    const fuente = FakeEventSource.instancias.find((f) => f.url.includes("canales=reservas"));
    const antes = estado.apiRequest.mock.calls.filter(([r]) => r === "/v1/staff/reservas").length;
    await act(async () => { fuente.onmessage({ data: JSON.stringify({ canal: "reservas", tipo: "reserva_cambio", ids: { reserva: "r1" } }) }); });
    await waitFor(() => expect(estado.apiRequest.mock.calls.filter(([r]) => r === "/v1/staff/reservas").length).toBe(antes + 1));
    expect(screen.queryByText("Reserva editada.")).toBeNull();
  });
});
