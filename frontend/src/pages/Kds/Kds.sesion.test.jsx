import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

// 2.8 (F2-6) · La pantalla del KDS queda encendida todo el turno con la sesión de una persona: no se cierra
// ni sale de /kds por inactividad (sin toques durante horas). Solo la cierran «Cambiar de usuario» o que la
// sesión deje de valer en el servidor (12 h, F1-10).
const estado = vi.hoisted(() => ({ apiRequest: vi.fn(), logout: vi.fn() }));
vi.mock("../../services/api", () => ({ apiRequest: estado.apiRequest, API_URL: "http://api.test" }));
vi.mock("../../context/useAuth", () => ({
  useAuth: () => ({
    user: { id: "u2", nombre: "Carlos", roleLabel: "Cocina", permisos: ["kds:ver", "item:preparar"] },
    logout: estado.logout,
  }),
}));
vi.mock("./useSonidoKds", () => ({
  useSonidoKds: () => ({ disponible: false, activado: false, bloqueado: false, sonar: vi.fn(), activar: vi.fn(), alternar: vi.fn() }),
}));

import Kds from "./Kds";

const ESTACION = { codigo: "cocina", nombre: "Cocina", umbralAvisoMin: 12, umbralAlertaMin: 20 };

beforeEach(() => {
  vi.useFakeTimers();
  estado.logout.mockReset();
  estado.apiRequest.mockReset().mockImplementation((ruta) => {
    if (ruta === "/v1/staff/cocina/estaciones") return Promise.resolve([ESTACION]);
    if (ruta.startsWith("/v1/staff/cocina/cola")) {
      return Promise.resolve({ estacion: ESTACION, actualizadoEn: new Date().toISOString(), truncado: false, salon: [], domicilio: [] });
    }
    return Promise.resolve({});
  });
});
afterEach(() => vi.useRealTimers());

describe("/kds sin cierre por inactividad (2.8, F2-6)", () => {
  it("tras 4 horas sin tocar la pantalla sigue en /kds, con la cola y sin cerrar la sesión", async () => {
    render(
      <MemoryRouter initialEntries={["/kds"]}>
        <Routes>
          <Route path="/kds" element={<Kds />} />
          <Route path="/login" element={<p>Pantalla de login</p>} />
        </Routes>
      </MemoryRouter>,
    );
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(screen.getByText(/No hay nada pendiente en Cocina/)).toBeInTheDocument();

    await act(async () => { await vi.advanceTimersByTimeAsync(4 * 60 * 60 * 1000); });

    expect(estado.logout).not.toHaveBeenCalled();
    expect(screen.queryByText("Pantalla de login")).not.toBeInTheDocument();
    expect(screen.getByText(/No hay nada pendiente en Cocina/)).toBeInTheDocument();
    // Siguió leyendo la cola (polling de respaldo) todo ese tiempo
    expect(estado.apiRequest.mock.calls.filter(([ruta]) => ruta.startsWith("/v1/staff/cocina/cola")).length).toBeGreaterThan(10);
  });
});
