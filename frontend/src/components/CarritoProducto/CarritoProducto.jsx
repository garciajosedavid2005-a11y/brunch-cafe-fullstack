import "./CarritoProducto.css"
import { useCarrito } from '../../context/CarritoContext'
import { useNavigate } from 'react-router-dom'
import { formatearCOP } from '../../utils/moneda'
import { deLineaCarrito, textoModificadores } from '../../utils/modificadores'

const CarritoProducto = () => {

    const { productos, aumentarCantidad, disminuirCantidad, eliminarProducto } = useCarrito()
    const navigate = useNavigate()

    if (productos.length === 0) {
        return (
            <div className="carrito-producto">
                <h1 className="carrito-producto__titulo">Carrito Brunch Café</h1>
                <div className="carrito-producto__separador"></div>
                <p className="carrito-producto__vacio">
                    🛒 Tu carrito está vacío — agrega productos desde el menú
                </p>
                <div className="carrito-producto__agregar">
                    <button 
                        className="carrito-producto__agregar-btn"
                        onClick={() => navigate('/menu')}
                    >
                        <span>+</span> Agregar Producto al Carrito
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div className="carrito-producto">

            {/* Título */}
            <h1 className="carrito-producto__titulo">Carrito Brunch Café</h1>
            <div className="carrito-producto__separador"></div>

            {/* Lista de productos */}
            {productos.map(producto => {
                // 1.12 · Precio con los recargos de las opciones; cada combinación es su propia línea
                const unitario = producto.precioUnitario ?? producto.precio
                const subtotal = unitario * producto.cantidad
                const opciones = textoModificadores(deLineaCarrito(producto.modificadores))

                return (
                    <div key={producto.linea ?? producto.id} className="carrito-producto__item">
                        <div className="grid-x grid-padding-x align-middle">

                            {/* Imagen */}
                            <div className="cell small-12 medium-4">
                                <img
                                    src={producto.imagen}
                                    alt={producto.nombre}
                                    className="carrito-producto__imagen"
                                />
                            </div>

                            {/* Info */}
                            <div className="cell small-12 medium-8">
                                <h3 className="carrito-producto__nombre">{producto.nombre}</h3>
                                <div className="carrito-producto__linea"></div>
                                <p className="carrito-producto__descripcion">{producto.descripcion}</p>
                                {opciones && <p className="carrito-producto__opciones">{opciones}</p>}
                                {producto.nota && <p className="carrito-producto__opciones">Nota: {producto.nota}</p>}
                                <p className="carrito-producto__precio-unitario">{formatearCOP(unitario)}</p>

                                {/* Contador */}
                                <div className="carrito-producto__contador">
                                    <button
                                        className="carrito-producto__btn"
                                        aria-label={`Quitar uno de ${producto.nombre}`}
                                        onClick={() => disminuirCantidad(producto.linea)}
                                    >−</button>
                                    <span className="carrito-producto__cantidad">{producto.cantidad}</span>
                                    <button
                                        className="carrito-producto__btn"
                                        aria-label={`Sumar uno de ${producto.nombre}`}
                                        onClick={() => aumentarCantidad(producto.linea)}
                                    >+</button>
                                </div>

                                <p className="carrito-producto__total">
                                    Total: {formatearCOP(subtotal)}
                                </p>

                                {/* Eliminar */}
                                <button
                                    className="carrito-producto__eliminar"
                                    onClick={() => eliminarProducto(producto.linea)}
                                >
                                    Eliminar
                                </button>
                            </div>

                        </div>
                        <hr className="carrito-producto__divisor" />
                    </div>
                )
            })}

            {/* Botón agregar otro producto */}
            <div className="carrito-producto__agregar">
                <button 
                    className="carrito-producto__agregar-btn"
                    onClick={() => navigate('/menu')}
                >
                    <span>+</span> Agregar Otro Producto al Carrito
                </button>
            </div>

        </div>
    )
}

export default CarritoProducto