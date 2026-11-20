// Catálogo de permisos: el código es la fuente de verdad; la colección Permiso
// lo refleja para el dashboard. "reservado" = definido para una fase futura:
// figura en el catálogo pero todavía no se puede asignar a ningún rol.
export const COMODIN = '*'

export const PERMISOS = [
    // Fase 0
    { clave: 'catalogo:gestionar', modulo: 'catalogo', descripcion: 'Crear, editar y eliminar productos y categorías' },
    { clave: 'pedido:ver', modulo: 'pedidos', descripcion: 'Ver todos los pedidos' },
    { clave: 'pedido:cambiar_estado', modulo: 'pedidos', descripcion: 'Avanzar el estado de un pedido' },
    { clave: 'pedido:cancelar', modulo: 'pedidos', descripcion: 'Cancelar un pedido con motivo' },
    // 6.2 (F6-2) · Repartidor asignado: quien asigna (admin y cajero) y quien entrega (el repartidor, solo los suyos)
    { clave: 'pedido:asignar_repartidor', modulo: 'pedidos', descripcion: 'Asignar el repartidor de un domicilio' },
    { clave: 'pedido:entregar', modulo: 'pedidos', descripcion: 'Llevar sus domicilios asignados (en camino → entregado)' },
    { clave: 'reserva:ver', modulo: 'reservas', descripcion: 'Ver todas las reservas' },
    { clave: 'reserva:crear', modulo: 'reservas', descripcion: 'Registrar reservas para los clientes' },
    { clave: 'reserva:cambiar_estado', modulo: 'reservas', descripcion: 'Confirmar, sentar, completar o cancelar reservas' },
    { clave: 'resena:moderar', modulo: 'resenas', descripcion: 'Ocultar o eliminar reseñas' },
    { clave: 'estado:editar', modulo: 'configuracion', descripcion: 'Editar etiqueta, color y descripción de los estados' },
    { clave: 'metodo_pago:gestionar', modulo: 'configuracion', descripcion: 'Gestionar los métodos de pago' },
    { clave: 'horario:editar', modulo: 'configuracion', descripcion: 'Editar los horarios de domicilio y de reservas' },
    { clave: 'rol:gestionar', modulo: 'identidad', descripcion: 'Gestionar roles y sus permisos' },
    { clave: 'usuario:gestionar', modulo: 'identidad', descripcion: 'Activar/desactivar usuarios y asignar roles' },
    // Fase 1 · salón y comandas (PLAN_FASE_1 §1.1). Los endpoints llegan en 1.2 y 1.5
    { clave: 'salon:configurar', modulo: 'salon', descripcion: 'Configurar zonas, mesas y estaciones' },
    { clave: 'mesa:ver', modulo: 'salon', descripcion: 'Ver el plano de mesas' },
    { clave: 'mesa:operar', modulo: 'salon', descripcion: 'Ocupar, liberar y mover mesas; marcarlas limpias' },
    { clave: 'mesa:bloquear', modulo: 'salon', descripcion: 'Bloquear y desbloquear mesas con motivo' },
    { clave: 'mesa:unir', modulo: 'salon', descripcion: 'Unir y separar mesas' },
    { clave: 'cuenta:abrir', modulo: 'salon', descripcion: 'Abrir la cuenta de una mesa' },
    { clave: 'cuenta:ver', modulo: 'salon', descripcion: 'Ver cuentas con sus rondas y totales' },
    { clave: 'cuenta:transferir', modulo: 'salon', descripcion: 'Transferir una cuenta a otro mesero' },
    { clave: 'cuenta:solicitar', modulo: 'salon', descripcion: 'Marcar que la mesa pidió la cuenta' },
    { clave: 'cuenta:cerrar_sin_cobro', modulo: 'salon', descripcion: 'Cerrar una cuenta sin cobro, con motivo' },
    { clave: 'comanda:tomar', modulo: 'salon', descripcion: 'Agregar y quitar ítems de la ronda en borrador' },
    { clave: 'comanda:enviar', modulo: 'salon', descripcion: 'Enviar la ronda a cocina y barra' },
    { clave: 'item:anular', modulo: 'salon', descripcion: 'Anular un ítem ya enviado, con motivo' },
    // 6.3 (F6-3) · Cuentas para llevar: abrirlas y, solo en ellas, tomar el pedido, enviarlo, pasarlo a caja y entregarlo
    { clave: 'cuenta:para_llevar', modulo: 'salon', descripcion: 'Abrir cuentas para llevar, tomar su pedido y entregarlo' },
    // 6.5 (F6-a) · Identificar al cliente de una cuenta (por correo o teléfono) para ver sus alergias y preferencias
    { clave: 'cliente:identificar', modulo: 'salon', descripcion: 'Identificar al cliente de una cuenta y ver sus alergias y preferencias' },
    // Fase 2 · cocina y barra (PLAN_FASE_2 §2, F2-2, F2-3, F2-5)
    { clave: 'kds:ver', modulo: 'cocina', descripcion: 'Ver la pantalla de cocina (KDS) de su estación' },
    { clave: 'item:preparar', modulo: 'cocina', descripcion: 'Marcar ítems en preparación y listos' },
    { clave: 'pedido:preparar', modulo: 'cocina', descripcion: 'Preparar pedidos a domicilio (confirmado → en preparación → listo)' },
    { clave: 'item:servir', modulo: 'salon', descripcion: 'Marcar como servidos los ítems listos' },
    { clave: 'producto:agotar', modulo: 'catalogo', descripcion: 'Marcar un producto u opción como agotado' },
    { clave: 'producto:reactivar', modulo: 'catalogo', descripcion: 'Volver a ofrecer un producto u opción agotado' },
    // Fase 3 · cobro en caja (F3-1): cajero y admin (por «*»)
    { clave: 'cuenta:cobrar', modulo: 'caja', descripcion: 'Cobrar cuentas en caja y emitir el comprobante interno' },
    // Fase 3b · caja completa (PLAN_FASE_3B): turno y arqueo (cajero), anulación (solo admin) y domicilios
    { clave: 'caja:abrir', modulo: 'caja', descripcion: 'Abrir el turno de caja con la base' },
    { clave: 'caja:cerrar', modulo: 'caja', descripcion: 'Cerrar el turno de caja con el arqueo' },
    { clave: 'factura:anular', modulo: 'caja', descripcion: 'Anular comprobantes con nota crédito' },
    { clave: 'pedido:cobrar', modulo: 'caja', descripcion: 'Registrar en la caja el cobro de un domicilio' },
    // Fase 5 · inventario y compras (PLAN_FASE_5, F5-8 y F5-a): el rol compras; el admin por «*»
    { clave: 'inventario:ver', modulo: 'inventario', descripcion: 'Ver insumos, existencias, recetas, movimientos y alertas' },
    { clave: 'inventario:gestionar', modulo: 'inventario', descripcion: 'Crear y editar insumos y recetas' },
    { clave: 'inventario:ajustar', modulo: 'inventario', descripcion: 'Registrar ajustes, mermas y vencimientos con motivo' },
    { clave: 'compra:gestionar', modulo: 'inventario', descripcion: 'Gestionar proveedores y órdenes de compra' },
    { clave: 'compra:recibir', modulo: 'inventario', descripcion: 'Recibir compras (suma existencias y recalcula el costo)' },
    // Fase 5 · reportes (F5-9): solo el admin («*») mientras Brayan no lo dé a otro rol
    { clave: 'reporte:ver', modulo: 'reportes', descripcion: 'Ver reportes de ventas y operación' },
]

