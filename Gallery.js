const mongoose = require("mongoose");

const gallerySchema = new mongoose.Schema(
    {
        title: {
            type: String,
            default: "School Gallery"
        },

        imageUrl: {
            type: String,
            required: true
        },

        caption: {
            type: String,
            default: ""
        }
    },
    {
        timestamps: true
    }
);

module.exports = mongoose.model("Gallery", gallerySchema);