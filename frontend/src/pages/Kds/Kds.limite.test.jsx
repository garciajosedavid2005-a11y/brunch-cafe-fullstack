import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// 2.6b · Si una tarjeta de la cola falla al dibujarse, el KDS sigue en pie (cabecera, estación y «Cambiar de
// usuario») con el aviso de la sección, en vez de quedarse en blanco.
const estado = vi.hoisted(() => ({ apiRequest: vi.fn() }));
vi.mock("../../services/api", () => ({ apiRequest: estado.apiRequest, API_URL: "http://api.test" }));
vi.mock("./useSonidoKds", () => ({
  useSonidoKds: () => ({ disponible: false, activado: false, bloqueado: false, sonar: vi.fn(), activar: vi.fn(), alternar: vi.fn() }),
}));
vi.mock("../../context/useAuth", () => ({
  useAuth: () => ({ user: { id: "u-coc", nombre: "Carla", roleLabel: "Cocina", permisos: ["kds:ver", "item:preparar"] }, logout: vi.fn() }),
}));
vi.mock("./TarjetasKds", () => ({
  TarjetaRonda: () => { throw new ReferenceError("algo is not defined"); },
  TarjetaDomicilio: () => null,
}));

import Kds from "./Kds";

const ESTACION = { codigo: "cocina", nombre: "Cocina", umbralAvisoMin: 12, umbralAlertaMin: 20 };
let consola;
beforeEach(() => {
  consola = vi.spyOn(console, "error").mockImplementation(() => {});
  try { localStorage.clear(); } catch { /* sin almacenamiento */ }
  estado.apiRequest.mockReset().mockImplementation((ruta) => {
    if (ruta === "/v1/staff/cocina/estaciones") return Promise.resolve([ESTACION]);
    return Promise.resolve({
      estacion: ESTACION, actualizadoEn: new Date().toISOString(), truncado: false, domicilio: [],
      salon: [{ tipo: "salon", comandaId: "r1", cuentaId: "c1", numeroRonda: 1, mesas: [3], mesero: "Ana P.", enviadaEn: new Date().toISOString(),
        items: [{ id: "i1", nombre: "Huevos", cantidad: 1, nota: "", modificadores: [], estado: "enviado", anulacion: null }] }],
    });
  });
});
afterEach(() => consola.mockRestore());

describe("Límite de errores en /kds (2.6b)", () => {
  it("una tarjeta que falla no deja la pantalla en blanco", async () => {
    render(<MemoryRouter><Kds /></MemoryRouter>);
    expect(await screen.findByRole("alert")).toHaveTextContent("Algo salió mal en esta sección");
    expect(screen.getByRole("button", { name: "Cambiar de usuario" })).toBeInTheDocument();
    expect(consola.mock.calls.some(([m]) => String(m).includes("[Brunch Café]"))).toBe(true);
  });
});
