import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../../../services/api", () => ({ apiRequest: vi.fn() }));

import { apiRequest } from "../../../services/api";
import ReviewsSection from "./ReviewsSection";

const PROPIA = {
  _id: "c1", tipo: "producto", productoId: 7, calificacion: 5, comentario: "Muy rico y bien servido",
  verificada: true, createdAt: "2026-11-05T15:00:00.000Z",
};
const MENU = [{ id: "p7", codigo: 7, nombre: "Latte" }];

const montar = () => render(<MemoryRouter><ReviewsSection /></MemoryRouter>);

describe("Mis comentarios (0.12): verificada y edición", () => {
  beforeEach(() => {
    apiRequest.mockReset();
    apiRequest.mockImplementation((ruta, opciones) => {
      if (ruta === "/v1/catalogo") return Promise.resolve({ productos: MENU });
      if (opciones?.method === "PATCH") return Promise.resolve({ review: { ...PROPIA, ...JSON.parse(opciones.body) } });
      return Promise.resolve({ reviews: [PROPIA] });
    });
  });

  it("marca la reseña como compra verificada", async () => {
    montar();
    const tarjeta = (await screen.findByText("Muy rico y bien servido")).closest("article");
    expect(within(tarjeta).getByText("Compra verificada")).toBeInTheDocument();
  });

  it("edita la propia: calificación y texto con PATCH", async () => {
    montar();
    fireEvent.click(await screen.findByRole("button", { name: "Editar" }));
    const formulario = screen.getByRole("form", { name: "Editar reseña" });
    fireEvent.click(within(formulario).getByRole("radio", { name: "3 estrellas" }));
    fireEvent.change(within(formulario).getByLabelText("Comentario"), { target: { value: "Bien, aunque llegó algo frío" } });
    fireEvent.click(within(formulario).getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith("/v1/cliente/comentarios/c1", {
      method: "PATCH", body: JSON.stringify({ calificacion: 3, comentario: "Bien, aunque llegó algo frío" }),
    }));
    expect(await screen.findByText("Bien, aunque llegó algo frío")).toBeInTheDocument();
    expect(screen.queryByRole("form", { name: "Editar reseña" })).toBeNull();
  });

  it("si ya reseñó el producto (409) lo dice y abre la edición de esa reseña", async () => {
    apiRequest.mockImplementation((ruta, opciones) => {
      if (ruta === "/v1/catalogo") return Promise.resolve({ productos: MENU });
      if (opciones?.method === "POST") {
        return Promise.reject(Object.assign(new Error("Ya dejaste una reseña de este producto."), { code: "RESENA_EXISTENTE", details: { id: "c1" }, status: 409 }));
      }
      return Promise.resolve({ reviews: [PROPIA] });
    });
    montar();
    await screen.findByText("Muy rico y bien servido");
    fireEvent.click(screen.getByRole("radio", { name: "4 estrellas" }));
    fireEvent.change(screen.getAllByLabelText("Comentario")[0], { target: { value: "Otra opinión del mismo latte" } });
    fireEvent.click(screen.getByRole("button", { name: "Publicar comentario" }));
    expect(await screen.findByText(/ya dejaste una reseña/i)).toBeInTheDocument();
    expect(screen.getByRole("form", { name: "Editar reseña" })).toBeInTheDocument();
  });
});
