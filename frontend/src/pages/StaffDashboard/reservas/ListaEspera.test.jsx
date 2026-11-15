import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const estado = vi.hoisted(() => ({ apiRequest: vi.fn(), confirmar: vi.fn() }));
vi.mock("../../../services/api", () => ({ apiRequest: estado.apiRequest }));
vi.mock("../../../context/useDialogo", () => ({ useDialogo: () => ({ confirmar: estado.confirmar, avisar: vi.fn() }) }));

import ListaEspera from "./ListaEspera";

// 4.4 · Lista de espera (F4-4): nombre, personas y teléfono; «Sentar» abre la cuenta en una mesa libre
const ESPERA = [
  { id: "e1", nombre: "Pedro Gómez", personas: 3, telefono: "3105556677", estado: "esperando", minutosEsperando: 12, mesa: null },
  { id: "e2", nombre: "Lina Ruiz", personas: 2, telefono: "3001112233", estado: "sentada", minutosEsperando: 40, mesa: { id: "m3", numero: 3 } },
];
const PLANO = { zonas: [], mesas: [
  { id: "m1", numero: 1, capacidad: 4, estado: "libre", cuenta: null, reserva: null },
  { id: "m2", numero: 2, capacidad: 4, estado: "libre", cuenta: null, reserva: { bloqueada: true, hora: "08:00", cliente: "Laura" } },
  { id: "m3", numero: 3, capacidad: 2, estado: "ocupada", cuenta: { id: "c3" }, reserva: null },
  { id: "m5", numero: 5, capacidad: 2, estado: "libre", cuenta: null, reserva: null },
] };

beforeEach(() => {
  estado.apiRequest.mockReset();
  estado.confirmar.mockReset();
  estado.apiRequest.mockImplementation((ruta, opciones = {}) => {
    if (ruta === "/v1/staff/espera" && !opciones.method) return Promise.resolve({ espera: ESPERA });
    if (ruta === "/v1/staff/salon/mesas") return Promise.resolve(PLANO);
    return Promise.resolve({});
  });
});

describe("4.4 · Lista de espera", () => {
  it("muestra quién espera (con minutos) y agrega a alguien con nombre, personas y teléfono", async () => {
    render(<ListaEspera puedeAgregar puedeSentar />);
    const lista = await screen.findByRole("list", { name: "Esperando mesa" });
    expect(within(lista).getByText("Pedro Gómez")).toBeInTheDocument();
    expect(within(lista).getByText(/3 personas · 3105556677 · espera 12 min/)).toBeInTheDocument();
    expect(within(lista).queryByText("Lina Ruiz")).toBeNull();
    expect(screen.getByText(/Hoy: 1 sentado/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/^Nombre/), { target: { value: "Ana Torres" } });
    fireEvent.change(screen.getByLabelText("Personas"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText(/^Teléfono/), { target: { value: "3201234567" } });
    fireEvent.click(screen.getByRole("button", { name: "Agregar a la espera" }));
    await waitFor(() => expect(estado.apiRequest).toHaveBeenCalledWith("/v1/staff/espera", expect.objectContaining({
      method: "POST", body: JSON.stringify({ nombre: "Ana Torres", personas: 4, telefono: "3201234567" }),
    })));
  });

  it("«Sentar» ofrece solo mesas libres y no reservadas, y envía la mesa elegida", async () => {
    render(<ListaEspera puedeAgregar puedeSentar />);
    const selector = await screen.findByRole("combobox", { name: "Mesa para Pedro Gómez" });
    await waitFor(() => expect(within(selector).getByRole("option", { name: /Mesa 1 · 4 personas/ })).toBeInTheDocument());
    expect(within(selector).queryByRole("option", { name: /Mesa 2/ })).toBeNull();
    expect(within(selector).queryByRole("option", { name: /Mesa 3/ })).toBeNull();
    expect(within(selector).getByRole("option", { name: /Mesa 5 · 2 personas \(pequeña\)/ })).toBeInTheDocument();
    fireEvent.change(selector, { target: { value: "m1" } });
    fireEvent.click(screen.getByRole("button", { name: "Sentar a Pedro Gómez" }));
    await waitFor(() => expect(estado.apiRequest).toHaveBeenCalledWith("/v1/staff/espera/e1/sentar", expect.objectContaining({
      method: "POST", body: JSON.stringify({ mesaId: "m1" }),
    })));
  });

  it("«Retirar» pide confirmación; sin permisos no hay formulario ni acciones", async () => {
    estado.confirmar.mockResolvedValue({ confirmado: true });
    const { unmount } = render(<ListaEspera puedeAgregar puedeSentar />);
    fireEvent.click(await screen.findByRole("button", { name: "Retirar a Pedro Gómez" }));
    await waitFor(() => expect(estado.apiRequest).toHaveBeenCalledWith("/v1/staff/espera/e1/retirar", expect.objectContaining({ method: "PATCH" })));
    unmount();
    render(<ListaEspera puedeAgregar={false} puedeSentar={false} />);
    await screen.findByText("Pedro Gómez");
    expect(screen.queryByRole("button", { name: "Agregar a la espera" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Sentar/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Retirar/ })).toBeNull();
  });
});
