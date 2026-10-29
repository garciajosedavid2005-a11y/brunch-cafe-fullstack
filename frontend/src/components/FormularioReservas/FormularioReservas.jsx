import "./FormularioReservas.css"
import ResumenReserva from '../ResumenReserva/ResumenReserva'
import { personas } from '../../data/personas'
import { horas } from '../../data/horas'
import useSelectPersonas from '../../hooks/useSelectPersonas'
import { useAuth } from '../../context/AuthContext'
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { FaUser, FaUsers, FaCalendarAlt, FaClock, FaCommentAlt, FaEnvelope } from 'react-icons/fa'
import emailjs from '@emailjs/browser'

const API_URL = 'http://localhost:4000/api'

// El backend guarda un número; las opciones del select usan ids de texto.
// "Organizaciones" no tiene número propio: se guarda como 8 (ajustar si el equipo decide otra cosa).
const CANTIDAD_POR_OPCION = {
    CANT1: 1, CANT2: 2, CANT3: 3, CANT4: 4, CANT5: 5, CANT6: 6, CANT7: 7, ORGA: 8
}

const FORM_VACIO = { personas: '', fecha: '', hora: '', observaciones: '' }

const FormularioReservas = () => {

    const { usuario, cargando } = useAuth()
    const navigate = useNavigate()

    const [persona, SelectPersonas, setPersona] = useSelectPersonas(
        'Seleccione la cantidad de personas:',
        personas,
        false
    )

    const [hora, SelectHoras, setHora] = useSelectPersonas(
        'Ingrese la hora:',
        horas,
        false
    )

    const hoy = new Date().toISOString().split('T')[0]

    const [formData, setFormData] = useState(FORM_VACIO)
    const [errores, setErrores] = useState({})
    const [mostrarModal, setMostrarModal] = useState(false)
    const [enviando, setEnviando] = useState(false)

    // Nombre y correo salen de la sesión, no se escriben
    const nombreCompleto = usuario ? `${usuario.nombre} ${usuario.apellido}` : ''
    const correo = usuario ? usuario.correo : ''

    useEffect(() => {
        setFormData(prev => ({ ...prev, personas: persona }))
    }, [persona])

    useEffect(() => {
        setFormData(prev => ({ ...prev, hora: hora }))
    }, [hora])

    const handleChange = (e) => {
        setFormData({
            ...formData,
            [e.target.name]: e.target.value
        })
    }

    const limpiarFormulario = () => {
        setFormData(FORM_VACIO)
        setPersona('')
        setHora('')
        setErrores({})
    }

    // VALIDACIONES

    const validar = () => {
        const nuevosErrores = {}

        if (!formData.personas) {
            nuevosErrores.personas = 'Selecciona la cantidad de personas'
        }

        if (!formData.fecha) {
            nuevosErrores.fecha = 'La fecha es requerida'
        }

        if (!formData.hora) {
            nuevosErrores.hora = 'Selecciona una hora'
        }

        if (formData.observaciones.length > 200) {
            nuevosErrores.observaciones =
                'Las observaciones no pueden superar 200 caracteres'
        }

        return nuevosErrores
    }

    const handleSubmit = (e) => {
        e.preventDefault()

        if (cargando) return

        // Sin sesión: se redirige al inicio de sesión
        if (!usuario) {
            navigate('/login', { state: { from: '/reservas' } })
            return
        }

        const nuevosErrores = validar()

        if (Object.keys(nuevosErrores).length > 0) {
            setErrores(nuevosErrores)
            return
        }

        setErrores({})
        setMostrarModal(true)
    }

    const handleConfirmar = async () => {
        if (enviando) return
        setEnviando(true)

        try {
            const res = await fetch(`${API_URL}/reservas`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    cantidadPersonas: CANTIDAD_POR_OPCION[formData.personas],
                    fecha: formData.fecha,
                    hora: formData.hora,
                    observaciones: formData.observaciones.trim() || undefined
                })
            })

            const data = await res.json()

            // Sesión vencida o token inválido
            if (res.status === 401 || res.status === 403) {
                setMostrarModal(false)
                navigate('/login', { state: { from: '/reservas' } })
                return
            }

            if (!res.ok) {
                alert(
                    Array.isArray(data)
                        ? data[0]
                        : data.message || 'No se pudo crear la reserva. Intenta de nuevo.'
                )
                return
            }

            // La reserva ya quedó guardada; el correo es un extra
            let correoEnviado = true
            try {
                await emailjs.send(
                    'service_mn2rux3',
                    'template_r4mj66a',
                    {
                        nombre: nombreCompleto,
                        correo: correo,
                        fecha: formData.fecha,
                        hora: formData.hora,
                        personas: formData.personas,
                        observaciones: formData.observaciones || 'Ninguna'
                    },
                    'zhwv2cSLgGN51vwua'
                )
            } catch {
                correoEnviado = false
            }

            setMostrarModal(false)

            alert(
                correoEnviado
                    ? '¡Reserva confirmada! Te enviamos un correo con los detalles.'
                    : '¡Reserva confirmada! No pudimos enviar el correo, pero tu reserva quedó registrada.'
            )

            limpiarFormulario()

        } catch {
            alert('No se pudo conectar con el servidor. Intenta de nuevo.')
        } finally {
            setEnviando(false)
        }
    }

    return (

        <>
            <section className="formulario-seccion">
                <div className="grid-container">
                    <div className="grid-x grid-padding-x">
                        <div className="cell small-12 medium-8 large-6">
                            <div className="formulario-card">
                                <h2 className="formulario-titulo">
                                    BIENVENIDOS A BRUNCH CAFE...
                                </h2>
                                <form onSubmit={handleSubmit}>
                                    {/* Nombre (cargado desde la sesión) */}
                                    <label htmlFor="nombre">
                                        Nombre:
                                    </label>
                                    <div className="formulario-campo-icono">
                                        <FaUser className="formulario-icono" />
                                        <input
                                            type="text"
                                            id="nombre"
                                            name="nombre"
                                            value={nombreCompleto}
                                            readOnly
                                            placeholder="Inicia sesión para cargar tus datos"
                                            className="formulario-input"
                                        />
                                    </div>
                                    {/* Correo (cargado desde la sesión) */}
                                    <label htmlFor="correo">
                                        Correo electrónico:
                                    </label>
                                    <div className="formulario-campo-icono">
                                        <FaEnvelope className="formulario-icono" />
                                        <input
                                            type="email"
                                            id="correo"
                                            name="correo"
                                            value={correo}
                                            readOnly
                                            placeholder="Inicia sesión para cargar tus datos"
                                            className="formulario-input"
                                        />
                                    </div>
                                    {/* Personas */}
                                    <label>
                                        Seleccione la cantidad de personas:
                                    </label>
                                    <div className="formulario-campo-icono">
                                        <FaUsers className="formulario-icono" />
                                        <SelectPersonas />
                                    </div>
                                    {errores.personas && (
                                        <p className="formulario-error">
                                            {errores.personas}
                                        </p>
                                    )}
                                    {/* Fecha */}
                                    <label htmlFor="fecha">
                                        Ingrese la fecha que desee:
                                    </label>
                                    <div className="formulario-campo-icono">
                                        <FaCalendarAlt className="formulario-icono" />
                                        <input
                                            type="date"
                                            id="fecha"
                                            name="fecha"
                                            value={formData.fecha}
                                            onChange={handleChange}
                                            min={hoy}
                                            onKeyDown={(e) => e.preventDefault()}
                                            className="formulario-input"
                                        />
                                    </div>
                                    {errores.fecha && (
                                        <p className="formulario-error">
                                            {errores.fecha}
                                        </p>
                                    )}
                                    {/* Hora */}
                                    <label>
                                        Ingrese la hora:
                                    </label>
                                    <div className="formulario-campo-icono">
                                        <FaClock className="formulario-icono" />
                                        <SelectHoras />
                                    </div>
                                    {errores.hora && (
                                        <p className="formulario-error">
                                            {errores.hora}
                                        </p>
                                    )}
                                    {/* Observaciones */}
                                    <label htmlFor="observaciones">
                                        Observaciones adicionales:
                                    </label>
                                    <div className="formulario-campo-icono formulario-campo-icono--textarea">
                                        <FaCommentAlt className="formulario-icono formulario-icono--top" />
                                        <textarea
                                            id="observaciones"
                                            name="observaciones"
                                            value={formData.observaciones}
                                            onChange={handleChange}
                                            rows="4"
                                            placeholder="Alguna solicitud especial, alergias, etc."
                                            className="formulario-input"
                                        />
                                    </div>
                                    {errores.observaciones && (
                                        <p className="formulario-error">
                                            {errores.observaciones}
                                        </p>
                                    )}
                                    {/* Botones */}
                                    <div className="formulario-botones">
                                        <button
                                            type="button"
                                            className="button secondary hollow"
                                            onClick={limpiarFormulario}
                                        >
                                            Limpiar Reserva
                                        </button>
                                        <button
                                            type="submit"
                                            className="button"
                                        >
                                            Enviar Reserva
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
            {mostrarModal && (
                <ResumenReserva
                    formData={{
                        nombre: nombreCompleto,
                        correo: correo,
                        personas: personas.find(p => p.id === formData.personas)?.nombre || '',
                        fecha: formData.fecha,
                        hora: horas.find(h => h.id === formData.hora)?.nombre || '',
                        observaciones: formData.observaciones
                    }}
                    onEditar={() => setMostrarModal(false)}
                    onConfirmar={handleConfirmar}
                />
            )}
        </>
    )
}

export default FormularioReservas