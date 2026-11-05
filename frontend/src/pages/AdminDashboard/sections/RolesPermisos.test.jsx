import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { DialogoProvider } from "../../../context/DialogoContext";

vi.mock("../../../services/adminApi", () => ({
  adminApi: { get: vi.fn(), patch: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

import { adminApi } from "../../../services/adminApi";
import RolesSection from "./RolesSection";

const rol = (codigo, extra) => ({
  id: `id-${codigo}`, codigo, nombre: codigo, descripcion: "", usuariosAsignados: 0, permisos: [],
  esSistema: false, editable: true, permisosEditables: true, eliminable: true, ...extra,
});
const ROLES = [
  rol("admin", { nombre: "Administrador", esSistema: true, editable: false, permisosEditables: false, eliminable: false, permisos: ["*"], usuariosAsignados: 1 }),
  rol("mesero", { nombre: "Mesero", esSistema: true, eliminable: false, permisos: ["pedido:ver"] }),
  rol("supervisor", { nombre: "Supervisor", usuariosAsignados: 2, eliminable: false }),
  rol("temporal", { nombre: "Temporal" }),
];
const CATALOGO = [
  { clave: "pedido:ver", modulo: "pedidos", descripcion: "Ver todos los pedidos" },
  { clave: "resena:moderar", modulo: "resenas", descripcion: "Ocultar o eliminar reseñas" },
  { clave: "catalogo:gestionar", modulo: "catalogo", descripcion: "Gestionar productos" },
  { clave: "estado:editar", modulo: "configuracion", descripcion: "Editar estados" },
  { clave: "caja:abrir", modulo: "caja", descripcion: "Abrir turno de caja", reservado: true },
];

// Simula el backend: lo eliminado ya no vuelve en la lista
const montar = async () => {
  const borrados = new Set();
  adminApi.delete.mockImplementation(async (ruta) => {
    const respuesta = await (adminApi.delete.respuesta?.() ?? { message: "Rol eliminado" });
    borrados.add(ruta.split("/").pop());
    return respuesta;
  });
  adminApi.get.mockImplementation((ruta) =>
    Promise.resolve(ruta === "/v1/admin/permisos" ? CATALOGO : ROLES.filter((r) => !borrados.has(r.id))));
  render(<DialogoProvider><RolesSection /></DialogoProvider>);
  await screen.findByText("Temporal");
};
const fila = (nombre) => screen.getByText(nombre, { selector: "strong" }).closest("tr");

describe("Roles: formulario de permisos", () => {
  beforeEach(() => vi.clearAllMocks());

  const abrirEdicion = async () => {
    await montar();
    fireEvent.click(within(fila("Temporal")).getByRole("button", { name: /editar/i }));
  };

  it("títulos de grupo con tildes", async () => {
    await abrirEdicion();
    for (const titulo of ["Reseñas", "Catálogo", "Configuración", "Pedidos", "Caja"]) {
      expect(screen.getByText(titulo, { selector: "legend" })).toBeInTheDocument();
    }
  });

  it("permisos de próximas fases: deshabilitados con la etiqueta 'Próximamente'", async () => {
    await abrirEdicion();
    const reservado = screen.getByRole("checkbox", { name: /abrir turno de caja/i });
    expect(reservado).toBeDisabled();
    expect(reservado.closest("label")).toHaveClass("admin-permiso--proximo");
    expect(within(reservado.closest("label")).getByText("Próximamente")).toBeInTheDocument();
    const activo = screen.getByRole("checkbox", { name: /ver todos los pedidos/i });
    expect(activo).toBeEnabled();
    expect(activo.closest("label")).not.toHaveClass("admin-permiso--proximo");
  });
});
