import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
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
  rol("supervisor", { nombre: "Supervisor", usuariosAsignados: 2, eliminable: false, permisos: ["p1", "p2", "p3", "p4"] }),
  rol("temporal", { nombre: "Temporal" }),
];
const CATALOGO = [
  ...[1, 2, 3, 4].map((n) => ({ clave: `p${n}`, modulo: "pedidos", descripcion: `Permiso ${n}` })),
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

describe("Roles: eliminar", () => {
  beforeEach(() => vi.clearAllMocks());

  it("roles de sistema: candado deshabilitado con aria-label, sin píldora ni texto repetido (0.7c)", async () => {
    await montar();
    for (const nombre of ["Administrador", "Mesero"]) {
      const celda = within(fila(nombre));
      const candado = celda.getByRole("button", { name: "Rol de sistema: no se puede eliminar" });
      expect(candado).toBeDisabled();
      expect(candado).toHaveAttribute("title", "Rol de sistema: no se puede eliminar");
      expect(celda.queryByText("Protegido")).not.toBeInTheDocument();
      expect(celda.queryByRole("button", { name: /^eliminar/i })).not.toBeInTheDocument();
    }
    // Admin no se edita; los demás roles de sistema sí
    expect(within(fila("Administrador")).queryByRole("button", { name: /editar/i })).not.toBeInTheDocument();
    expect(within(fila("Mesero")).getByRole("button", { name: /editar/i })).toBeInTheDocument();
    // Una sola nota explicativa arriba de la tabla
    expect(screen.getAllByText(/los roles de sistema/i)).toHaveLength(1);
    expect(screen.queryByText("Rol de sistema: no se puede eliminar.")).not.toBeInTheDocument();
  });

  it("permisos: máximo 2 etiquetas y '+N más' que despliega el resto (0.7c)", async () => {
    await montar();
    const celda = within(fila("Supervisor"));
    expect(celda.getAllByText(/^Permiso \d$/)).toHaveLength(2);
    const mas = celda.getByRole("button", { name: "+2 más" });
    expect(mas).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(mas);
    expect(celda.getAllByText(/^Permiso \d$/)).toHaveLength(4);
    expect(celda.getByRole("button", { name: "Ver menos" })).toHaveAttribute("aria-expanded", "true");
  });

  it("rol con usuarios: Eliminar deshabilitado con el motivo", async () => {
    await montar();
    const celda = within(fila("Supervisor"));
    expect(celda.getByRole("button", { name: /eliminar/i })).toBeDisabled();
    expect(celda.getByText("Tiene 2 usuarios asignados")).toBeInTheDocument();
  });

  it("rol personalizado vacío: confirma y desaparece de la lista", async () => {
    await montar();
    fireEvent.click(within(fila("Temporal")).getByRole("button", { name: /eliminar/i }));
    const dialogo = screen.getByRole("dialog");
    expect(dialogo).toHaveTextContent("Temporal");
    fireEvent.click(within(dialogo).getByRole("button", { name: "Eliminar rol" }));
    await waitFor(() => expect(adminApi.delete).toHaveBeenCalledWith("/v1/admin/roles/id-temporal"));
    await waitFor(() => expect(screen.queryByText("Temporal", { selector: "strong" })).not.toBeInTheDocument());
  });

  it("si el backend lo rechaza, muestra su mensaje en el diálogo", async () => {
    await montar();
    adminApi.delete.mockRejectedValueOnce(new Error("No se puede eliminar: tiene 1 usuario asignado."));
    fireEvent.click(within(fila("Temporal")).getByRole("button", { name: /eliminar/i }));
    fireEvent.click(screen.getByRole("button", { name: "Eliminar rol" }));
    expect(await screen.findByRole("alertdialog")).toHaveTextContent("No se puede eliminar: tiene 1 usuario asignado.");
  });

  it("plural en usuarios asignados", async () => {
    await montar();
    expect(within(fila("Administrador")).getByText("1 usuario")).toBeInTheDocument();
    expect(within(fila("Temporal")).getByText("0 usuarios")).toBeInTheDocument();
  });
});
