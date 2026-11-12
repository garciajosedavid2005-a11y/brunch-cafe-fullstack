import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { DialogoProvider } from "../../../context/DialogoContext";

vi.mock("../../../services/api", () => ({
  apiRequest: vi.fn(),
  api: { get: vi.fn(), patch: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

import { api } from "../../../services/api";
import RolesSection from "./RolesSection";

// Pendiente aprobado tras 1.12: un rol con «abrir cuenta» pero sin «tomar comandas» ni «transferir
// cuentas» no puede abrir ninguna (sin mesero, 400 MESERO_REQUERIDO; con otro mesero, 403). Se avisa
// al editarlo y en la lista; no se bloquea el guardado.
const CATALOGO = [
  { clave: "cuenta:abrir", modulo: "salon", descripcion: "Abrir la cuenta de una mesa" },
  { clave: "comanda:tomar", modulo: "salon", descripcion: "Tomar comandas" },
  { clave: "cuenta:transferir", modulo: "salon", descripcion: "Transferir una cuenta a otro mesero" },
];
const rol = (codigo, permisos) => ({
  id: `id-${codigo}`, codigo, nombre: codigo, descripcion: "", usuariosAsignados: 0, permisos,
  esSistema: false, editable: true, permisosEditables: true, eliminable: true,
});
const AVISO = /no podrá abrir ninguna cuenta/;

const montar = async (roles) => {
  api.get.mockImplementation((ruta) => Promise.resolve(ruta === "/v1/admin/permisos" ? CATALOGO : roles));
  render(<DialogoProvider><RolesSection /></DialogoProvider>);
  await screen.findByText(roles[0].nombre, { selector: "strong" });
};
const fila = (nombre) => screen.getByText(nombre, { selector: "strong" }).closest("tr");

describe("Roles: aviso de «abrir cuenta» sin poder hacerlo", () => {
  beforeEach(() => vi.clearAllMocks());

  it("al editar, avisa si marca «abrir» sin «tomar comandas» ni «transferir», y deja de avisar al marcar uno", async () => {
    await montar([rol("recepcion", [])]);
    fireEvent.click(within(fila("recepcion")).getByRole("button", { name: /editar/i }));
    expect(screen.queryByText(AVISO)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "Abrir la cuenta de una mesa" }));
    expect(screen.getByRole("status")).toHaveTextContent(AVISO);
    expect(screen.getByRole("status")).toHaveTextContent(/«Tomar comandas» o «Transferir una cuenta a otro mesero»/);
    fireEvent.click(screen.getByRole("checkbox", { name: "Transferir una cuenta a otro mesero" }));
    expect(screen.queryByText(AVISO)).not.toBeInTheDocument();
    // No bloquea: se puede guardar igual
    expect(screen.getByRole("button", { name: "Guardar Cambios" })).toBeEnabled();
  });

  it("en la lista, el rol con ese hueco lleva el aviso; uno completo, no", async () => {
    await montar([rol("recepcion", ["cuenta:abrir"]), rol("mesero", ["cuenta:abrir", "comanda:tomar"]), rol("admin", ["*"])]);
    expect(within(fila("recepcion")).getByText(/no podrá abrir cuentas/)).toBeInTheDocument();
    expect(within(fila("mesero")).queryByText(/no podrá abrir cuentas/)).not.toBeInTheDocument();
    expect(within(fila("admin")).queryByText(/no podrá abrir cuentas/)).not.toBeInTheDocument();
  });
});
