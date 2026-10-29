import { useState } from 'react'

const useSelectPersonas = (label, opciones, mostrarLabel = true) => {

    const [state, setState] = useState('')

    const SelectPersonas = () => (
        <>
            {mostrarLabel && <label>{label}</label>}
            <select
                value={state}
                onChange={e => setState(e.target.value)}
                style={{ border: 'none', outline: 'none', width: '100%', background: 'transparent', padding: '0' }}
            >
                <option value="">Seleccione...</option>
                {opciones.map(opcion => (
                    <option
                        key={opcion.id}
                        value={opcion.id}>
                        {opcion.nombre}
                    </option>
                ))}
            </select>
        </>
    )

    return [state, SelectPersonas, setState]
}

export default useSelectPersonas