export const CLAVES = PERMISOS.map((p) => p.clave)
export const CLAVES_ASIGNABLES = PERMISOS.filter((p) => !p.reservado).map((p) => p.clave)

/**
 * 1.5b · ¿Puede quien tiene `permisosSesion` dar el rol con `permisosRol`? Solo si ya tiene cada uno
 * de esos permisos (quien tiene `*` puede dar cualquiera). Evita que un gestor de usuarios sin `*`
 * cree o ascienda cuentas con más poder que el suyo (p. ej. un rol con `*`).
 */
export const puedeOtorgarRol = (permisosSesion = [], permisosRol = []) =>
    permisosSesion.includes(COMODIN) || permisosRol.every((clave) => clave !== COMODIN && permisosSesion.includes(clave))

// Roles con reglas fijas
export const ROL_ADMIN = 'admin'
export const ROL_CLIENTE = 'cliente'

// Permisos de salón de la Fase 1 (1.1). item:anular, cuenta:cerrar_sin_cobro y salon:configurar
// no son de ningún rol de staff: solo el admin ("*") por ahora (F1-6, F1-13).
// 1.5b: el rol anfitrión se eliminó y sus tareas (bloquear y unir mesas, transferir cuentas y
// gestionar el estado de las reservas) pasaron al mesero. Las migraciones 1.1 y 1.5b usan copias
// fijas de estas listas; un cambio aquí necesita su propia migración.
export const PERMISOS_SALON = {
    mesero: [
        'mesa:ver', 'mesa:operar', 'mesa:bloquear', 'mesa:unir', 'cuenta:abrir', 'cuenta:ver', 'cuenta:transferir',
        'comanda:tomar', 'comanda:enviar', 'cuenta:solicitar',
    ],
}

