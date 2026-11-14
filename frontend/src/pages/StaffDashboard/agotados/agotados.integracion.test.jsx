import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// 2.7 · Dónde se agota: pestaña «Agotados» en /staff (con producto:agotar o producto:reactivar) y botón
// «Agotados» en /kds, que abre el panel en la estación de la pantalla y vuelve a la cola.
const estado = vi.hoisted(() => ({ user: null, apiRequest: vi.fn() }));
vi.mock("../../../services/api", () => ({ apiRequest: estado.apiRequest, API_URL: "http://api.test" }));
vi.mock("../../../context/useAuth", () => ({ useAuth: () => ({ user: estado.user, logout: vi.fn() }) }));
vi.mock("../../Kds/useSonidoKds", () => ({
  useSonidoKds: () => ({ disponible: false, activado: false, bloqueado: false, sonar: vi.fn(), activar: vi.fn(), alternar: vi.fn() }),
}));
vi.mock("./PanelAgotados", () => ({
  default: ({ permisos, estacionInicial }) => <p>Panel de agotados · {permisos.join(",")} · {estacionInicial ?? "todas"}</p>,
}));

import StaffDashboard from "../StaffDashboard";
import Kds from "../../Kds/Kds";

const ESTACION = { codigo: "barra", nombre: "Barra", umbralAvisoMin: 5, umbralAlertaMin: 10 };
beforeEach(() => {
  try { localStorage.clear(); } catch { /* sin almacenamiento */ }
  estado.apiRequest.mockReset().mockImplementation((ruta) => {
    if (ruta === "/v1/staff/cocina/estaciones") return Promise.resolve([ESTACION]);
    if (ruta.startsWith("/v1/staff/cocina/cola")) return Promise.resolve({ estacion: ESTACION, actualizadoEn: new Date().toISOString(), truncado: false, salon: [], domicilio: [] });
    return new Promise(() => {});
  });
});

describe("/staff · pestaña «Agotados» (2.7)", () => {
  it("con producto:agotar aparece y muestra el panel con sus permisos", () => {
    estado.user = { id: "u1", nombre: "Ana", roleLabel: "Mesero", permisos: ["pedido:ver", "producto:agotar"] };
    render(<MemoryRouter><StaffDashboard /></MemoryRouter>);
    const nav = screen.getByRole("navigation", { name: /secciones del panel de personal/i });
    fireEvent.click(within(nav).getByRole("button", { name: "Agotados" }));
    expect(screen.getByText(/Panel de agotados · pedido:ver,producto:agotar/)).toBeInTheDocument();
  });

  it("sin ninguno de los dos permisos no aparece", () => {
    estado.user = { id: "u1", nombre: "Ana", roleLabel: "Recepción", permisos: ["pedido:ver"] };
    render(<MemoryRouter><StaffDashboard /></MemoryRouter>);
    const nav = screen.getByRole("navigation", { name: /secciones del panel de personal/i });
    expect(within(nav).queryByRole("button", { name: "Agotados" })).not.toBeInTheDocument();
  });
});

describe("/kds · «Agotados» (2.7)", () => {
  it("abre el panel en la estación de la pantalla y «Volver a la cola» regresa", async () => {
    estado.user = { id: "u2", nombre: "Carla", roleLabel: "Barista", permisos: ["kds:ver", "item:preparar", "producto:agotar", "producto:reactivar"] };
    render(<MemoryRouter><Kds /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "Agotados" }));
    expect(screen.getByText(/Panel de agotados · .* · barra/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Volver a la cola" }));
    expect(screen.queryByText(/Panel de agotados/)).not.toBeInTheDocument();
  });

  it("sin permisos de agotar no se ofrece", async () => {
    estado.user = { id: "u3", nombre: "Pepe", roleLabel: "Cocina", permisos: ["kds:ver", "item:preparar"] };
    render(<MemoryRouter><Kds /></MemoryRouter>);
    await screen.findByText(/No hay nada pendiente/);
    expect(screen.queryByRole("button", { name: "Agotados" })).not.toBeInTheDocument();
  });
});
