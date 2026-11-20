import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("../../../services/api", () => ({ apiRequest: vi.fn() }));

import { apiRequest } from "../../../services/api";
import EntregaPedido from "./EntregaPedido";

// 6.2 (F6-2) · Entrega del domicilio y repartidor asignado
const PEDIDO = {
  id: "p1", estadoCodigo: "listo", direccion: "Carrera 36B #30-06", barrio: "Centro", hora: "10:00", telefono: "3001234567",
  repartidor: null,
};
const REPARTIDORES = [{ id: "r1", nombre: "Rubén R." }, { id: "r2", nombre: "Rosa M." }];

describe("EntregaPedido", () => {
  beforeEach(() => apiRequest.mockReset());

  it("muestra dirección, hora y teléfono; sin permiso solo lee el repartidor", () => {
    render(<EntregaPedido pedido={{ ...PEDIDO, repartidor: { id: "r1", nombre: "Rubén R." } }} repartidores={[]} puedeAsignar={false} onActualizado={() => {}} />);
    expect(screen.getByText(/Carrera 36B #30-06, Centro · 10:00 · Tel\. 3001234567/)).toBeInTheDocument();
    expect(screen.getByText("Rubén R.")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("con pedido:asignar_repartidor elige el repartidor y envía el PATCH", async () => {
    const onActualizado = vi.fn();
    apiRequest.mockResolvedValue({ ...PEDIDO, repartidor: { id: "r2", nombre: "Rosa M." } });
    render(<EntregaPedido pedido={PEDIDO} repartidores={REPARTIDORES} puedeAsignar onActualizado={onActualizado} />);
    fireEvent.change(screen.getByLabelText("Repartidor"), { target: { value: "r2" } });
    await waitFor(() => expect(onActualizado).toHaveBeenCalled());
    expect(apiRequest).toHaveBeenCalledWith("/v1/staff/pedidos/p1/repartidor", { method: "PATCH", body: JSON.stringify({ repartidorId: "r2" }) });
  });

  it("en camino ya no se cambia (solo lectura)", () => {
    render(<EntregaPedido pedido={{ ...PEDIDO, estadoCodigo: "en_camino" }} repartidores={REPARTIDORES} puedeAsignar onActualizado={() => {}} />);
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.getByText("sin asignar")).toBeInTheDocument();
  });

  it("muestra el error del servidor al asignar", async () => {
    apiRequest.mockRejectedValueOnce(Object.assign(new Error("El repartidor se asigna antes de que el pedido salga."), { code: "PEDIDO_NO_ASIGNABLE" }));
    render(<EntregaPedido pedido={PEDIDO} repartidores={REPARTIDORES} puedeAsignar onActualizado={() => {}} />);
    fireEvent.change(screen.getByLabelText("Repartidor"), { target: { value: "r1" } });
    expect(await screen.findByRole("alert")).toHaveTextContent("antes de que el pedido salga");
  });
});
