import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const estado = vi.hoisted(() => ({ apiRequest: vi.fn() }));
vi.mock("../../../services/api", () => ({ apiRequest: estado.apiRequest }));

import CuentasAbiertas, { INTERVALO_MS } from "./CuentasAbiertas";

// 1.9 · «Cuentas abiertas» (F1-11, opción A): salón + domicilio en una sola vista de solo lectura.
const RUTA = "/v1/staff/cuentas-abiertas";
const SALON = {
  id: "c1", canal: "salon", codigo: "C-000001", estado: { codigo: "cuenta_pedida", nombre: "Cuenta pedida" },
  referencia: "Mesas 1, 2", cliente: "", responsable: { id: "u1", nombre: "Ana P." }, comensales: 4,
  total: 38000, pendiente: 9000, desde: "2026-11-12T15:00:00.000Z", minutos: 80,
};
const DOMICILIO = {
  id: "p1", canal: "domicilio", codigo: "PED-ABC123", estado: { codigo: "en_camino", nombre: "En camino" },
  referencia: "Centro", cliente: "Lucía Pérez", responsable: null, total: 25000, pendiente: 0,
  hora: "11:30", entregaEn: "2026-11-12T16:30:00.000Z", desde: "2026-11-12T15:40:00.000Z", minutos: 40,
};
const RESPUESTA = (extra = {}) => ({
  actualizadoEn: "2026-11-12T16:20:00.000Z", canales: { salon: true, domicilio: true }, truncado: false,
  cuentas: [SALON, DOMICILIO], ...extra,
});

let respuesta;
beforeEach(() => {
  respuesta = () => Promise.resolve(RESPUESTA());
  estado.apiRequest.mockReset();
  estado.apiRequest.mockImplementation((ruta) => (ruta === RUTA ? respuesta() : Promise.reject(new Error(`Ruta inesperada ${ruta}`))));
});
afterEach(() => vi.useRealTimers());

const lista = () => screen.getByRole("list", { name: "Cuentas abiertas" });
const fila = (codigo) => within(lista()).getByText(codigo).closest("li");
const llamadas = () => estado.apiRequest.mock.calls.filter(([r]) => r === RUTA).length;

describe("Cuentas abiertas (staff)", () => {
  it("lista salón y domicilio con el canal en texto, la referencia, el estado y el total", async () => {
    render(<CuentasAbiertas />);
    expect(await screen.findByRole("heading", { name: "Cuentas abiertas", level: 2 })).toBeInTheDocument();
    await screen.findByText("C-000001");
    const salon = fila("C-000001");
    expect(salon).toHaveTextContent("Salón");
    expect(salon).toHaveTextContent("Mesas 1, 2");
    expect(salon).toHaveTextContent("Cuenta pedida");
    expect(salon).toHaveTextContent("Ana P.");
    expect(salon).toHaveTextContent("4 comensales");
    expect(salon).toHaveTextContent("$ 38.000");
    expect(salon).toHaveTextContent("Sin enviar: $ 9.000");
    expect(salon).toHaveTextContent("1 h 20 min");
    const domicilio = fila("PED-ABC123");
    expect(domicilio).toHaveTextContent("Domicilio");
    expect(domicilio).toHaveTextContent("Lucía Pérez");
    expect(domicilio).toHaveTextContent("Entrega 11:30");
    expect(domicilio).toHaveTextContent("En camino");
    expect(domicilio).toHaveTextContent("$ 25.000");
  });

  it("es de solo lectura: no ofrece acciones sobre las cuentas", async () => {
    render(<CuentasAbiertas />);
    await screen.findByText("C-000001");
    expect(within(lista()).queryAllByRole("button")).toHaveLength(0);
  });

  it("filtra por canal con el número de cada uno", async () => {
    render(<CuentasAbiertas />);
    await screen.findByText("C-000001");
    const filtros = screen.getByRole("group", { name: "Canal" });
    expect(within(filtros).getByRole("button", { name: "Todas (2)" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(within(filtros).getByRole("button", { name: "Domicilio (1)" }));
    expect(within(lista()).queryByText("C-000001")).not.toBeInTheDocument();
    expect(within(lista()).getByText("PED-ABC123")).toBeInTheDocument();
    fireEvent.click(within(filtros).getByRole("button", { name: "Salón (1)" }));
    expect(within(lista()).getByText("C-000001")).toBeInTheDocument();
    expect(within(lista()).queryByText("PED-ABC123")).not.toBeInTheDocument();
  });

  it("sin permiso para un canal no ofrece su filtro y lo explica", async () => {
    respuesta = () => Promise.resolve(RESPUESTA({ canales: { salon: false, domicilio: true }, cuentas: [DOMICILIO] }));
    render(<CuentasAbiertas />);
    await screen.findByText("PED-ABC123");
    expect(screen.queryByRole("group", { name: "Canal" })).not.toBeInTheDocument();
    expect(screen.getByText("Tu rol solo ve los domicilios.")).toBeInTheDocument();
  });

  it("sin cuentas lo dice; si el servidor recortó la lista, avisa", async () => {
    respuesta = () => Promise.resolve(RESPUESTA({ cuentas: [] }));
    const { unmount } = render(<CuentasAbiertas />);
    expect(await screen.findByText("No hay cuentas abiertas.")).toBeInTheDocument();
    unmount();
    respuesta = () => Promise.resolve(RESPUESTA({ truncado: true }));
    render(<CuentasAbiertas />);
    expect(await screen.findByText(/se muestran las 200 más antiguas/i)).toBeInTheDocument();
  });

  it("se refresca cada 15 s y, si falla, conserva lo último y lo avisa", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<CuentasAbiertas />);
    await screen.findByText("C-000001");
    expect(llamadas()).toBe(1);
    respuesta = () => Promise.reject(new Error("No se pudo conectar con el servidor."));
    await act(async () => { await vi.advanceTimersByTimeAsync(INTERVALO_MS + 500); });
    expect(llamadas()).toBe(2);
    await waitFor(() => expect(screen.getByText(/No se pudo actualizar/)).toBeInTheDocument());
    expect(within(lista()).getByText("C-000001")).toBeInTheDocument();
    expect(INTERVALO_MS).toBe(15_000);
  });
});
