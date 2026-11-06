// 0.14: Admin › Resumen y Admin › Comentarios caben a 1280 px (tablas compactas) y la tarjeta
// de satisfacción dice el dato real en lugar de un texto fijo.
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { DialogoProvider } from "../../../context/DialogoContext";

vi.mock("../../../services/api", () => ({
  apiRequest: vi.fn(),
  api: { get: vi.fn(), patch: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

import { api } from "../../../services/api";
import OverviewSection from "./OverviewSection";
import ReviewsSection from "./ReviewsSection";

const COMENTARIO = {
  id: "c1", autor: "Emperatriz Gonzalez", correo: "empera@example.com", tipo: "General", producto: "",
  calificacion: 4, comentario: "Muy bello el lugar", visible: true, verificada: true, fecha: "2026-11-05T15:00:00Z",
};
const encabezados = (tabla) => within(tabla).getAllByRole("columnheader").map((th) => th.textContent);

describe("Admin › Resumen", () => {
  it("las tablas de pedidos y reservas tienen 2 columnas", async () => {
    api.get.mockReset().mockImplementation((ruta) => Promise.resolve(ruta.includes("comentarios") ? [COMENTARIO] : []));
    render(<OverviewSection onNavigateTab={() => {}} />);
    const [pedidos, reservas] = await screen.findAllByRole("table");
    expect(encabezados(pedidos)).toEqual(["Pedido", "Total"]);
    expect(encabezados(reservas)).toEqual(["Reserva", "Fecha"]);
    expect(screen.getByText("1 opinión")).toBeInTheDocument(); // singular
  });
});

describe("Admin › Comentarios", () => {
  const montar = (lista) => {
    api.get.mockReset().mockResolvedValue(lista);
    return render(<DialogoProvider><ReviewsSection /></DialogoProvider>);
  };

  it("la tabla tiene 4 columnas y marca las verificadas", async () => {
    montar([COMENTARIO]);
    const tabla = await screen.findByRole("table");
    expect(encabezados(tabla)).toEqual(["Cliente", "Reseña", "Estado", "Acciones"]);
    expect(await within(tabla).findByText("Compra verificada")).toBeInTheDocument();
  });

  it("satisfacción: dice cuántas opiniones tienen 5 estrellas, sin un texto fijo", async () => {
    montar([COMENTARIO, { ...COMENTARIO, id: "c2", calificacion: 5 }]);
    expect(await screen.findByText("1 de 2 opiniones con 5 estrellas")).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(screen.queryByText(/mayoría de clientes satisfechos/i)).toBeNull();
    expect(screen.getByText("Basado en 2 opiniones")).toBeInTheDocument();
  });

  it("sin opiniones no muestra un porcentaje", async () => {
    montar([]);
    expect(await screen.findByText("Aún no hay opiniones")).toBeInTheDocument();
    expect(screen.queryByText("0%")).toBeNull();
  });
});
