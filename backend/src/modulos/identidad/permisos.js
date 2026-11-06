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
    { clave: 'reserva:cambiar_estado', modulo: 'reservas', descripcion: 'Confirmar, sentar, completar o cancelar reservas' },
    { clave: 'resena:moderar', modulo: 'resenas', descripcion: 'Ocultar o eliminar reseñas' },
    { clave: 'estado:editar', modulo: 'configuracion', descripcion: 'Editar etiqueta, color y descripción de los estados' },
    { clave: 'metodo_pago:gestionar', modulo: 'configuracion', descripcion: 'Gestionar los métodos de pago' },
    { clave: 'horario:editar', modulo: 'configuracion', descripcion: 'Editar los horarios de domicilio y de reservas' },
    { clave: 'rol:gestionar', modulo: 'identidad', descripcion: 'Gestionar roles y sus permisos' },
    { clave: 'usuario:gestionar', modulo: 'identidad', descripcion: 'Activar/desactivar usuarios y asignar roles' },
    // Fases futuras (reservados)
    { clave: 'caja:abrir', modulo: 'caja', descripcion: 'Abrir turno de caja', reservado: true },
    { clave: 'caja:cerrar', modulo: 'caja', descripcion: 'Cerrar turno de caja y arqueo', reservado: true },
    { clave: 'factura:anular', modulo: 'caja', descripcion: 'Anular comprobantes / emitir nota crédito', reservado: true },
    { clave: 'inventario:gestionar', modulo: 'inventario', descripcion: 'Gestionar insumos, recetas y movimientos', reservado: true },
    { clave: 'reporte:ver', modulo: 'reportes', descripcion: 'Ver reportes de ventas y operación', reservado: true },
]

export const CLAVES = PERMISOS.map((p) => p.clave)
export const CLAVES_ASIGNABLES = PERMISOS.filter((p) => !p.reservado).map((p) => p.clave)

// Roles con reglas fijas
export const ROL_ADMIN = 'admin'
export const ROL_CLIENTE = 'cliente'

// Roles de staff con permisos mínimos (se amplían en cada fase).
// El seed solo los asigna al crear el rol; después los edita el admin.
export const ROLES_STAFF = [
    {
        nombre: 'mesero',
        etiqueta: 'Mesero',
        descripcion: 'Atiende mesas y toma comandas.',
        permisos: ['pedido:ver', 'pedido:cambiar_estado', 'reserva:ver', 'reserva:crear'],
    },
    { nombre: 'anfitrion', etiqueta: 'Anfitrión', descripcion: 'Recibe clientes y gestiona reservas.', permisos: ['reserva:ver', 'reserva:cambiar_estado'] },
    { nombre: 'cocina', etiqueta: 'Cocina', descripcion: 'Prepara los platos.', permisos: ['pedido:ver'] },
    { nombre: 'barista', etiqueta: 'Barista', descripcion: 'Prepara las bebidas.', permisos: ['pedido:ver'] },
    { nombre: 'cajero', etiqueta: 'Cajero', descripcion: 'Cobra cuentas y gestiona la caja.', permisos: ['pedido:ver'] },
    { nombre: 'repartidor', etiqueta: 'Repartidor', descripcion: 'Entrega pedidos a domicilio.', permisos: ['pedido:ver'] },
    { nombre: 'compras', etiqueta: 'Compras', descripcion: 'Gestiona proveedores e inventario.', permisos: [] },
]

export const tienePermiso = (permisosUsuario = [], clave) =>
    permisosUsuario.includes(COMODIN) || permisosUsuario.includes(clave)
