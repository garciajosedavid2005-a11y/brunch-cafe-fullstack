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
    // Fase 2 · cocina y barra (PLAN_FASE_2 §2, F2-2, F2-3, F2-5)
    { clave: 'kds:ver', modulo: 'cocina', descripcion: 'Ver la pantalla de cocina (KDS) de su estación' },
    { clave: 'item:preparar', modulo: 'cocina', descripcion: 'Marcar ítems en preparación y listos' },
    { clave: 'pedido:preparar', modulo: 'cocina', descripcion: 'Preparar pedidos a domicilio (confirmado → en preparación → listo)' },
    { clave: 'item:servir', modulo: 'salon', descripcion: 'Marcar como servidos los ítems listos' },
    { clave: 'producto:agotar', modulo: 'catalogo', descripcion: 'Marcar un producto u opción como agotado' },
    { clave: 'producto:reactivar', modulo: 'catalogo', descripcion: 'Volver a ofrecer un producto u opción agotado' },
    // Fases futuras (reservados)
    { clave: 'caja:abrir', modulo: 'caja', descripcion: 'Abrir turno de caja', reservado: true },
    { clave: 'caja:cerrar', modulo: 'caja', descripcion: 'Cerrar turno de caja y arqueo', reservado: true },
    { clave: 'factura:anular', modulo: 'caja', descripcion: 'Anular comprobantes / emitir nota crédito', reservado: true },
    { clave: 'inventario:gestionar', modulo: 'inventario', descripcion: 'Gestionar insumos, recetas y movimientos', reservado: true },
    { clave: 'reporte:ver', modulo: 'reportes', descripcion: 'Ver reportes de ventas y operación', reservado: true },
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

// Roles de staff con permisos mínimos (se amplían en cada fase).
// El seed solo los asigna al crear el rol; después los edita el admin.
export const ROLES_STAFF = [
    {
        nombre: 'mesero',
        etiqueta: 'Mesero',
        descripcion: 'Atiende mesas, toma comandas y gestiona las reservas.',
        permisos: ['pedido:ver', 'pedido:cambiar_estado', 'reserva:ver', 'reserva:crear', 'reserva:cambiar_estado', ...PERMISOS_SALON.mesero, ...PERMISOS_COCINA.mesero],
    },
    { nombre: 'cocina', etiqueta: 'Cocina', descripcion: 'Prepara los platos.', permisos: ['pedido:ver', ...PERMISOS_COCINA.cocina] },
    { nombre: 'barista', etiqueta: 'Barista', descripcion: 'Prepara las bebidas.', permisos: ['pedido:ver', ...PERMISOS_COCINA.barista] },
    { nombre: 'cajero', etiqueta: 'Cajero', descripcion: 'Cobra cuentas y gestiona la caja.', permisos: ['pedido:ver'] },
    { nombre: 'repartidor', etiqueta: 'Repartidor', descripcion: 'Entrega pedidos a domicilio.', permisos: ['pedido:ver'] },
]

// 1.7b · Atiende mesas quien tiene comanda:tomar en su rol, sin contar el comodín: el administrador
// puede operar en /staff (F1-19), pero no queda como mesero responsable de una cuenta
export const atiendeMesas = (permisosUsuario = []) => permisosUsuario.includes('comanda:tomar')

export const tienePermiso = (permisosUsuario = [], clave) =>
    permisosUsuario.includes(COMODIN) || permisosUsuario.includes(clave)