// Permisos de cocina y barra de la Fase 2 (2.1). La migración 2.1 usa una copia fija de esta lista;
// un cambio aquí necesita su propia migración. El admin los tiene todos por "*".
export const PERMISOS_COCINA = {
    mesero: ['item:servir', 'producto:agotar'],
    cocina: ['kds:ver', 'item:preparar', 'pedido:preparar', 'producto:agotar', 'producto:reactivar'],
    barista: ['kds:ver', 'item:preparar', 'pedido:preparar', 'producto:agotar', 'producto:reactivar'],
}

// Permiso de cobro de la Fase 3 (F3-1). La migración 3.1 usa una copia fija; un cambio aquí necesita su
// propia migración. El admin cobra por "*"; el mesero no cobra.
// 3b · El cajero abre y cierra el turno y cobra domicilios; el repartidor cobra los suyos al entregarlos, con su método de pago (3b.q).
// factura:anular solo el admin ("*"). La migración 3b usa una copia fija de lo que agrega.
export const PERMISOS_CAJA = {
    cajero: ['cuenta:cobrar', 'caja:abrir', 'caja:cerrar', 'pedido:cobrar'],
    repartidor: ['pedido:cobrar'],
}

// 6.2 (F6-2) · Domicilio con repartidor asignado. La migración 6.2 usa una copia fija de esta lista.
export const PERMISOS_DOMICILIO = {
    cajero: ['pedido:asignar_repartidor'],
    repartidor: ['pedido:entregar'],
}

// 6.3 (F6-3) · Para llevar: el mesero desde /staff y el cajero desde la caja. La migración 6.3 usa una copia fija.
export const PERMISOS_PARA_LLEVAR = {
    mesero: ['cuenta:para_llevar'],
    cajero: ['cuenta:para_llevar'],
}
// 6.5 (F6-a) · Identificar al cliente de la cuenta: el mesero en la toma de comanda y el cajero en la caja. La migración
// 6.5 usa una copia fija
export const PERMISOS_CLIENTE = {
    mesero: ['cliente:identificar'],
    cajero: ['cliente:identificar'],
}
// Lo que `cuenta:para_llevar` permite, solo dentro de una cuenta para llevar (el cajero no toma comandas del salón)
export const PERMISOS_EN_PARA_LLEVAR = ['cuenta:ver', 'cuenta:abrir', 'comanda:tomar', 'comanda:enviar', 'cuenta:solicitar', 'item:servir']

/** 6.3 · Permisos con los que se opera una cuenta: en una para llevar, `cuenta:para_llevar` suma los de PERMISOS_EN_PARA_LLEVAR. */
export const permisosEnCuenta = (permisosUsuario = [], canal) =>
    canal === 'para_llevar' && permisosUsuario.includes('cuenta:para_llevar')
        ? [...new Set([...permisosUsuario, ...PERMISOS_EN_PARA_LLEVAR])]
        : permisosUsuario

// Fase 5 (F5-8) · El rol compras: inventario, proveedores, órdenes y recepción; sin caja, salón ni cocina.
// La migración 5 usa una copia fija de esta lista; un cambio aquí necesita su propia migración.
export const PERMISOS_INVENTARIO = {
    compras: ['inventario:ver', 'inventario:gestionar', 'inventario:ajustar', 'compra:gestionar', 'compra:recibir'],
}
// Cualquiera de estos deja ver la pantalla de inventario (cada pestaña pide el suyo)
export const PERMISOS_PANTALLA_INVENTARIO = ['inventario:ver', ...PERMISOS_INVENTARIO.compras.filter((p) => p !== 'inventario:ver')]

