import "./CarritoFormulario.css"
import { esDireccionValida, MENSAJE_DIRECCION } from '../../utils/direccion'
import { useDialogo } from '../../context/useDialogo'
import { FaUser, FaMapMarkerAlt, FaClock, FaHome, FaStickyNote, FaCreditCard, FaMoneyBillWave, FaPhone, FaBookmark, FaChevronDown } from 'react-icons/fa'
import { useCarrito } from '../../context/CarritoContext'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/useAuth'
import { apiRequest } from '../../services/api'
import ResumenPedido from '../ResumenPedido/ResumenPedido'
import { formatearCOP } from '../../utils/moneda'
import { conPunto, itemsDelPedido, problemasPorLinea } from '../../utils/pedido'
import { useHorarios } from '../../hooks/useHorarios'
import { horasDomicilio, opcionesDeHora, textoAnticipacion, textoRango } from '../../utils/horarios'
import { esTelefono, MENSAJE_TELEFONO } from '../../utils/telefono'

const formularioInicial = (user) => ({
    nombre: `${user?.nombre || ''} ${user?.apellido || ''}`.trim(),
    // Obligatorio para el domicilio: se prellena con el del perfil y se puede cambiar
    telefono: user?.telefono || '',
    direccion: '',
    hora: '',
    barrio: '',
    indicaciones: ''
})

