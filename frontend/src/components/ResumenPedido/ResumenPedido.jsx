import "./ResumenPedido.css"
import { useEffect } from 'react'
import { useCarrito } from '../../context/CarritoContext'
import { FaShoppingCart, FaMapMarkerAlt, FaClock, FaUser, FaHome, FaStickyNote, FaPhone } from 'react-icons/fa'
import { formatearCOP } from '../../utils/moneda'
import { deLineaCarrito, textoModificadores } from '../../utils/modificadores'
import { formatearHoraTexto } from '../../utils/fechas'

const ResumenPedido = ({ formData, metodoPago, onEditar, onConfirmar, guardando = false, error = '' }) => {

    const { productos, calcularTotal } = useCarrito()

    useEffect(() => {
        document.body.style.overflow = 'hidden'
        return () => {
            document.body.style.overflow = 'unset'
        }
    }, [])

    return (
        <div className="resumen-pedido-overlay">
            <div className="resumen-pedido-modal">

                {/* Encabezado */}
                <div className="resumen-pedido__header">
                    <FaShoppingCart className="resumen-pedido__header-icono" />
                    <h2 className="resumen-pedido__header-titulo">Resumen de tu Pedido</h2>
                    <p className="resumen-pedido__header-subtitulo">Verifica los datos antes de confirmar</p>
                </div>

                {/* Productos */}
                <div className="resumen-pedido__seccion">
                    <h3 className="resumen-pedido__seccion-titulo">Productos</h3>
                    {productos.map(producto => {
                        const subtotal = (producto.precioUnitario ?? producto.precio) * producto.cantidad
                        const opciones = textoModificadores(deLineaCarrito(producto.modificadores))
                        return (
                            <div key={producto.linea ?? producto.id} className="resumen-pedido__producto">
                                <img
                                    src={producto.imagen}
                                    alt={producto.nombre}
                                    className="resumen-pedido__producto-imagen"
                                />
                                <div className="resumen-pedido__producto-info">
                                    <span className="resumen-pedido__producto-nombre">{producto.nombre}</span>
                                    {opciones && <span className="resumen-pedido__producto-cantidad">{opciones}</span>}
                                    {producto.nota && <span className="resumen-pedido__producto-cantidad">Nota: {producto.nota}</span>}
                                    <span className="resumen-pedido__producto-cantidad">Cantidad: {producto.cantidad}</span>
                                    <span className="resumen-pedido__producto-subtotal">
                                        {formatearCOP(subtotal)}
                                    </span>
                                </div>
                            </div>
                        )
                    })}
                </div>

                {/* Datos de domicilio */}
                <div className="resumen-pedido__seccion">
                    <h3 className="resumen-pedido__seccion-titulo">Datos de Domicilio</h3>

                    <div className="resumen-pedido__dato">
                        <FaUser className="resumen-pedido__dato-icono" />
                        <div>
                            <span className="resumen-pedido__dato-label">Nombre</span>
                            <span className="resumen-pedido__dato-valor">{formData.nombre}</span>
                        </div>
                    </div>

                    <div className="resumen-pedido__dato">
                        <FaPhone className="resumen-pedido__dato-icono" />
                        <div>
                            <span className="resumen-pedido__dato-label">Teléfono</span>
                            <span className="resumen-pedido__dato-valor">{formData.telefono}</span>
                        </div>
                    </div>

                    <div className="resumen-pedido__dato">
                        <FaMapMarkerAlt className="resumen-pedido__dato-icono" />
                        <div>
                            <span className="resumen-pedido__dato-label">Dirección</span>
                            <span className="resumen-pedido__dato-valor">{formData.direccion}</span>
                        </div>
                    </div>

                    <div className="resumen-pedido__dato">
                        <FaClock className="resumen-pedido__dato-icono" />
                        <div>
                            <span className="resumen-pedido__dato-label">Hora de entrega</span>
                            <span className="resumen-pedido__dato-valor">Hoy, {formatearHoraTexto(formData.hora)}</span>
                        </div>
                    </div>

                    <div className="resumen-pedido__dato">
                        <FaHome className="resumen-pedido__dato-icono" />
                        <div>
                            <span className="resumen-pedido__dato-label">Barrio o conjunto</span>
                            <span className="resumen-pedido__dato-valor">{formData.barrio}</span>
                        </div>
                    </div>

                    {formData.indicaciones && (
                        <div className="resumen-pedido__dato">
                            <FaStickyNote className="resumen-pedido__dato-icono" />
                            <div>
                                <span className="resumen-pedido__dato-label">Indicaciones</span>
                                <span className="resumen-pedido__dato-valor">{formData.indicaciones}</span>
                            </div>
                        </div>
                    )}
                </div>

                {metodoPago && (
                    <div className="resumen-pedido__seccion">
                        <h3 className="resumen-pedido__seccion-titulo">Método de pago</h3>
                        <p className="resumen-pedido__dato-valor">{metodoPago.nombre}</p>
                        {metodoPago.descripcion && (
                            <p className="resumen-pedido__header-subtitulo">{metodoPago.descripcion}</p>
                        )}
                    </div>
                )}

                {/* Total */}
                <div className="resumen-pedido__total">
                    <span className="resumen-pedido__total-label">TOTAL ESTIMADO</span>
                    <span className="resumen-pedido__total-valor">
                        {formatearCOP(calcularTotal())}
                    </span>
                </div>

                {error && <p className="carrito-error" role="alert">{error}</p>}

                {/* Botones */}
                <div className="resumen-pedido__botones">
                    <button className="resumen-pedido__btn-editar" onClick={onEditar} disabled={guardando}>
                        Editar Pedido
                    </button>
                    <button className="resumen-pedido__btn-confirmar" onClick={onConfirmar} disabled={guardando}>
                        {guardando ? 'Guardando pedido...' : 'Confirmar Pedido'}
                    </button>
                </div>

            </div>
        </div>
    )
}

export default ResumenPedido