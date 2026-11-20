import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

// 6.7 (F6-6, F6-d) · Cumpleaños en la caja: con cliente identificado al que le corresponde, la casilla resta el 10 % del
// consumo antes del canje (que se limita a lo que queda) y el cuerpo lleva aplicarCumpleanos. Si no le corresponde, no
// aparece.
const estado = vi.hoisted(() => ({ apiRequest: vi.fn(), detalle: {} }));
vi.mock("../../../services/api", () => ({ apiRequest: estado.apiRequest }));
vi.mock("../../../context/useAuth", () => ({ useAuth: () => ({ user: { permisos: ["cuenta:cobrar", "puntos:canjear", "cliente:identificar"] } }) }));

import CobrarCuenta from "./CobrarCuenta";

const CLIENTE = { id: "u1", nombre: "Ana R.", alergias: "", preferencias: "" };
const CUENTA = { id: "c1", codigo: "C-000010", mesas: [3], mesero: "Mesero P.", comensales: 2, total: 30000, version: 5, cliente: CLIENTE, paraLlevar: null };

beforeEach(() => {
  estado.detalle = { items: [], puntosCliente: 300, cumpleanosCliente: { disponible: true, porcentaje: 10, monto: 3000 } };
  estado.apiRequest.mockReset().mockImplementation((ruta, opciones = {}) => {
    if (ruta === "/v1/staff/caja/cuentas/c1") return Promise.resolve(estado.detalle);
    if (ruta === "/v1/staff/caja/cuentas/c1/cobrar" && opciones.method === "POST") return Promise.resolve({ comprobante: { id: "k1" } });
    return Promise.reject(new Error(`Ruta inesperada ${ruta}`));
  });
});

describe("6.7 · Cumpleaños en la caja", () => {
  it("resta el 10 % antes del canje, limita los bloques y envía aplicarCumpleanos", async () => {
    const onCobrada = vi.fn();
    render(<CobrarCuenta cuenta={CUENTA} onVolver={vi.fn()} onCobrada={onCobrada} />);
    const casilla = await screen.findByRole("checkbox", { name: /descuento de cumpleaños \(10 %/i });
    const selector = screen.getByLabelText(/Canjear puntos/);
    expect(selector.querySelectorAll("option")).toHaveLength(4); // 0 a 3 bloques con $30.000
    fireEvent.click(casilla);
    expect(screen.getByText("Descuento de cumpleaños (10 %)")).toBeInTheDocument();
    expect(selector.querySelectorAll("option")).toHaveLength(3); // con $27.000 caben 2
    expect(screen.getByText(/Total a cobrar/)).toHaveTextContent(/27\.000/);
    fireEvent.click(screen.getByRole("button", { name: /^Cobrar/ }));
    await waitFor(() => expect(onCobrada).toHaveBeenCalled());
    const [, opciones] = estado.apiRequest.mock.calls.find(([r, o]) => r.endsWith("/cobrar") && o?.method === "POST");
    expect(JSON.parse(opciones.body)).toMatchObject({ versionEsperada: 5, aplicarCumpleanos: true, propina: 0 });
  });

  it("si no le corresponde, no aparece y el cuerpo no lo lleva", async () => {
    estado.detalle = { ...estado.detalle, cumpleanosCliente: { disponible: false, porcentaje: 10, monto: 3000 } };
    const onCobrada = vi.fn();
    render(<CobrarCuenta cuenta={CUENTA} onVolver={vi.fn()} onCobrada={onCobrada} />);
    await screen.findByLabelText(/Canjear puntos/);
    expect(screen.queryByRole("checkbox", { name: /cumpleaños/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Cobrar/ }));
    await waitFor(() => expect(onCobrada).toHaveBeenCalled());
    const [, opciones] = estado.apiRequest.mock.calls.find(([r, o]) => r.endsWith("/cobrar") && o?.method === "POST");
    expect(JSON.parse(opciones.body)).not.toHaveProperty("aplicarCumpleanos");
  });
});
