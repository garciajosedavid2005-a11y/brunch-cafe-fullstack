import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { DialogoProvider } from "../../../context/DialogoContext";
import EstadoSelector from "./EstadoSelector";

const ITEM = {
  estado: "Pendiente",
  estadoCodigo: "pendiente",
  transiciones: [
    { codigo: "confirmada", nombre: "Confirmada", requiereMotivo: false },
    { codigo: "cancelada", nombre: "Cancelada", requiereMotivo: true },
  ],
};

const montar = (onCambiar) =>
  render(<DialogoProvider><EstadoSelector item={ITEM} onCambiar={onCambiar} /></DialogoProvider>);

describe("EstadoSelector", () => {
  it("solo ofrece el estado actual y las transiciones permitidas", () => {
    montar(vi.fn());
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Pendiente", "→ Confirmada", "→ Cancelada"]);
  });

  it("sin motivo requerido cambia directamente", async () => {
    const onCambiar = vi.fn();
    montar(onCambiar);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "confirmada" } });
    await waitFor(() => expect(onCambiar).toHaveBeenCalledWith("confirmada", ""));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("cancelar pide el motivo en el diálogo (no con prompt) y lo envía", async () => {
    const onCambiar = vi.fn();
    montar(onCambiar);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "cancelada" } });
    const dialogo = await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "Sí, cancelar" }));
    expect(dialogo).toHaveTextContent(/escribe el motivo/i);
    expect(onCambiar).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/motivo/i), { target: { value: "Sin cupo" } });
    fireEvent.click(screen.getByRole("button", { name: "Sí, cancelar" }));
    await waitFor(() => expect(onCambiar).toHaveBeenCalledWith("cancelada", "Sin cupo"));
  });

  it("si desiste, no cambia", async () => {
    const onCambiar = vi.fn();
    montar(onCambiar);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "cancelada" } });
    fireEvent.click(await screen.findByRole("button", { name: "Volver" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(onCambiar).not.toHaveBeenCalled();
  });
});
