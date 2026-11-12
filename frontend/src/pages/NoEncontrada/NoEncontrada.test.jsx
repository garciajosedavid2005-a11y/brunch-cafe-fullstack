// 2.0b · Una ruta que no existe ya no deja la página vacía: avisa y ofrece volver
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import NoEncontrada from "./NoEncontrada";

describe("Página no encontrada (2.0b)", () => {
  it("dice que la página no existe y enlaza al inicio y al menú", () => {
    render(
      <MemoryRouter initialEntries={["/esta-pagina-no-existe"]}>
        <Routes><Route path="*" element={<NoEncontrada />} /></Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { level: 1, name: "No encontramos esta página" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Volver al inicio" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Ver el menú" })).toHaveAttribute("href", "/menu");
  });
});
