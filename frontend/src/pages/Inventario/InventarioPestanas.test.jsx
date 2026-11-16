import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { DialogoProvider } from "../../context/DialogoContext";

vi.mock("../../services/api", () => ({
  apiRequest: vi.fn(),
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn(), patch: vi.fn() },
}));

import { api, apiRequest } from "../../services/api";
import Inventario from "./Inventario";

// Fase 5 · 5.2 a 5.5 · Pestañas del inventario: recetas, ajustes manuales, compras y alertas
const INSUMOS = [
  { id: "i1", nombre: "Leche entera", unidad: "ml", existencia: 8000, minimo: 2000, costoPromedio: 4.2, valor: 33600, activo: true, nivel: "ok", version: 0 },
  { id: "i2", nombre: "Leche de almendra", unidad: "ml", existencia: 1000, minimo: 2000, costoPromedio: 12, valor: 12000, activo: true, nivel: "bajo", version: 0 },
];
const RECETAS = {
  productos: [{ id: "p1", nombre: "Latte frío", categoria: "Bebidas", precio: 11000, disponible: true, grupos: ["g1"], costo: 1740, version: 0,
    lineas: [{ insumoId: "i1", insumo: "Leche entera", unidad: "ml", activo: true, cantidad: 200, merma: 5, reemplazaId: null, reemplaza: null }] }],
  grupos: [{ id: "g1", nombre: "Leche", opciones: [{ id: "o1", nombre: "Almendra", version: null, lineas: [] }] }],
  insumos: INSUMOS.map(({ id, nombre, unidad, costoPromedio }) => ({ id, nombre, unidad, costoPromedio })),
};
const ORDEN = {
  id: "oc1", codigo: "OC-000001", proveedor: { id: "pr1", nombre: "Lácteos del Huila" }, estado: "abierta", total: 45000, notas: "", motivoCancelacion: "",
  creadaEn: "2026-11-05T12:00:00Z", cerradaEn: null, version: 0,
  lineas: [{ id: "l1", insumoId: "i1", insumo: "Leche entera", unidad: "ml", cantidad: 10000, costoUnitario: 4.5, recibido: 0, pendiente: 10000 }],
};
const ALERTAS = {
  hoy: "2026-11-05",
  stockBajo: [{ id: "i2", nombre: "Leche de almendra", unidad: "ml", existencia: 1000, minimo: 2000, nivel: "bajo" }],
  vencimientos: [{ id: "lo1", insumoId: "i1", insumo: "Leche entera", unidad: "ml", vencimiento: "2026-11-08", vencido: false, ordenCodigo: "OC-000001", recibido: 4000, restante: 2500 }],
};
const RESPUESTAS = {
  "/v1/inventario/insumos": INSUMOS, "/v1/inventario/recetas": RECETAS, "/v1/inventario/ordenes": [ORDEN],
  "/v1/inventario/proveedores": [{ id: "pr1", nombre: "Lácteos del Huila", nit: "", contacto: "", telefono: "", correo: "", notas: "", activo: true, version: 0 }],
  "/v1/inventario/alertas": ALERTAS,
};
const TODOS = ["inventario:ver", "inventario:gestionar", "inventario:ajustar", "compra:gestionar", "compra:recibir"];

const montar = (permisos = TODOS, inicial) => {
  api.get.mockImplementation((ruta) => Promise.resolve(RESPUESTAS[ruta]));
  render(<DialogoProvider><Inventario permisos={permisos} inicial={inicial} /></DialogoProvider>);
};

