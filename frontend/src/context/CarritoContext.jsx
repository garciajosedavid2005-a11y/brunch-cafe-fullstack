/* eslint-disable react-refresh/only-export-components */
import { useState } from 'react'
import { CarritoContext } from './carritoContextValue'
export { useCarrito } from './useCarrito'
import { MAX_CANTIDAD_LINEA } from '../utils/pedido'

// 1.12 · Una línea por combinación de producto, opciones y nota: el mismo plato con opciones
// distintas va en líneas separadas; con las mismas, suma cantidad. `linea` identifica cada línea.
const claveLinea = (id, modificadores, nota) => [
    id,
    modificadores.map((g) => `${g.grupoId}:${g.opciones.map((o) => o.id).sort().join(',')}`).join(';'),
    nota,
].join('|')

const recargos = (modificadores) =>
    modificadores.reduce((suma, g) => suma + g.opciones.reduce((s, o) => s + (o.precioExtra || 0), 0), 0)

export const CarritoProvider = ({ children }) => {
    const [productos, setProductos] = useState([])
    // 1.14 · Líneas que el servidor rechazó al hacer el pedido: { [linea]: motivo }. Como en la
    // comanda del salón, una línea se desmarca al quitarla o al volver a confirmar el pedido
    const [problemas, setProblemas] = useState({})
    const desmarcar = (linea) => setProblemas((actuales) => {
        if (!(linea in actuales)) return actuales
        const resto = { ...actuales }
        delete resto[linea]
        return resto
    })

    // Agregar producto al carrito (opciones: [{ grupoId, grupo, opciones: [{ id, nombre, precioExtra }] }])
    const agregarProducto = (producto, { cantidad = 1, modificadores = [], nota = '' } = {}) => {
        const notaLimpia = nota.trim()
        const linea = claveLinea(producto.id, modificadores, notaLimpia)
        setProductos((actuales) => {
            if (actuales.some((p) => p.linea === linea)) {
                return actuales.map((p) => (p.linea === linea
                    ? { ...p, cantidad: Math.min(MAX_CANTIDAD_LINEA, p.cantidad + cantidad) }
                    : p))
            }
            // El precio con recargos es solo para mostrar: el backend lo vuelve a calcular
            return [...actuales, {
                ...producto, linea, cantidad: Math.min(MAX_CANTIDAD_LINEA, cantidad), modificadores, nota: notaLimpia,
                precioUnitario: producto.precio + recargos(modificadores),
            }]
        })
    }

    // Aumentar cantidad de una línea
    const aumentarCantidad = (linea) => {
        setProductos((actuales) => actuales.map((p) => (p.linea === linea
            ? { ...p, cantidad: Math.min(MAX_CANTIDAD_LINEA, p.cantidad + 1) }
            : p)))
    }

    // Disminuir cantidad de una línea
    const disminuirCantidad = (linea) => {
        setProductos((actuales) => actuales.map((p) => (p.linea === linea && p.cantidad > 1
            ? { ...p, cantidad: p.cantidad - 1 }
            : p)))
    }

    // Eliminar una línea
    const eliminarProducto = (linea) => {
        desmarcar(linea)
        setProductos((actuales) => actuales.filter((p) => p.linea !== linea))
    }

    // Limpiar carrito
    const limpiarCarrito = () => {
        setProductos([])
        setProblemas({})
    }

    // Calcular total (enteros en COP; con los recargos de las opciones)
    const calcularTotal = () => {
        return productos.reduce((total, p) => total + (p.precioUnitario ?? p.precio) * p.cantidad, 0)
    }

    return (
        <CarritoContext.Provider value={{
            productos,
            agregarProducto,
            aumentarCantidad,
            disminuirCantidad,
            eliminarProducto,
            limpiarCarrito,
            calcularTotal,
            problemas,
            marcarProblemas: setProblemas
        }}>
            {children}
        </CarritoContext.Provider>
    )
}

export default CarritoContext
