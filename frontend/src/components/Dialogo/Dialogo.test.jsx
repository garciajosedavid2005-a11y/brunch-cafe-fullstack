import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { useState } from "react";
import { DialogoProvider } from "../../context/DialogoContext";
import { useDialogo } from "../../context/useDialogo";

// Botón que abre un diálogo y muestra el resultado
function Prueba({ opciones, aviso = false }) {
  const { confirmar, avisar } = useDialogo();
  const [resultado, setResultado] = useState("");
  const abrir = async () => {
    if (aviso) {
      await avisar(opciones);
      setResultado("cerrado");
      return;
    }
    const r = await confirmar(opciones);
    setResultado(JSON.stringify(r));
  };
  return (
    <>
      <button type="button" onClick={abrir}>Abrir</button>
      <output>{resultado}</output>
    </>
  );
}

const montar = (props) => render(<DialogoProvider><Prueba {...props} /></DialogoProvider>);
const BASE = { titulo: "¿Cancelar reserva?", mensaje: "¿Estás seguro?", confirmarTexto: "Sí, cancelar reserva", cancelarTexto: "Volver", peligroso: true };

describe("Diálogo", () => {
  it("es accesible: role dialog, aria-modal y título enlazado", () => {
    montar({ opciones: BASE });
    fireEvent.click(screen.getByText("Abrir"));
    const dialogo = screen.getByRole("dialog", { name: "¿Cancelar reserva?" });
    expect(dialogo).toHaveAttribute("aria-modal", "true");
    expect(dialogo).toHaveAccessibleDescription("¿Estás seguro?");
  });

  it("acción peligrosa en rojo y el foco empieza en 'Volver'", () => {
    montar({ opciones: BASE });
    fireEvent.click(screen.getByText("Abrir"));
    expect(screen.getByRole("button", { name: "Sí, cancelar reserva" })).toHaveClass("dialogo__boton--peligro");
    expect(screen.getByRole("button", { name: "Volver" })).toHaveFocus();
  });

  it("confirmar resuelve confirmado=true", async () => {
    montar({ opciones: BASE });
    fireEvent.click(screen.getByText("Abrir"));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Sí, cancelar reserva" })));
    expect(screen.getByText(/"confirmado":true/)).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("Esc cierra como cancelado y el foco vuelve al botón que lo abrió", async () => {
    montar({ opciones: BASE });
    const abrir = screen.getByText("Abrir");
    abrir.focus();
    fireEvent.click(abrir);
    await act(async () => fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText(/"confirmado":false/)).toBeInTheDocument();
    expect(abrir).toHaveFocus();
  });

  it("clic fuera cierra como cancelado", async () => {
    montar({ opciones: BASE });
    fireEvent.click(screen.getByText("Abrir"));
    await act(async () => fireEvent.mouseDown(screen.getByTestId("dialogo-fondo")));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText(/"confirmado":false/)).toBeInTheDocument();
  });

  it("atrapa el foco: Tab desde el último vuelve al primero y Shift+Tab al revés", () => {
    montar({ opciones: BASE });
    fireEvent.click(screen.getByText("Abrir"));
    const volver = screen.getByRole("button", { name: "Volver" });
    const confirmar = screen.getByRole("button", { name: "Sí, cancelar reserva" });
    confirmar.focus();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Tab" });
    expect(volver).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Tab", shiftKey: true });
    expect(confirmar).toHaveFocus();
  });

  it("motivo obligatorio: no confirma vacío y devuelve el texto", async () => {
    montar({ opciones: { ...BASE, motivo: { etiqueta: "Motivo de la cancelación", requerido: true } } });
    fireEvent.click(screen.getByText("Abrir"));
    const campo = screen.getByLabelText(/motivo de la cancelación/i);
    expect(campo).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Sí, cancelar reserva" }));
    expect(screen.getByText(/escribe el motivo/i)).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.change(campo, { target: { value: "  Sin cupo  " } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Sí, cancelar reserva" })));
    expect(screen.getByText(/"motivo":"Sin cupo"/)).toBeInTheDocument();
  });

  it("aviso de error: alertdialog con un solo botón", async () => {
    montar({ aviso: true, opciones: { titulo: "No se pudo completar", mensaje: "Debe quedar al menos un administrador activo.", tipo: "error" } });
    fireEvent.click(screen.getByText("Abrir"));
    const dialogo = screen.getByRole("alertdialog", { name: "No se pudo completar" });
    expect(dialogo).toHaveTextContent("Debe quedar al menos un administrador activo.");
    expect(screen.getAllByRole("button").filter((b) => dialogo.contains(b))).toHaveLength(1);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Entendido" })));
    expect(screen.getByText("cerrado")).toBeInTheDocument();
  });
});