describe("Inventario › pestañas de la Fase 5", () => {
  beforeEach(() => {
    for (const fn of Object.values(api)) fn.mockReset();
    apiRequest.mockReset();
  });

  it("recetas: muestra la receta con merma, el costo y el margen, y guarda la de una opción que reemplaza", async () => {
    montar(TODOS, "recetas");
    const tabla = await screen.findByRole("table", { name: "Recetas de los productos" });
    const fila = within(tabla).getByText("Latte frío").closest("tr");
    expect(fila).toHaveTextContent("Leche entera 200 ml (+5 % merma)");
    expect(fila).toHaveTextContent("84 %");
    api.put.mockResolvedValue({});
    fireEvent.click(screen.getByRole("button", { name: "Editar receta de Leche › Almendra" }));
    const dialogo = screen.getByRole("dialog", { name: "Leche › Almendra" });
    fireEvent.change(within(dialogo).getByLabelText("Insumo"), { target: { value: "i2" } });
    fireEvent.change(within(dialogo).getByLabelText(/Cantidad/), { target: { value: "200" } });
    fireEvent.change(within(dialogo).getByLabelText("En lugar de"), { target: { value: "i1" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Guardar receta" }));
    await waitFor(() => expect(api.put).toHaveBeenCalledWith("/v1/inventario/recetas/grupos/g1/opciones/o1", { lineas: [{ insumoId: "i2", cantidad: 200, merma: 0, reemplazaId: "i1" }] }));
  });

  it("ajuste manual: una merma pide motivo y envía la cantidad positiva; un conteo que da menos envía negativo", async () => {
    montar();
    await screen.findByRole("table", { name: "Insumos del inventario" });
    apiRequest.mockResolvedValue({});
    fireEvent.click(await screen.findByRole("button", { name: "Ajustar existencia de Leche entera" }));
    let dialogo = screen.getByRole("dialog", { name: "Movimiento de Leche entera" });
    fireEvent.click(within(dialogo).getByLabelText(/Menos de lo registrado/));
    fireEvent.change(within(dialogo).getByLabelText(/Cantidad/), { target: { value: "250" } });
    fireEvent.change(within(dialogo).getByLabelText("Motivo *"), { target: { value: "conteo del cierre" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Registrar" }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith("/v1/inventario/movimientos", expect.objectContaining({
      method: "POST", headers: { "Idempotency-Key": expect.any(String) },
    })));
    expect(JSON.parse(apiRequest.mock.calls[0][1].body)).toEqual({ insumoId: "i1", tipo: "ajuste", cantidad: -250, motivo: "conteo del cierre" });

    fireEvent.click(await screen.findByRole("button", { name: "Ajustar existencia de Leche entera" }));
    dialogo = screen.getByRole("dialog", { name: "Movimiento de Leche entera" });
    fireEvent.change(within(dialogo).getByLabelText("Tipo *"), { target: { value: "merma" } });
    fireEvent.change(within(dialogo).getByLabelText(/Cantidad/), { target: { value: "100" } });
    fireEvent.change(within(dialogo).getByLabelText("Motivo *"), { target: { value: "se cortó" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Registrar" }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(2));
    expect(JSON.parse(apiRequest.mock.calls[1][1].body)).toEqual({ insumoId: "i1", tipo: "merma", cantidad: 100, motivo: "se cortó" });
    // Cada formulario abierto lleva su propia clave
    expect(apiRequest.mock.calls[1][1].headers["Idempotency-Key"]).not.toBe(apiRequest.mock.calls[0][1].headers["Idempotency-Key"]);
  });

  it("compras: recibir una orden envía lo que llegó, el costo y el vencimiento con la versión", async () => {
    montar(TODOS, "compras");
    const tabla = await screen.findByRole("table", { name: "Órdenes de compra" });
    expect(within(tabla).getByText("OC-000001").closest("tr")).toHaveTextContent("Abierta");
    api.post.mockResolvedValue({});
    fireEvent.click(screen.getByRole("button", { name: "Recibir OC-000001" }));
    const dialogo = screen.getByRole("dialog", { name: "Recibir OC-000001" });
    fireEvent.change(within(dialogo).getByLabelText(/Llegó/), { target: { value: "6000" } });
    fireEvent.change(within(dialogo).getByLabelText("Vence"), { target: { value: "2026-11-20" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Registrar recepción" }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/v1/inventario/ordenes/oc1/recepciones", {
      versionEsperada: 0, lineas: [{ lineaId: "l1", cantidad: 6000, costoUnitario: 4.5, vencimiento: "2026-11-20" }],
    }));
  });

  it("sin compra:recibir no se ofrece recibir; sin permisos de compras no aparece la pestaña", async () => {
    montar(["inventario:ver"], "compras");
    await screen.findByRole("table", { name: "Órdenes de compra" });
    expect(screen.queryByRole("button", { name: "Recibir OC-000001" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Nueva orden" })).toBeNull();
  });

  it("alertas: stock bajo y vencimiento con texto; registrar el vencimiento pide motivo", async () => {
    montar(TODOS, "alertas");
    expect(await screen.findByText(/Stock bajo \(1\)/)).toBeInTheDocument();
    expect(screen.getByText(/Vencen en 7 días \(1\)/)).toBeInTheDocument();
    expect(screen.getByText(/Quedan unos 2\.500 ml/)).toBeInTheDocument();
    api.post.mockResolvedValue({});
    fireEvent.click(screen.getByRole("button", { name: "Registrar vencimiento" }));
    const dialogo = screen.getByRole("dialog", { name: "Registrar vencimiento" });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Registrar vencimiento" }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/v1/inventario/lotes/lo1/descartar", { motivo: "Leche entera vencido" }));
  });
});
