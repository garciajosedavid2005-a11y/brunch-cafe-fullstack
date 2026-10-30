/* eslint-disable react-refresh/only-export-components */
import { useState } from 'react'
import { CarritoContext } from './carritoContextValue'
export { useCarrito } from './useCarrito'

export const CarritoProvider = ({ children }) => {
    const [productos, setProductos] = useState([])

    // Agregar producto al carrito
    const agregarProducto = (producto) => {
        const existe = productos.find(p => p.id === producto.id)
        if (existe) {
            setProductos(productos.map(p =>
                p.id === producto.id
                    ? { ...p, cantidad: p.cantidad + 1 }
                    : p
            ))
        } else {
            setProductos([...productos, { ...producto, cantidad: 1 }])
        }
    }

    // Aumentar cantidad
    const aumentarCantidad = (id) => {
        setProductos(productos.map(p =>
            p.id === id
                ? { ...p, cantidad: p.cantidad + 1 }
                : p
        ))
    }

    // Disminuir cantidad
    const disminuirCantidad = (id) => {
        setProductos(productos.map(p =>
            p.id === id && p.cantidad > 1
                ? { ...p, cantidad: p.cantidad - 1 }
                : p
        ))
    }

    // Eliminar producto
    const eliminarProducto = (id) => {
        setProductos(productos.filter(p => p.id !== id))
    }

    // Limpiar carrito
    const limpiarCarrito = () => {
        setProductos([])
    }

    // Calcular total
    const calcularTotal = () => {
        return productos.reduce((total, p) => {
            const precio = parseInt(p.precio.replace(/[^0-9]/g, ''))
            return total + precio * p.cantidad
        }, 0)
    }

    return (
        <CarritoContext.Provider value={{
            productos,
            agregarProducto,
            aumentarCantidad,
            disminuirCantidad,
            eliminarProducto,
            limpiarCarrito,
            calcularTotal
        }}>
            {children}
        </CarritoContext.Provider>
    )
}

export default CarritoContext
