import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

// 2.7 · Agotar («86») y reactivar desde la operación (F2-5): el estado en texto (no solo color), agotar con
// confirmación (quien solo agota no puede deshacerlo), reactivar solo con producto:reactivar, filtro por
// estación y búsqueda, y actualización en vivo por el canal «catalogo».
const estado = vi.hoisted(() => ({ apiRequest: vi.fn(), confirmar: vi.fn(), avisar: vi.fn() }));
vi.mock("../../../services/api", () => ({ apiRequest: estado.apiRequest, API_URL: "http://api.test" }));
vi.mock("../../../context/useDialogo", () => ({ useDialogo: () => ({ confirmar: estado.confirmar, avisar: estado.avisar }) }));

import PanelAgotados from "./PanelAgotados";

const COCINA = { codigo: "cocina", nombre: "Cocina" };
const BARRA = { codigo: "barra", nombre: "Barra" };
const LISTADO = () => ({
  productos: [
    { id: "p1", nombre: "Huevos rancheros", categoria: "Desayunos", estacion: COCINA, disponible: true, grupos: [] },
    { id: "p2", nombre: "Latte", categoria: "Bebidas", estacion: BARRA, disponible: false, grupos: ["g1"] },
    { id: "p3", nombre: "Tostada francesa", categoria: "Desayunos", estacion: COCINA, disponible: true, grupos: [] },
  ],
  grupos: [{ id: "g1", nombre: "Leche", opciones: [{ id: "o1", nombre: "Entera", disponible: true }, { id: "o2", nombre: "Avena", disponible: false }] }],
});

class FakeEventSource {
  static instancias = [];
  static CLOSED = 2;
  constructor(url) { this.url = url; FakeEventSource.instancias.push(this); }
  addEventListener() {}
  close() {}
}

let respuestas;
beforeEach(() => {
  FakeEventSource.instancias = [];
  globalThis.EventSource = FakeEventSource;
  respuestas = { listado: LISTADO(), post: () => Promise.resolve({ cambiado: true }) };
  estado.confirmar.mockReset().mockResolvedValue({ confirmado: true });
  estado.avisar.mockReset();
  estado.apiRequest.mockReset().mockImplementation((ruta, opciones = {}) => {
    if (ruta === "/v1/staff/agotados" && !opciones.method) return Promise.resolve(respuestas.listado);
    return respuestas.post(ruta, opciones);
  });
});
afterEach(() => { delete globalThis.EventSource; });

const AGOTA = ["producto:agotar"];
const AMBOS = ["producto:agotar", "producto:reactivar"];
const fila = (nombre) => screen.getByText(nombre, { selector: "strong" }).closest("li");
const posts = () => estado.apiRequest.mock.calls.filter(([, o]) => o?.method === "POST");