const CarritoFormulario = () => {

    const { calcularTotal, limpiarCarrito, productos, marcarProblemas } = useCarrito()
    const { avisar } = useDialogo()
    const { user } = useAuth()
    const navigate = useNavigate()

    const [formData, setFormData] = useState(() => formularioInicial(user))
    // Domicilio solo para hoy, en el horario configurado y con anticipación (N8)
    const { horarios, error: errorHorarios, cargando: cargandoHorarios, ahora } = useHorarios()
    const horasEntrega = horasDomicilio(horarios, ahora)
    const reglaDomicilio = horarios
        ? `Domicilio para hoy de ${textoRango(horarios.domicilio)}, con al menos ${textoAnticipacion(horarios.domicilio.anticipacionMinutos)} de anticipación.`
        : ''

    const [mostrarModal, setMostrarModal] = useState(false)
    const [errores, setErrores] = useState({})
    const [errorPedido, setErrorPedido] = useState('')
    const [guardando, setGuardando] = useState(false)
    const [metodosPagoEstado, setMetodosPagoEstado] = useState({
        usuarioId: null,
        metodos: [],
        error: ''
    })
    const [metodoPagoId, setMetodoPagoId] = useState('')
    // Idempotency-Key (0.9): una por compra. Los reintentos de "Confirmar" (p. ej. tras un corte
    // de red) reutilizan la misma y el backend no crea un pedido duplicado.
    const claveCompra = useRef('')

    const metodosPago = metodosPagoEstado.usuarioId === user?.id
        ? metodosPagoEstado.metodos
        : []
    const cargandoMetodos = Boolean(user?.id) && metodosPagoEstado.usuarioId !== user.id
    const errorMetodos = metodosPagoEstado.usuarioId === user?.id
        ? metodosPagoEstado.error
        : ''

    useEffect(() => {
        if (!user?.id) return undefined

        let activo = true
        apiRequest('/v1/cliente/metodos-pago')
            .then((metodos) => {
                if (!activo) return
                setMetodosPagoEstado({ usuarioId: user.id, metodos, error: '' })
                setMetodoPagoId((seleccionActual) =>
                    metodos.some((metodo) => metodo.id === seleccionActual)
                        ? seleccionActual
                        : metodos[0]?.id || ''
                )
            })
            .catch((error) => {
                if (activo) setMetodosPagoEstado({
                    usuarioId: user.id,
                    metodos: [],
                    error: error.message
                })
            })

        return () => {
            activo = false
        }
    }, [user?.id])

    // 6.4 (F6-g) · Direcciones guardadas del cliente: la principal se propone al abrir; elegir otra rellena dirección,
    // barrio e indicaciones (se pueden cambiar; el pedido guarda su propia copia). Sin libreta, el formulario de siempre
    const [direccionesGuardadas, setDireccionesGuardadas] = useState([])
    const [direccionElegida, setDireccionElegida] = useState('')
    const aplicarDireccion = (d) => {
        setDireccionElegida(d ? d.id : '')
        // «Otra dirección» vacía los campos para escribirla
        setFormData((actual) => ({ ...actual, direccion: d?.direccion || '', barrio: d?.barrio || '', indicaciones: d?.indicaciones || '' }))
    }
    useEffect(() => {
        if (!user?.id || user.esPersonal) return undefined
        let activo = true
        apiRequest('/v1/cliente/direcciones')
            .then(({ direcciones = [] }) => {
                if (!activo || !direcciones.length) return
                setDireccionesGuardadas(direcciones)
                const principal = direcciones.find((d) => d.principal) || direcciones[0]
                // Solo si el cliente aún no escribió una dirección; si ya escribió, el selector queda en «Otra dirección»
                setFormData((actual) => {
                    if (actual.direccion) return actual
                    setDireccionElegida(principal.id)
                    return { ...actual, direccion: principal.direccion, barrio: principal.barrio, indicaciones: principal.indicaciones || '' }
                })
            })
            .catch(() => {}) // sin libreta (o sin red): se escribe a mano, como antes
        return () => { activo = false }
    }, [user?.id, user?.esPersonal])

    // 6.7 (F6-6, F6-d) · Descuento de cumpleaños: si está disponible, el cliente puede usarlo en este pedido (10 % de los
    // productos, hacia abajo; el backend vuelve a decidir si le corresponde)
    const [cumpleanos, setCumpleanos] = useState(null)
    const [usarCumple, setUsarCumple] = useState(false)
    useEffect(() => {
        if (!user?.id || user.esPersonal) return undefined
        let activo = true
        apiRequest('/v1/cliente/puntos')
            .then((r) => { if (activo) setCumpleanos(r.cumpleanos || null) })
            .catch(() => {}) // sin el dato, no se ofrece
        return () => { activo = false }
    }, [user?.id, user?.esPersonal])
    const cumpleDisponible = cumpleanos?.estado === 'disponible'
    const descuentoCumple = cumpleDisponible && usarCumple ? Math.floor((calcularTotal() * cumpleanos.porcentaje) / 100) : 0

    const handleChange = (e) => {
        // 6.4 · Si cambia a mano la dirección o el barrio, ya no es la guardada
        if (['direccion', 'barrio'].includes(e.target.name)) setDireccionElegida('')
        let valor = e.target.value
        valor = valor.replace(/\s+/g, ' ')
        setFormData({
            ...formData,
            [e.target.name]: valor
        })
    }

    const validar = () => {

        const nuevosErrores = {}

        const nombreRegex = /^[A-Za-zÁÉÍÓÚáéíóúÑñ\s]{3,50}$/
        if (!formData.nombre.trim()) {
            nuevosErrores.nombre = 'El nombre es requerido'
        } else if (!nombreRegex.test(formData.nombre.trim())) {
            nuevosErrores.nombre =
                'Ingrese un nombre válido (solo letras y mínimo 3 caracteres)'
        }

        // 1.11 · La misma validación flexible que el backend (utils/direccion.js)
        if (!formData.direccion.trim()) {
            nuevosErrores.direccion = 'La dirección es requerida'
        } else if (!esDireccionValida(formData.direccion)) {
            nuevosErrores.direccion = MENSAJE_DIRECCION
        }

        if (!formData.telefono.trim()) {
            nuevosErrores.telefono = 'El teléfono es requerido'
        } else if (!esTelefono(formData.telefono.trim())) {
            nuevosErrores.telefono = MENSAJE_TELEFONO
        }

        if (!formData.hora) {
            nuevosErrores.hora = horasEntrega.length ? 'Elige la hora de entrega' : 'Hoy ya no hay horarios de domicilio disponibles'
        } else if (!horasEntrega.includes(formData.hora)) {
            // La hora elegida pudo quedar sin la anticipación mínima mientras la página estaba abierta
            nuevosErrores.hora = `Esa hora ya no está disponible. ${reglaDomicilio}`
        }

        const barrioRegex =/^[A-Za-zÁÉÍÓÚáéíóúÑñ0-9\s-]{3,40}$/
        if (!formData.barrio.trim()) {
            nuevosErrores.barrio = 'El barrio es requerido'
        } else if (!barrioRegex.test(formData.barrio.trim())) {
            nuevosErrores.barrio =
                'Ingrese un barrio válido'
        }

        if (formData.indicaciones.length > 120) {
            nuevosErrores.indicaciones =
                'Máximo 120 caracteres'
        }

        return nuevosErrores
    
    }

    const handleFinalizar = () => {
        if (!user) {
            navigate('/login', { state: { from: '/domicilios' } })
            return
        }

        if (productos.length === 0) {
            avisar({ titulo: 'Tu carrito está vacío', mensaje: 'Agrega productos desde el menú para hacer tu pedido.' })
            return
        }

        if (cargandoMetodos) {
            setErrorPedido('Espera un momento mientras cargamos los métodos de pago.')
            return
        }

        if (!metodosPago.some((metodo) => metodo.id === metodoPagoId)) {
            setErrorPedido(errorMetodos || 'Selecciona un método de pago disponible para continuar.')
            return
        }

        const nuevosErrores = validar()
        if (Object.keys(nuevosErrores).length > 0) {
            setErrores(nuevosErrores)
            return
        }

        setErrores({})
        setErrorPedido('')
        claveCompra.current = crypto.randomUUID() // datos (quizá) nuevos → compra nueva
        setMostrarModal(true)
    }

    const handleConfirmar = async () => {
        setGuardando(true)
        setErrorPedido('')
        marcarProblemas({})
        try {
            const metodoPago = metodosPago.find((metodo) => metodo.id === metodoPagoId)
            const { order } = await apiRequest('/v1/cliente/pedidos', {
                method: 'POST',
                headers: { 'Idempotency-Key': claveCompra.current },
                body: JSON.stringify({
                    ...formData,
                    metodoPagoId,
                    items: itemsDelPedido(productos),
                    ...(descuentoCumple > 0 ? { usarCumpleanos: true } : {}),
                })
            })
            if (descuentoCumple > 0) {
                setCumpleanos((c) => ({ ...c, estado: 'usado' }))
                setUsarCumple(false)
            }
            setMostrarModal(false)
            limpiarCarrito()
            setFormData(formularioInicial(user))
            // El pedido queda pendiente hasta que el café lo confirme
            avisar({
                titulo: `¡Recibimos tu pedido ${order.orderNumber}!`,
                mensaje: `Te avisaremos cuando el café lo confirme. Método de pago: ${metodoPago.nombre}.`,
            })
        } catch (error) {
            if (error.status === 401 || error.status === 403) {
                navigate('/login', { state: { from: '/domicilios' } })
                return
            }
            // 1.14 · Si el rechazo es de una línea (opción o producto agotado, nota larga…), se marca en el carrito
            const problemas = problemasPorLinea(error, productos)
            marcarProblemas(problemas)
            const marcadas = Object.keys(problemas).length
            const pista = marcadas > 1 ? 'Revisa las líneas marcadas en el carrito.' : 'Revisa la línea marcada en el carrito.'
            setErrorPedido(marcadas ? `${conPunto(error.message)} ${pista}` : error.message)
        } finally {
            setGuardando(false)
        }
    }

    return (

        <>
            <div className="carrito-formulario">
                {/* TITULO */}
                <h3 className="carrito-formulario__titulo">
                    Información de domicilio
                </h3>
                {!user && (
                    <p role="status">
                        Para guardar tu compra en “Mis pedidos”, <Link className="carrito-formulario__enlace" to="/login" state={{ from: '/domicilios' }}>inicia sesión</Link>.
                    </p>
                )}
                {errorPedido && <p className="carrito-error" role="alert">{errorPedido}</p>}
                <div className="carrito-formulario__separador"></div>
                <div className="carrito-formulario__contenedor">

                    {/* FORMULARIO */}
                    <div className="carrito-formulario__card">
                        <div className="grid-x grid-padding-x">
                            {/* NOMBRE */}
                            <div className="cell small-12">
                                <label className="carrito-formulario__label">
                                    Tu nombre
                                </label>
                                <div className="carrito-formulario__campo">
                                    <FaUser className="carrito-formulario__icono" />
                                    <input
                                        type="text"
                                        placeholder="Tu nombre y apellido"
                                        className="carrito-formulario__input"
                                        name="nombre"
                                        value={formData.nombre}
                                        onChange={handleChange}
                                        maxLength={50}
                                    />
                                </div>
                                {errores.nombre && (
                                    <p className="carrito-error">
                                        {errores.nombre}
                                    </p>
                                )}
                            </div>

                            {/* 6.4 · DIRECCIÓN GUARDADA */}
                            {direccionesGuardadas.length > 0 && (
                                <div className="cell small-12">
                                    <label className="carrito-formulario__label" htmlFor="carrito-direccion-guardada">
                                        Dirección guardada
                                    </label>
                                    <div className="carrito-formulario__campo carrito-formulario__campo--select">
                                        <FaBookmark className="carrito-formulario__icono" />
                                        <select
                                            id="carrito-direccion-guardada"
                                            className="carrito-formulario__input carrito-formulario__select"
                                            value={direccionElegida}
                                            onChange={(e) => aplicarDireccion(direccionesGuardadas.find((d) => d.id === e.target.value))}
                                        >
                                            {direccionesGuardadas.map((d) => (
                                                <option key={d.id} value={d.id}>
                                                    {`${d.etiqueta ? `${d.etiqueta} · ` : ''}${d.direccion}${d.principal ? ' (principal)' : ''}`}
                                                </option>
                                            ))}
                                            <option value="">Otra dirección (escríbela abajo)</option>
                                        </select>
                                        <FaChevronDown className="carrito-formulario__flecha" aria-hidden="true" />
                                    </div>
                                </div>
                            )}

                            {/* DIRECCION */}
                            <div className="cell small-12 medium-6">
                                <label className="carrito-formulario__label">
                                    Tu dirección
                                </label>
                                <div className="carrito-formulario__campo">
                                    <FaMapMarkerAlt className="carrito-formulario__icono" />
                                    <input
                                        type="text"
                                        placeholder="Ej: Calle 8 # 12-34"
                                        className="carrito-formulario__input"
                                        name="direccion"
                                        value={formData.direccion}
                                        onChange={handleChange}
                                        maxLength={60}
                                    />
                                </div>
                                {errores.direccion && (
                                    <p className="carrito-error">
                                        {errores.direccion}
                                    </p>
                                )}
                            </div>

                            {/* TELÉFONO */}
                            <div className="cell small-12 medium-6">
                                <label className="carrito-formulario__label" htmlFor="carrito-telefono">
                                    Teléfono de contacto
                                </label>
                                <div className="carrito-formulario__campo">
                                    <FaPhone className="carrito-formulario__icono" />
                                    <input
                                        id="carrito-telefono"
                                        type="tel"
                                        placeholder="Ej: 300 123 4567"
                                        className="carrito-formulario__input"
                                        name="telefono"
                                        value={formData.telefono}
                                        onChange={handleChange}
                                        autoComplete="tel"
                                        maxLength={30}
                                    />
                                </div>
                                {errores.telefono && (
                                    <p className="carrito-error">
                                        {errores.telefono}
                                    </p>
                                )}
                            </div>

                            {/* HORA: solo horas en punto de hoy dentro del horario de domicilio */}
                            <div className="cell small-12 medium-6">
                                <label className="carrito-formulario__label" htmlFor="carrito-hora">
                                    Hora de entrega
                                </label>
                                <div className="carrito-formulario__campo carrito-formulario__campo--select">
                                    <FaClock className="carrito-formulario__icono" />
                                    <select
                                        id="carrito-hora"
                                        className="carrito-formulario__input carrito-formulario__select"
                                        name="hora"
                                        value={horasEntrega.includes(formData.hora) ? formData.hora : ''}
                                        onChange={handleChange}
                                        disabled={!horasEntrega.length}
                                        aria-describedby="carrito-hora-ayuda"
                                    >
                                        <option value="">
                                            {cargandoHorarios ? 'Cargando horarios...' : horasEntrega.length ? 'Selecciona una hora' : 'Sin horarios hoy'}
                                        </option>
                                        {opcionesDeHora(horasEntrega).map((opcion) => (
                                            <option key={opcion.valor} value={opcion.valor}>{opcion.etiqueta}</option>
                                        ))}
                                    </select>
                                    <FaChevronDown className="carrito-formulario__flecha" aria-hidden="true" />
                                </div>
                                <p id="carrito-hora-ayuda" className="carrito-formulario__ayuda" role={horarios && !horasEntrega.length ? 'status' : undefined}>
                                    {errorHorarios
                                        || (horarios && !horasEntrega.length ? `Hoy ya no hay horarios de domicilio disponibles. ${reglaDomicilio}` : reglaDomicilio)}
                                </p>
                                {errores.hora && (
                                    <p className="carrito-error">
                                        {errores.hora}
                                    </p>
                                )}
                            </div>

                            {/* BARRIO */}
                            <div className="cell small-12 medium-6">
                                <label className="carrito-formulario__label">
                                    Barrio o conjunto
                                </label>
                                <div className="carrito-formulario__campo">
                                    <FaHome className="carrito-formulario__icono" />
                                    <input
                                        type="text"
                                        placeholder="Barrio o conjunto..."
                                        className="carrito-formulario__input"
                                        name="barrio"
                                        value={formData.barrio}
                                        onChange={handleChange}
                                        maxLength={40}
                                    />
                                </div>
                                {errores.barrio && (
                                    <p className="carrito-error">
                                        {errores.barrio}
                                    </p>
                                )}
                            </div>

                            {/* INDICACIONES */}
                            <div className="cell small-12">
                                <label className="carrito-formulario__label">
                                    Indicaciones especiales
                                </label>
                                <div className="carrito-formulario__campo">
                                    <FaStickyNote className="carrito-formulario__icono" />
                                    <input
                                        type="text"
                                        placeholder="Casa azul, portón negro..."
                                        className="carrito-formulario__input"
                                        name="indicaciones"
                                        value={formData.indicaciones}
                                        onChange={handleChange}
                                        maxLength={120}
                                    />
                                </div>
                                <p className="carrito-formulario__contador">
                                    {formData.indicaciones.length}/120
                                </p>
                                {errores.indicaciones && (
                                    <p className="carrito-error">
                                        {errores.indicaciones}
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>

                    <section className="carrito-pago" aria-labelledby="carrito-pago-titulo">
                        <h4 id="carrito-pago-titulo" className="carrito-pago__titulo">
                            ¿Cómo quieres pagar?
                        </h4>
                        <p className="carrito-pago__ayuda">
                            Elige una opción activa. Los pagos con tarjeta se realizan al recibir el domicilio; nunca pedimos los datos de tu tarjeta en esta página.
                        </p>
                        {cargandoMetodos && <p role="status">Cargando métodos de pago...</p>}
                        {errorMetodos && <p className="carrito-error" role="alert">{errorMetodos}</p>}
                        {!cargandoMetodos && !errorMetodos && metodosPago.length === 0 && user && (
                            <p className="carrito-error" role="alert">No hay métodos de pago disponibles. Contacta al café para realizar tu pedido.</p>
                        )}
                        <div className="carrito-pago__opciones" role="radiogroup" aria-labelledby="carrito-pago-titulo">
                            {metodosPago.map((metodo) => {
                                const seleccionado = metodoPagoId === metodo.id
                                const esEfectivo = /efectivo|contra\s*entrega/i.test(metodo.nombre)
                                return (
                                    <label
                                        key={metodo.id}
                                        className={`carrito-pago__opcion${seleccionado ? ' is-selected' : ''}`}
                                    >
                                        <input
                                            type="radio"
                                            name="metodoPago"
                                            value={metodo.id}
                                            checked={seleccionado}
                                            onChange={() => {
                                                setMetodoPagoId(metodo.id)
                                                setErrorPedido('')
                                            }}
                                            disabled={cargandoMetodos || guardando}
                                        />
                                        <span className="carrito-pago__icono" aria-hidden="true">
                                            {esEfectivo ? <FaMoneyBillWave /> : <FaCreditCard />}
                                        </span>
                                        <span className="carrito-pago__texto">
                                            <strong>{metodo.nombre}</strong>
                                            {metodo.descripcion && <small>{metodo.descripcion}</small>}
                                        </span>
                                    </label>
                                )
                            })}
                        </div>
                    </section>

                    {/* 6.7 · Cumpleaños */}
                    {cumpleDisponible && (
                        <label className="carrito-cumple">
                            <input type="checkbox" checked={usarCumple} onChange={(e) => setUsarCumple(e.target.checked)} />
                            <span>
                                Usar mi descuento de cumpleaños ({cumpleanos.porcentaje} %: −{formatearCOP(Math.floor((calcularTotal() * cumpleanos.porcentaje) / 100))})
                                <small>Una compra en el mes de tu cumpleaños, una vez al año.</small>
                            </span>
                        </label>
                    )}

                    {/* TOTAL */}
                    {descuentoCumple > 0 && (
                        <p className="carrito-formulario__descuento">Descuento de cumpleaños: −{formatearCOP(descuentoCumple)}</p>
                    )}
                    <div className="carrito-formulario__total">
                        <div className="carrito-formulario__total-linea"></div>
                        <p className="carrito-formulario__total-texto">
                            TOTAL ESTIMADO:{" "}
                            {formatearCOP(calcularTotal() - descuentoCumple)}
                        </p>
                        <div className="carrito-formulario__total-linea"></div>
                    </div>

                    {/* BOTONES */}
                    <div className="carrito-formulario__botones">
                        <button
                            className="carrito-formulario__btn-limpiar"
                            onClick={limpiarCarrito}
                        >
                            LIMPIAR
                        </button>
                        <button
                            className="carrito-formulario__btn-finalizar"
                            onClick={handleFinalizar}
                        >FINALIZAR COMPRA
                        </button>
                    </div>
                </div>
            </div>

            {/* MODAL */}
            {mostrarModal && (
                <ResumenPedido
                    formData={formData}
                    metodoPago={metodosPago.find((metodo) => metodo.id === metodoPagoId)}
                    onEditar={() => setMostrarModal(false)}
                    onConfirmar={handleConfirmar}
                    descuentoCumpleanos={descuentoCumple}
                    guardando={guardando}
                    error={errorPedido}
                />
            )}
        </>
    )
}

export default CarritoFormulario