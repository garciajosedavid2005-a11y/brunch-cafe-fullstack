import { useState } from "react";
import { createPortal } from "react-dom";
import { useCarrito } from "../../context/CarritoContext";
import DialogoProducto from "../../pages/StaffDashboard/comanda/DialogoProducto";
import { MAX_CANTIDAD_LINEA } from "../../utils/pedido";

// 1.12 · «Agregar al carrito» desde el menú o los destacados. Un plato con grupos de opciones abre el
// MISMO diálogo que la toma de comanda del salón (obligatorios, mínimo y máximo, recargo a la vista y
// nota); sin grupos se agrega directo, como antes. El carrito guarda nombres y recargos solo para
// mostrarlos: el backend valida las opciones y calcula el precio.
export function useAgregarAlCarrito(producto) {
  const { agregarProducto } = useCarrito();
  const [abierto, setAbierto] = useState(false);
  const grupos = producto.modificadores || [];
  const { id, nombre, descripcion, precio, imagen } = producto;
  const base = { id, nombre, descripcion, precio, imagen };

  const agregar = () => {
    if (grupos.length) setAbierto(true);
    else agregarProducto(base);
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

  return { agregar, dialogo };
}
