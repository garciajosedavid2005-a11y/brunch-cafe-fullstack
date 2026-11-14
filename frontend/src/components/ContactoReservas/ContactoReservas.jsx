import "./ContactoReservas.css"
import { FaPhone } from 'react-icons/fa'

const ContactoReservas = () => {
    return (
        <section className="contacto-seccion">

            {/*  Título de contacto */}
            <div className="contacto-separador">
                <span className="contacto-separador__linea"></span>
                <span className="contacto-separador__texto">Disfruta de una experiencia única</span>
                <span className="contacto-separador__linea"></span>
            </div>

            {/* Apartado de teléfono */}
            <div className="grid-container">
                <div className="grid-x grid-padding-x align-center">
                    <div className="cell small-12 medium-8 large-6">
                        <div className="contacto-card">
                            <h3 className="contacto-card__titulo">
                                ¿Deseas hacer tu reserva por teléfono?
                            </h3>
                            <div className="contacto-card__telefono">
                                <FaPhone className="contacto-card__icono" />
                                <span className="contacto-card__numero">#0000000000</span>
                            </div>
                            <p className="contacto-card__mensaje">
                                Llámanos y te podremos ayudar
                            </p>
                        </div>
                    </div>
                </div>
            </div>

        </section>
    )
}

export default ContactoReservas