import mongoose from 'mongoose'

const menuImageSchema = new mongoose.Schema({
    nombre: {
        type: String,
        required: true,
        unique: true,
    },
    contentType: {
        type: String,
        required: true,
    },
    data: {
        type: Buffer,
        required: true,
    },
}, {
    timestamps: true,
})

export default mongoose.model('MenuImage', menuImageSchema)
