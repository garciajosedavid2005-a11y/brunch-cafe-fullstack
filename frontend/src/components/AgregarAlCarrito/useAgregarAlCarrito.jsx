import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useCarrito } from "../../context/CarritoContext";
import { useAvisoCarrito } from "../../context/useAvisoCarrito";
import { volarAlCarrito } from "./animacionCarrito";
import DialogoProducto from "../../pages/StaffDashboard/comanda/DialogoProducto";
import { MAX_CANTIDAD_LINEA } from "../../utils/pedido";

// 1.12 · «Agregar al carrito» desde el menú o los destacados. Un plato con grupos de opciones abre el
// MISMO diálogo que la toma de comanda del salón (obligatorios, mínimo y máximo, recargo a la vista y
// nota); sin grupos se agrega directo, como antes. El carrito guarda nombres y recargos solo para
// mostrarlos: el backend valida las opciones y calcula el precio.
// 7.1 · Al agregar (directo o al confirmar el diálogo): la miniatura vuela al carrito, el botón dice
// «✓ Agregado» durante DURACION_AGREGADO_MS y sale el aviso con «Ver carrito».
export const DURACION_AGREGADO_MS = 1500;

export function useAgregarAlCarrito(producto) {
  const { agregarProducto } = useCarrito();
  const { avisarAgregado } = useAvisoCarrito();
  const [abierto, setAbierto] = useState(false);
  const [agregado, setAgregado] = useState(false);
  const temporizador = useRef(null);
  const origen = useRef(null); // imagen de la tarjeta, de donde sale el vuelo
  const grupos = producto.modificadores || [];
  const { id, nombre, descripcion, precio, imagen } = producto;
  const base = { id, nombre, descripcion, precio, imagen };

  useEffect(() => () => window.clearTimeout(temporizador.current), []);

  const celebrar = () => {
    volarAlCarrito(origen.current, imagen);
    avisarAgregado(nombre);
    setAgregado(true);
    window.clearTimeout(temporizador.current);
    temporizador.current = window.setTimeout(() => setAgregado(false), DURACION_AGREGADO_MS);
  };

  const agregar = (evento) => {
    origen.current = evento?.currentTarget?.closest?.("article")?.querySelector("[data-vuelo-origen]") ?? null;
    if (grupos.length) setAbierto(true);
    else {
      agregarProducto(base);
      celebrar();
    }
  };

  const alAgregar = ({ cantidad, nota, modificadores }) => {
    const elegidos = modificadores.map(({ grupoId, opcionIds }) => {
      const grupo = grupos.find((g) => g.id === grupoId);
      return {
        grupoId,
        grupo: grupo.nombre,
        opciones: grupo.opciones.filter((o) => opcionIds.includes(o.id))
          .map((o) => ({ id: o.id, nombre: o.nombre, precioExtra: o.precioExtra })),
      };
    });
    agregarProducto(base, { cantidad, nota: nota || "", modificadores: elegidos });
    setAbierto(false);
    celebrar();
    return null; // sin error: el diálogo no muestra nada más
  };

  // En un portal: las tarjetas del menú tienen transform (animación de entrada) y encerrarían el modal fijo
  const dialogo = abierto ? createPortal(
    <DialogoProducto
      producto={producto}
      onAgregar={alAgregar}
      onCerrar={() => setAbierto(false)}
      maxCantidad={MAX_CANTIDAD_LINEA}
      textoAgregar="Agregar al carrito"
      etiquetaNota="Nota para la cocina (opcional)"
    />,
    document.body,
  ) : null;

  return { agregar, dialogo, agregado };
}
