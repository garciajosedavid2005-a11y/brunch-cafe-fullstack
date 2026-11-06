import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../../services/api", () => ({ apiRequest: vi.fn() }));

import { apiRequest } from "../../services/api";
import ListaComentarios from "./ListaComentarios";

describe("Comentarios públicos: compra verificada (0.12)", () => {
  it("marca solo las reseñas verificadas", async () => {
    apiRequest.mockResolvedValue({
      reviews: [
        { _id: "a", nombre: "Ana Pérez", calificacion: 5, comentario: "Excelente latte de verdad", verificada: true, createdAt: "2026-11-05T15:00:00Z" },
        { _id: "b", nombre: "Luis Gómez", calificacion: 4, comentario: "Reseña anterior a la regla", verificada: false, createdAt: "2026-11-01T15:00:00Z" },
      ],
    });
    render(<MemoryRouter><ListaComentarios /></MemoryRouter>);
    await screen.findByText("Excelente latte de verdad");
    expect(screen.getAllByText("Compra verificada")).toHaveLength(1);
  });
});
