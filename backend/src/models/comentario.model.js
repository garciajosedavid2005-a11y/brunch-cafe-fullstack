import mongoose from 'mongoose';

const comentarioSchema = new mongoose.Schema(
  {
    usuario: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Usuario',
      required: true,
    },
    tipo: {
      type: String,
      enum: ['general', 'producto'],
      default: 'general',
      required: true,
    },
    // Corresponde al "codigo" del producto. Se quitó el máximo de 24 para que
    // los productos nuevos creados desde el dashboard también se puedan comentar.
    productoId: {
      type: Number,
      min: 1,
      required: function () {
        return this.tipo === 'producto';
      },
    },
    calificacion: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    comentario: {
      type: String,
      required: true,
      trim: true,
      minlength: 10,
      maxlength: 300,
    },
    // Moderación: si está en false, el comentario no se muestra en la web
    visible: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

comentarioSchema.index({ usuario: 1, createdAt: -1 });
comentarioSchema.index({ visible: 1, createdAt: -1 });

export default mongoose.model('Comentario', comentarioSchema);