// 2.5b · Estaciones del KDS de cada rol al crearlo (Brayan, 2026-11-13): cocina → Cocina, barista → Barra.
// Las edita el admin en Admin › Roles; los roles existentes las reciben con la migración 2.5b.
export const ESTACIONES_POR_ROL = { cocina: ['cocina'], barista: ['barra'] }

// Roles de staff con permisos mínimos (se amplían en cada fase).
// El seed solo los asigna al crear el rol; después los edita el admin.
export const ROLES_STAFF = [
    {
        nombre: 'mesero',
        etiqueta: 'Mesero',
        descripcion: 'Atiende mesas, toma comandas y gestiona las reservas.',
        permisos: ['pedido:ver', 'pedido:cambiar_estado', 'reserva:ver', 'reserva:crear', 'reserva:cambiar_estado', ...PERMISOS_SALON.mesero, ...PERMISOS_COCINA.mesero, ...PERMISOS_PARA_LLEVAR.mesero, ...PERMISOS_CLIENTE.mesero],
    },
    { nombre: 'cocina', etiqueta: 'Cocina', descripcion: 'Prepara los platos.', permisos: ['pedido:ver', ...PERMISOS_COCINA.cocina], estaciones: ESTACIONES_POR_ROL.cocina },
    { nombre: 'barista', etiqueta: 'Barista', descripcion: 'Prepara las bebidas.', permisos: ['pedido:ver', ...PERMISOS_COCINA.barista], estaciones: ESTACIONES_POR_ROL.barista },
    { nombre: 'cajero', etiqueta: 'Cajero', descripcion: 'Cobra cuentas y gestiona la caja.', permisos: ['pedido:ver', ...PERMISOS_CAJA.cajero, ...PERMISOS_DOMICILIO.cajero, ...PERMISOS_PARA_LLEVAR.cajero, ...PERMISOS_CLIENTE.cajero] },
    { nombre: 'repartidor', etiqueta: 'Repartidor', descripcion: 'Entrega pedidos a domicilio.', permisos: ['pedido:ver', ...PERMISOS_CAJA.repartidor, ...PERMISOS_DOMICILIO.repartidor] },
    // Fase 5 (F5-8) · Vuelve el rol compras (se había quitado en 1.5b, cuando no tenía permisos)
    { nombre: 'compras', etiqueta: 'Compras', descripcion: 'Gestiona el inventario, los proveedores y las compras.', permisos: [...PERMISOS_INVENTARIO.compras] },
]

// 1.7b · Atiende mesas quien tiene comanda:tomar en su rol, sin contar el comodín: el administrador
// puede operar en /staff (F1-19), pero otro no lo puede dejar como responsable (5.8.2: él a sí mismo, sí)
export const atiendeMesas = (permisosUsuario = []) => permisosUsuario.includes('comanda:tomar')

// 5.8.2 · (Brayan, 2026-11-19) El usuario conectado puede quedar como responsable de una cuenta si atiende mesas
// o si es el admin («*»), pero SOLO para sí mismo: los demás admins siguen sin aparecer ni poder asignarse.
export const puedeSerResponsable = (permisosUsuario = []) => atiendeMesas(permisosUsuario) || permisosUsuario.includes(COMODIN)

export const tienePermiso = (permisosUsuario = [], clave) =>
    permisosUsuario.includes(COMODIN) || permisosUsuario.includes(clave)

/**
 * 6.2 (F6-2) · Quien entrega domicilios pero no los asigna (el repartidor) solo ve, avanza y cobra los que tiene
 * asignados. Por permisos, no por el nombre del rol; el admin («*») y el cajero ven todos.
 */
export const soloDomiciliosAsignados = (permisosUsuario = []) =>
    tienePermiso(permisosUsuario, 'pedido:entregar') && !tienePermiso(permisosUsuario, 'pedido:asignar_repartidor')

/** 2.5b · ¿Puede ver u operar esa estación del KDS? El comodín, todas; el resto, solo las de su rol
 * (sin estaciones asignadas, ninguna: cerrado por defecto). */
export const operaEstacion = (sesion, codigo) =>
    (sesion?.permisos || []).includes(COMODIN) || (Boolean(codigo) && (sesion?.estaciones || []).includes(codigo))
