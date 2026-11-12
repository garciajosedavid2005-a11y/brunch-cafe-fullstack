import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DialogoProvider } from "../../../context/DialogoContext";

vi.mock("../../../services/api", () => ({ apiRequest: vi.fn() }));

import { apiRequest } from "../../../services/api";
import OrdersSection from "./OrdersSection";

// 1.12 · «Mis pedidos» muestra las opciones elegidas y la nota de cada plato; los pedidos anteriores, igual que antes
describe("Mis pedidos · opciones del plato (1.12)", () => {
  it("lista las opciones con su recargo y la nota; una línea sin opciones se ve como siempre", async () => {
    apiRequest.mockResolvedValue({ orders: [{
      _id: "p1", orderNumber: "ABC123", status: "pending", statusLabel: "Pendiente", total: 43000, createdAt: "2026-11-12T15:00:00Z",
      paymentMethod: "Contra entrega", delivery: { nombre: "Ana", direccion: "Cra 36B Oriente #30-06", barrio: "Centro", hora: "10:00" },
      items: [
        { name: "Huevos al gusto", quantity: 2, unitPrice: 18000, note: "Sin sal",
          options: [{ group: "Término del huevo", option: "Fritos", extraPrice: 0 }, { group: "Extras", option: "Tocineta", extraPrice: 3000 }] },
        { name: "Jugo de naranja", quantity: 1, unitPrice: 7000, options: [], note: "" },
      ],
    }] });
    render(<DialogoProvider><OrdersSection /></DialogoProvider>);
    const huevos = (await screen.findByText("2 × Huevos al gusto")).closest("li");
    expect(huevos).toHaveTextContent("Término del huevo: Fritos · Extras: Tocineta (+ $ 3.000)");
    expect(huevos).toHaveTextContent("Nota: Sin sal");
    expect(huevos).toHaveTextContent("$ 36.000");
    const jugo = screen.getByText("1 × Jugo de naranja").closest("li");
    expect(jugo).toHaveTextContent("$ 7.000");
    expect(jugo).not.toHaveTextContent("Nota:");
  });
});
