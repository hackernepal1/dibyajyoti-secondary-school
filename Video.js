
const express = require("express");
const router = express.Router();

const Video = require("../models/Video");

// ===============================
// GET ALL VIDEOS
// ===============================
router.get("/", async (req, res) => {
    try {
        const videos = await Video.find().sort({ createdAt: -1 });

        res.json(videos);

    } catch (error) {
        console.error(error);

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

        const { title, description, videoUrl, thumbnail } = req.body;

        const video = new Video({
            title,
            description,
            videoUrl,
            thumbnail
        });

        const savedVideo = await video.save();

        res.status(201).json(savedVideo);

    } catch (error) {
        console.error(error);

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

        const deletedVideo = await Video.findByIdAndDelete(
            req.params.id
        );

        if (!deletedVideo) {
            return res.status(404).json({
                message: "Video not found"
            });
        }

        res.json({
            message: "Video deleted successfully",
            video: deletedVideo
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            message: "Failed to delete video"
        });
    }
});


module.exports = router;
