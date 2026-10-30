import menuData from "../../data/menu.json";

export const categoriasIniciales = [
  {
    id: 1,
    nombre: "Desayunos",
    descripcion: "Platos tradicionales y gourmet para empezar la mañana con energía.",
  },
  {
    id: 2,
    nombre: "Postres",
    descripcion: "Delicias dulces y artesanales preparadas a diario.",
  },
  {
    id: 3,
    nombre: "Pancakes y Waffles",
    descripcion: "Esponjosos y crujientes con toppings dulces y salados.",
  },
  {
    id: 4,
    nombre: "Tostadas",
    descripcion: "Tostadas en pan artesanal de masa madre con ingredientes frescos.",
  },
  {
    id: 5,
    nombre: "Bowls Saludables",
    descripcion: "Opciones frescas, nutritivas y balanceadas para cada momento.",
  },
  {
    id: 6,
    nombre: "Bebidas",
    descripcion: "Café de especialidad, bebidas frías naturales y smoothies.",
  },
];

export const productosIniciales = menuData.map((item) => ({
  id: item.id,
  nombre: item.nombre,
  descripcion: item.descripcion,
  precio: item.precio,
  categoria: item.categoria,
  imagen: item.imagen,
  destacado: !!item.destacado,
}));
