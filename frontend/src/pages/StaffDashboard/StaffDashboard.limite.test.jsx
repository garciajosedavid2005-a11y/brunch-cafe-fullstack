import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// 2.6b · El fallo de Brayan: al abrir una cuenta, un error al dibujarla dejaba /staff entero en blanco. Con
// el límite de errores, la cabecera y las pestañas siguen en pie y la sección muestra el aviso; si falla el
// aviso «Listo para servir», el plano sigue funcionando.
const estado = vi.hoisted(() => ({ falla: "plano", apiRequest: vi.fn() }));
vi.mock("../../services/api", () => ({ apiRequest: estado.apiRequest, API_URL: "http://api.test" }));
vi.mock("../../context/useAuth", () => ({
  useAuth: () => ({ user: { id: "u1", nombre: "Ana", roleLabel: "Mesero", permisos: ["mesa:ver", "cuenta:ver", "item:servir"] }, logout: vi.fn() }),
}));
vi.mock("./plano/PlanoMesas", () => ({
  default: () => {
    if (estado.falla === "plano") throw new ReferenceError("conAccionesListo is not defined");
    return <p>Plano de mesas</p>;
  },
}));
vi.mock("./plano/AvisoListos", () => ({
  default: () => {
    if (estado.falla === "aviso") throw new ReferenceError("algo is not defined");
    return null;
  },
}));

import StaffDashboard from "./StaffDashboard";

let consola;
beforeEach(() => {
  consola = vi.spyOn(console, "error").mockImplementation(() => {});
  estado.apiRequest.mockReset().mockReturnValue(new Promise(() => {}));
});
afterEach(() => consola.mockRestore());

describe("Límite de errores en /staff (2.6b)", () => {
  it("si la sección falla, la cabecera y las pestañas siguen y se puede cambiar de sección", () => {
    estado.falla = "plano";
    render(<MemoryRouter><StaffDashboard /></MemoryRouter>);
    expect(screen.getByRole("alert")).toHaveTextContent("Algo salió mal en esta sección");
    expect(screen.getByRole("button", { name: "Cambiar de usuario" })).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: /secciones del panel de personal/i });
    fireEvent.click(within(nav).getByRole("button", { name: "Mi perfil" }));
    expect(screen.queryByText("Algo salió mal en esta sección")).not.toBeInTheDocument(); // otra sección, límite nuevo
  });

  it("si falla el aviso «Listo para servir», el plano sigue", () => {
    estado.falla = "aviso";
    render(<MemoryRouter><StaffDashboard /></MemoryRouter>);
    expect(screen.getByText("Plano de mesas")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Algo salió mal en esta sección");
  });
});
