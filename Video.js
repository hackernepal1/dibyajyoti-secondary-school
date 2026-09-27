const express = require("express");
const mongoose = require("mongoose");

const router = express.Router();

// ===============================
// VIDEO SCHEMA
// ===============================

const videoSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: true
        },

        description: {
            type: String,
            default: ""
        },

        videoUrl: {
            type: String,
            required: true
        },

        thumbnail: {
            type: String,
            default: ""
        }
    },
    {
        timestamps: true
    }
);

const Video =
    mongoose.models.Video ||
    mongoose.model("Video", videoSchema);


// ===============================
// GET ALL VIDEOS
// ===============================

router.get("/", async (req, res) => {
    try {

        const videos = await Video
            .find()
            .sort({ createdAt: -1 });

        res.json(videos);

    } catch (error) {

        console.error("GET VIDEOS ERROR:", error);

        res.status(500).json({
            message: "Failed to load videos"
        });
    }
});


// ===============================
// ADD VIDEO
// ===============================

router.post("/", async (req, res) => {
    try {

        const {
            title,
            description,
            videoUrl,
            thumbnail
        } = req.body;

        if (!title || !videoUrl) {
            return res.status(400).json({
                message: "Title and video URL are required"
            });
        }

        const video = new Video({
            title,
            description: description || "",
            videoUrl,
            thumbnail: thumbnail || ""
        });

        const savedVideo = await video.save();

        res.status(201).json(savedVideo);

    } catch (error) {

        console.error("ADD VIDEO ERROR:", error);

        res.status(500).json({
            message: "Failed to add video"
        });
    }
});


// ===============================
// DELETE VIDEO
// ===============================

router.delete("/:id", async (req, res) => {
    try {

        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                message: "Invalid video ID"
            });
        }

        const deletedVideo =
            await Video.findByIdAndDelete(id);

        if (!deletedVideo) {
            return res.status(404).json({
                message: "Video not found"
            });
        }

        res.json({
            success: true,
            message: "Video deleted successfully",
            video: deletedVideo
        });

    } catch (error) {

        console.error("DELETE VIDEO ERROR:", error);

        res.status(500).json({
            message: "Failed to delete video"
        });
    }
});


// ===============================
// EXPORT
// ===============================

module.exports = router;
