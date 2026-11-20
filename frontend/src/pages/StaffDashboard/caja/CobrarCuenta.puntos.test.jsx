import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

// 6.6 (F6-5) · Canje de puntos en la caja: con cliente identificado y puntos:canjear, bloques de 100 = $10.000 hasta el
// saldo y sin superar el consumo; el total baja y el cuerpo lleva canjearPuntos. Sin cliente o sin permiso, no aparece.
const estado = vi.hoisted(() => ({ apiRequest: vi.fn(), usuario: { permisos: ["cuenta:cobrar", "puntos:canjear", "cliente:identificar"] } }));
vi.mock("../../../services/api", () => ({ apiRequest: estado.apiRequest }));
vi.mock("../../../context/useAuth", () => ({ useAuth: () => ({ user: estado.usuario }) }));

import CobrarCuenta from "./CobrarCuenta";
import { cuerpoCobro } from "./cobro";

const CLIENTE = { id: "u1", nombre: "Ana R.", alergias: "", preferencias: "" };
const CUENTA = { id: "c1", codigo: "C-000010", mesas: [3], mesero: "Mesero P.", comensales: 2, total: 30000, version: 5, cliente: CLIENTE, paraLlevar: null };

beforeEach(() => {
  estado.usuario = { permisos: ["cuenta:cobrar", "puntos:canjear", "cliente:identificar"] };
  estado.apiRequest.mockReset().mockImplementation((ruta, opciones = {}) => {
    if (ruta === "/v1/staff/caja/cuentas/c1") return Promise.resolve({ items: [], puntosCliente: 250 });
    if (ruta === "/v1/staff/caja/cuentas/c1/cobrar" && opciones.method === "POST") return Promise.resolve({ comprobante: { id: "k1" } });
    return Promise.reject(new Error(`Ruta inesperada ${ruta}`));
  });
});

describe("6.6 · Canje de puntos en la caja", () => {
  it("ofrece bloques hasta el saldo y el consumo; el total baja y el cuerpo lleva canjearPuntos", async () => {
    const onCobrada = vi.fn();
    render(<CobrarCuenta cuenta={CUENTA} onVolver={vi.fn()} onCobrada={onCobrada} />);
    const selector = await screen.findByLabelText(/Canjear puntos/);
    expect(screen.getByText("(saldo: 250)")).toBeInTheDocument();
    // 250 puntos → 2 bloques (el consumo de $30.000 admitiría 3)
    expect([...selector.querySelectorAll("option")].map((o) => o.value)).toEqual(["0", "1", "2"]);
    expect(selector.querySelectorAll("option")[2].textContent).toMatch(/^200 puntos = \$\s20\.000$/);
    fireEvent.change(selector, { target: { value: "2" } });
    expect(screen.getByText("Descuento por puntos (200)")).toBeInTheDocument();
    expect(screen.getByText(/Total a cobrar/)).toHaveTextContent(/10\.000/);
    fireEvent.click(screen.getByRole("button", { name: /^Cobrar/ }));
    await waitFor(() => expect(onCobrada).toHaveBeenCalled());
    const [, opciones] = estado.apiRequest.mock.calls.find(([r, o]) => r.endsWith("/cobrar") && o?.method === "POST");
    expect(JSON.parse(opciones.body)).toMatchObject({ versionEsperada: 5, canjearPuntos: 200, propina: 0 });
  });

  it("sin cliente o sin el permiso no aparece el canje; el cuerpo no lleva canjearPuntos en 0", async () => {
    const { unmount } = render(<CobrarCuenta cuenta={{ ...CUENTA, cliente: null }} onVolver={vi.fn()} onCobrada={vi.fn()} />);
    expect(screen.queryByLabelText(/Canjear puntos/)).not.toBeInTheDocument();
    unmount();
    estado.usuario = { permisos: ["cuenta:cobrar"] };
    render(<CobrarCuenta cuenta={CUENTA} onVolver={vi.fn()} onCobrada={vi.fn()} />);
    expect(screen.queryByLabelText(/Canjear puntos/)).not.toBeInTheDocument();
    expect(cuerpoCobro({ versionEsperada: 1, propina: 0, pagos: [], canjearPuntos: 0 })).not.toHaveProperty("canjearPuntos");
  });
});
