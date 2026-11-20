import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { DialogoProvider } from "../../../context/DialogoContext";

// 6.4 (F6-g) · Mis direcciones: lista con la principal, agregar (validando la dirección), editar, hacer principal y
// borrar con confirmación; con 5 guardadas no deja agregar más.
const estado = vi.hoisted(() => ({ apiRequest: vi.fn() }));
vi.mock("../../../services/api", () => ({ apiRequest: estado.apiRequest }));

import DireccionesSection from "./DireccionesSection";

const CASA = { id: "d1", etiqueta: "Casa", direccion: "Cra 36B #30-06", barrio: "Centro", indicaciones: "Torre 2", principal: true };
const OFICINA = { id: "d2", etiqueta: "Oficina", direccion: "Calle 10 #43A-30", barrio: "El Poblado", indicaciones: "", principal: false };
let lista;
beforeEach(() => {
  lista = [CASA, OFICINA];
  estado.apiRequest.mockReset().mockImplementation((ruta, opciones = {}) => {
    if (!opciones.method) return Promise.resolve({ direcciones: lista });
    if (opciones.method === "POST" && ruta === "/v1/cliente/direcciones") return Promise.resolve({ direcciones: [...lista, { ...JSON.parse(opciones.body), id: "d3", principal: false }] });
    if (ruta.endsWith("/principal")) return Promise.resolve({ direcciones: [{ ...OFICINA, principal: true }, { ...CASA, principal: false }] });
    if (opciones.method === "DELETE") return Promise.resolve({ direcciones: [{ ...OFICINA, principal: true }] });
    if (opciones.method === "PATCH") return Promise.resolve({ direcciones: [CASA, { ...OFICINA, ...JSON.parse(opciones.body) }] });
    return Promise.reject(new Error(`Ruta inesperada ${ruta}`));
  });
});

const montar = () => render(<DialogoProvider><DireccionesSection /></DialogoProvider>);
const llamada = (metodo) => estado.apiRequest.mock.calls.find(([, o]) => o?.method === metodo);

describe("6.4 · Mis direcciones", () => {
  it("lista las guardadas con la principal marcada con texto", async () => {
    montar();
    const guardadas = await screen.findByRole("list", { name: "Direcciones guardadas" });
    const casa = within(guardadas).getByRole("heading", { name: "Casa" }).closest("li");
    expect(casa).toHaveTextContent("Principal");
    expect(casa).toHaveTextContent("Cra 36B #30-06 · Centro");
    expect(within(casa).queryByRole("button", { name: /Hacer principal/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hacer principal Oficina" })).toBeInTheDocument();
  });

  it("agrega una dirección válida; una inválida no se envía", async () => {
    montar();
    await screen.findByRole("list", { name: "Direcciones guardadas" });
    fireEvent.change(screen.getByLabelText("Dirección"), { target: { value: "mi casa" } });
    fireEvent.change(screen.getByLabelText("Barrio"), { target: { value: "Laureles" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar dirección" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Ingresa una dirección válida");
    expect(llamada("POST")).toBeUndefined();

    fireEvent.change(screen.getByLabelText("Dirección"), { target: { value: "  Calle 33   #70-12 " } });
    fireEvent.change(screen.getByLabelText("Nombre (opcional)"), { target: { value: "Mamá" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar dirección" }));
    expect(await screen.findByText("Dirección guardada.")).toBeInTheDocument();
    expect(JSON.parse(llamada("POST")[1].body)).toEqual({ etiqueta: "Mamá", direccion: "Calle 33 #70-12", barrio: "Laureles", indicaciones: "" });
    expect(screen.getByRole("heading", { name: "Mamá" })).toBeInTheDocument();
  });

  it("editar carga el formulario y guarda con PATCH; hacer principal y borrar (con confirmación)", async () => {
    montar();
    fireEvent.click(await screen.findByRole("button", { name: "Editar Oficina" }));
    expect(screen.getByLabelText("Dirección")).toHaveValue("Calle 10 #43A-30");
    fireEvent.change(screen.getByLabelText("Indicaciones (opcional)"), { target: { value: "Piso 4" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    expect(await screen.findByText("Dirección actualizada.")).toBeInTheDocument();
    expect(llamada("PATCH")[0]).toBe("/v1/cliente/direcciones/d2");

    fireEvent.click(screen.getByRole("button", { name: "Hacer principal Oficina" }));
    expect(await screen.findByText("Dirección principal actualizada.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Borrar Casa" }));
    const dialogo = await screen.findByRole("dialog");
    expect(dialogo).toHaveTextContent("Tus pedidos anteriores no cambian.");
    fireEvent.click(within(dialogo).getByRole("button", { name: "Borrar" }));
    expect(await screen.findByText("Dirección borrada.")).toBeInTheDocument();
    expect(llamada("DELETE")[0]).toBe("/v1/cliente/direcciones/d1");
  });

  it("con 5 guardadas no muestra el formulario de agregar", async () => {
    lista = [1, 2, 3, 4, 5].map((n) => ({ ...OFICINA, id: `d${n}`, etiqueta: `Dir ${n}`, principal: n === 1 }));
    montar();
    expect(await screen.findByText("Ya tienes 5 direcciones: borra una para agregar otra.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Guardar dirección" })).not.toBeInTheDocument();
  });
});
