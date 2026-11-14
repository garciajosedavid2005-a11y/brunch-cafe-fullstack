import "./HistoriaNosotros.css"
import historia1 from "../../assets/historia1.jpg"
import historia2 from "../../assets/historia2.webp"
import historia3 from "../../assets/historia3.webp"

const HistoriaNosotros = () => {
    return (
        <section className="historia-seccion">
            <div className="grid-container">
                <div className="grid-x grid-padding-x align-middle">

                    {/* Card de texto - izquierda */}
                    <div className="cell small-12 medium-6">
                        <div className="historia-card">
                            <h3 className="historia-titulo">Nuestra historia</h3>
                            <p className="historia-texto">
                                Brunch nació con la idea de crear un espacio acogedor 
                                donde las personas pudieran disfrutar de café, buena 
                                comida y momentos especiales. Inspirado en la combinación 
                                de desayuno y almuerzo, ofrece un ambiente perfecto para 
                                compartir, relajarse o empezar el día con sabor y tranquilidad.
                            </p>
                        </div>
                    </div>

                    {/* Imágenes apiladas - derecha */}
                    <div className="cell small-12 medium-6">
                        <div className="historia-imagenes">
                            <img src={historia3} alt="Brunch 3" className="historia-img historia-img--detras" />
                            <img src={historia2} alt="Brunch 2" className="historia-img historia-img--medio" />
                            <img src={historia1} alt="Brunch 1" className="historia-img historia-img--frente" />
                        </div>
                    </div>

                </div>
            </div>
        </section>
    )
}

export default HistoriaNosotros