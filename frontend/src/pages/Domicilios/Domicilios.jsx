import "./Domicilios.css"
import CarritoProducto from "../../components/CarritoProducto/CarritoProducto"
import CarritoFormulario from "../../components/CarritoFormulario/CarritoFormulario"
import useAnimacionEntrada from "../../hooks/useAnimacionEntrada"

const Domicilios = () => {
    const productosRef = useAnimacionEntrada()
    const formularioRef = useAnimacionEntrada()
    return (
        <main className="carrito-pagina">
            <div className="grid-container">
                <section ref={productosRef} className="animar carrito-productos">
                  <CarritoProducto />
                </section>
                <section ref={formularioRef} className="animar carrito-formulario">
                  <CarritoFormulario />
                </section>
            </div>
        </main>
    )
}

export default Domicilios