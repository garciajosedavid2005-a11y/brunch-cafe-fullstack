import Hero from "../../components/Hero/Hero"
import HistoriaNosotros from "../../components/HistoriaNosotros/HistoriaNosotros"
import UbicacionNosotros from "../../components/UbicacionNosotros/UbicacionNosotros"
import ContactoReservas from "../../components/ContactoReservas/ContactoReservas"
import useAnimacionEntrada from "../../hooks/useAnimacionEntrada"
import "./Nosotros.css"

const Nosotros = () => {
    const heroRef = useAnimacionEntrada()
    const historiaRef = useAnimacionEntrada()
    const ubicacionRef = useAnimacionEntrada()
    const contactoRef = useAnimacionEntrada()

    return (
        <main className="pagina-Nosotros">
            <section ref={heroRef} className="animar nosotros-hero">
              <Hero 
                  estatico={true}
                  titulo="¡Sobre nosotros!"
                  colorFondo="var(--color-primario)"
                  centrado={true}
              />
            </section>
            <section ref={historiaRef} className="animar nosotros-historia">
              <HistoriaNosotros />
            </section>
            <section ref={ubicacionRef} className="animar nosotros-ubicacion">
              <UbicacionNosotros />
            </section>
            <section ref={contactoRef} className="animar nosotros-contacto">
              <ContactoReservas />
            </section>
        </main>
    )
}

export default Nosotros