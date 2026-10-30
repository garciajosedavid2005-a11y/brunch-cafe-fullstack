import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    nombre: { type: String, required: true, trim: true, maxlength: 60 },
    apellido: { type: String, required: true, trim: true, maxlength: 60 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    telefono: { type: String, required: true, trim: true, maxlength: 30 },
    password: { type: String, required: true, select: false },
    role: { type: String, enum: ['customer', 'admin'], default: 'customer' },
  },
  { timestamps: true }
);

export default mongoose.model('User', userSchema);
