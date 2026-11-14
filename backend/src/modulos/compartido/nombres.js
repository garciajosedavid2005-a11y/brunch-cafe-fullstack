// Nombre corto del personal para listas e historial: «Ana P.». Una cuenta archivada (3.8) se muestra
// como «Ana P. (eliminado)»: el historial la conserva, pero se ve que ya no está.
export const nombreCorto = (u) => {
    if (!u) return ''
    const base = [u.nombre, u.apellido?.[0] ? `${u.apellido[0]}.` : ''].filter(Boolean).join(' ')
    return u.eliminado === true ? `${base} (eliminado)` : base
}

// Campos que necesita nombreCorto (para los .select de las consultas)
export const CAMPOS_NOMBRE = 'nombre apellido eliminado'
