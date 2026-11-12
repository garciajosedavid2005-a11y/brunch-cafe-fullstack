import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { DialogoProvider } from "../../../context/DialogoContext";

vi.mock("../../../services/api", () => ({
  apiRequest: vi.fn(),
  api: { get: vi.fn(), patch: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

import { api } from "../../../services/api";
import RolesSection from "./RolesSection";

// 2.1 · Los permisos de la Fase 2 del módulo «cocina» salen agrupados como «Cocina y barra»
const CATALOGO = [
  { clave: "kds:ver", modulo: "cocina", descripcion: "Ver la pantalla de cocina (KDS) de su estación" },
  { clave: "item:preparar", modulo: "cocina", descripcion: "Marcar ítems en preparación y listos" },
  { clave: "producto:agotar", modulo: "catalogo", descripcion: "Marcar un producto u opción como agotado" },
];
const ROL = {
  id: "id-cocina", codigo: "cocina", nombre: "Cocina", descripcion: "", usuariosAsignados: 0, permisos: ["kds:ver"],
  esSistema: true, editable: true, permisosEditables: true, eliminable: false,
};

describe("Roles: permisos de cocina y barra (2.1)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("el grupo del módulo cocina se titula «Cocina y barra» y lista sus permisos", async () => {
    api.get.mockImplementation((ruta) => Promise.resolve(ruta === "/v1/admin/permisos" ? CATALOGO : [ROL]));
    render(<DialogoProvider><RolesSection /></DialogoProvider>);
    const fila = (await screen.findByText("Cocina", { selector: "strong" })).closest("tr");
    fireEvent.click(within(fila).getByRole("button", { name: /editar/i }));
    const grupo = screen.getByRole("group", { name: "Cocina y barra" });
    expect(within(grupo).getByRole("checkbox", { name: "Ver la pantalla de cocina (KDS) de su estación" })).toBeChecked();
    expect(within(grupo).getByRole("checkbox", { name: "Marcar ítems en preparación y listos" })).not.toBeChecked();
  });
});