describe("Panel «Agotados» (2.7)", () => {
  it("cada producto y opción dice su estado en texto; los agotados primero", async () => {
    render(<PanelAgotados permisos={AMBOS} />);
    const productos = await screen.findByRole("list", { name: "Productos" });
    const nombres = within(productos).getAllByRole("listitem").map((li) => li.querySelector("strong").textContent);
    expect(nombres).toEqual(["Latte", "Huevos rancheros", "Tostada francesa"]);
    expect(fila("Latte")).toHaveTextContent("Agotado");
    expect(fila("Huevos rancheros")).toHaveTextContent("Disponible");
    const opciones = screen.getByRole("list", { name: "Opciones: Leche" });
    expect(within(opciones).getByText("Avena", { selector: "strong" }).closest("li")).toHaveTextContent("Agotado");
  });

  it("agotar pide confirmación (avisando que no podrá reactivarlo) y envía disponible: false", async () => {
    render(<PanelAgotados permisos={AGOTA} />);
    await screen.findByRole("list", { name: "Productos" });
    fireEvent.click(screen.getByRole("button", { name: "Agotar Huevos rancheros" }));
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(estado.confirmar.mock.calls[0][0].mensaje).toMatch(/Solo quien tenga permiso para reactivar/);
    expect(posts()[0][0]).toBe("/v1/staff/agotados/productos/p1");
    expect(JSON.parse(posts()[0][1].body)).toEqual({ disponible: false });
  });

  it("si cancela la confirmación no se envía nada", async () => {
    estado.confirmar.mockResolvedValue({ confirmado: false });
    render(<PanelAgotados permisos={AGOTA} />);
    await screen.findByRole("list", { name: "Productos" });
    fireEvent.click(screen.getByRole("button", { name: "Agotar Huevos rancheros" }));
    await act(async () => {});
    expect(posts()).toHaveLength(0);
  });

  it("sin producto:reactivar no se ofrece «Reactivar»; con él, reactiva sin confirmar (producto y opción)", async () => {
    const { unmount } = render(<PanelAgotados permisos={AGOTA} />);
    await screen.findByRole("list", { name: "Productos" });
    expect(screen.queryByRole("button", { name: /^Reactivar/ })).not.toBeInTheDocument();
    expect(screen.getAllByText("Reactivar requiere permiso").length).toBeGreaterThan(0);
    unmount();
    render(<PanelAgotados permisos={AMBOS} />);
    await screen.findByRole("list", { name: "Productos" });
    fireEvent.click(screen.getByRole("button", { name: "Reactivar Latte" }));
    // Un cambio a la vez: los botones vuelven a estar activos al terminar el anterior
    await waitFor(() => expect(screen.getByRole("button", { name: "Reactivar Avena (Leche)" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Reactivar Avena (Leche)" }));
    await waitFor(() => expect(posts()).toHaveLength(2));
    expect(posts().map(([r, o]) => [r, JSON.parse(o.body)])).toEqual([
      ["/v1/staff/agotados/productos/p2", { disponible: true }],
      ["/v1/staff/agotados/grupos/g1/opciones/o2", { disponible: true }],
    ]);
    expect(estado.confirmar).not.toHaveBeenCalled();
  });

  it("filtra por estación y por nombre; en /kds empieza en la estación de la pantalla", async () => {
    render(<PanelAgotados permisos={AMBOS} estacionInicial="barra" />);
    const productos = await screen.findByRole("list", { name: "Productos" });
    expect(within(productos).getAllByRole("listitem")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Todas" }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Buscar" }), { target: { value: "tostada" } });
    expect(within(productos).getAllByRole("listitem").map((li) => li.querySelector("strong").textContent)).toEqual(["Tostada francesa"]);
  });

  it("si falla (p. ej. 403), lo avisa y vuelve a leer", async () => {
    respuestas.post = () => Promise.reject(Object.assign(new Error("No tienes permiso para realizar esta acción."), { status: 403 }));
    render(<PanelAgotados permisos={AGOTA} />);
    await screen.findByRole("list", { name: "Productos" });
    const lecturas = () => estado.apiRequest.mock.calls.filter(([r, o]) => r === "/v1/staff/agotados" && !o?.method).length;
    const antes = lecturas();
    fireEvent.click(screen.getByRole("button", { name: "Agotar Huevos rancheros" }));
    await waitFor(() => expect(estado.avisar).toHaveBeenCalled());
    expect(estado.avisar.mock.calls[0][0]).toMatchObject({ tipo: "error", mensaje: "No tienes permiso para realizar esta acción." });
    await waitFor(() => expect(lecturas()).toBeGreaterThan(antes));
  });

  it("escucha «catalogo» y relee al llegar un cambio de otra pantalla", async () => {
    render(<PanelAgotados permisos={AMBOS} />);
    await screen.findByRole("list", { name: "Productos" });
    const fuente = FakeEventSource.instancias.at(-1);
    expect(new URL(fuente.url).searchParams.get("canales")).toBe("catalogo");
    respuestas.listado = { ...LISTADO(), productos: LISTADO().productos.map((p) => (p.id === "p1" ? { ...p, disponible: false } : p)) };
    await act(async () => { fuente.onmessage({ data: JSON.stringify({ canal: "catalogo", tipo: "disponibilidad", ids: { productoId: "p1" } }) }); });
    expect(fila("Huevos rancheros")).toHaveTextContent("Agotado");
  });
});
