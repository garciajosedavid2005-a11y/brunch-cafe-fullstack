import "./ResumenReserva.css"
import {
    FaUser,
    FaUsers,
    FaCalendarAlt,
    FaClock,
    FaCommentAlt,
    FaCheckCircle,
    FaEnvelope,
    FaFlag
} from 'react-icons/fa'
import { useEffect } from 'react'

const ResumenReserva = ({ formData, onEditar, onConfirmar, guardando = false }) => {
    useEffect(() => {
        const previousOverflow = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        return () => {
            document.body.style.overflow = previousOverflow
        }
    }, [])

    const fechaReserva = formData.fecha
        ? new Intl.DateTimeFormat('es-CO', {
            dateStyle: 'long',
            timeZone: 'UTC',
        }).format(new Date(`${formData.fecha}T12:00:00Z`))
        : 'No seleccionada'

    const horaReserva = formData.hora
        ? new Intl.DateTimeFormat('es-CO', {
            hour: 'numeric',
            minute: '2-digit',
            timeZone: 'UTC',
        }).format(new Date(`1970-01-01T${formData.hora}:00Z`))
        : 'No seleccionada'

    return (
        <div className="resumen-overlay" onMouseDown={(event) => {
            if (event.target === event.currentTarget && !guardando) onEditar()
        }}>
            <section
                className="resumen-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="resumen-titulo"
                aria-describedby="resumen-descripcion"
            >
                <header className="resumen-header">
                    <span className="resumen-header__icono-wrap">
                        <FaCheckCircle className="resumen-header__icono" aria-hidden="true" />
                    </span>
                    <span className="resumen-header__eyebrow">UN MOMENTO ESPECIAL</span>
                    <h2 id="resumen-titulo" className="resumen-header__titulo">Confirma tu reserva</h2>
                    <p id="resumen-descripcion" className="resumen-header__subtitulo">
                        Revisa los detalles antes de enviar tu solicitud.
                    </p>
                </header>

                <div className="resumen-datos">
                    <div className="resumen-item">
                        <FaUser className="resumen-item__icono" aria-hidden="true" />
                        <div className="resumen-item__contenido">
                            <span className="resumen-item__label">Nombre</span>
                            <span className="resumen-item__valor">{formData.nombre}</span>
                        </div>
                    </div>
                    <div className="resumen-item">
                        <FaEnvelope className="resumen-item__icono" aria-hidden="true" />
                        <div className="resumen-item__contenido">
                            <span className="resumen-item__label">Correo</span>
                            <span className="resumen-item__valor">{formData.correo}</span>
                        </div>
                    </div>
                    <div className="resumen-item">
                        <FaUsers className="resumen-item__icono" aria-hidden="true" />
                        <div className="resumen-item__contenido">
                            <span className="resumen-item__label">Personas</span>
                            <span className="resumen-item__valor">{formData.personas}</span>
                        </div>
                    </div>
                    <div className="resumen-item">
                        <FaFlag className="resumen-item__icono" aria-hidden="true" />
                        <div className="resumen-item__contenido">
                            <span className="resumen-item__label">Motivo</span>
                            <span className="resumen-item__valor">{formData.motivo}</span>
                        </div>
                    </div>
                    <div className="resumen-item">
                        <FaCalendarAlt className="resumen-item__icono" aria-hidden="true" />
                        <div className="resumen-item__contenido">
                            <span className="resumen-item__label">Fecha</span>
                            <span className="resumen-item__valor">{fechaReserva}</span>
                        </div>
                    </div>
                    <div className="resumen-item">
                        <FaClock className="resumen-item__icono" aria-hidden="true" />
                        <div className="resumen-item__contenido">
                            <span className="resumen-item__label">Hora</span>
                            <span className="resumen-item__valor">{horaReserva}</span>
                        </div>
                    </div>
                    {formData.observaciones && (
                        <div className="resumen-item resumen-item--wide">
                            <FaCommentAlt className="resumen-item__icono" aria-hidden="true" />
                            <div className="resumen-item__contenido">
                                <span className="resumen-item__label">Observaciones</span>
                                <span className="resumen-item__valor">{formData.observaciones}</span>
                            </div>
                        </div>
                    )}
                </div>

                <footer className="resumen-botones">
                    <button className="resumen-botones__editar" type="button" onClick={onEditar} disabled={guardando}>
                        Volver a editar
                    </button>
                    <button className="resumen-botones__confirmar" type="button" onClick={onConfirmar} disabled={guardando}>
                        {guardando ? "Enviando..." : "Enviar solicitud"}
                    </button>
                </footer>
            </section>
        </div>
    )
}

export default ResumenReserva