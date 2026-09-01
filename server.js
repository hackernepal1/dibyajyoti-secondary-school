require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const rateLimit = require("express-rate-limit");
const { GridFSBucket, ObjectId } = require("mongodb");

const User = require("./models/User");
const Notice = require("./models/Notice");
const Gallery = require("./models/Gallery");
const Video = require("./models/Video");
const Event = require("./models/Event");

const app = express();
const PORT = process.env.PORT || 5000;
const FRONTEND_DIR = path.join(__dirname, "..", "frontend");

if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is required");
if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET is required");
if (!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD) {
    throw new Error("ADMIN_USERNAME and ADMIN_PASSWORD are required");
}

app.set("trust proxy", 1);
app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false
});

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 15 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = [
            "image/jpeg", "image/png", "image/webp", "image/gif",
            "application/pdf"
        ];
        if (!allowed.includes(file.mimetype)) {
            return cb(new Error("Only JPG, PNG, WEBP, GIF images and PDF files are allowed."));
        }
        cb(null, true);
    }
});

function requireAuth(req, res, next) {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return res.status(401).json({ message: "Authentication required" });

    try {
        req.user = jwt.verify(token, process.env.JWT_SECRET);
        if (req.user.role !== "admin") return res.status(403).json({ message: "Admin access required" });
        next();
    } catch {
        return res.status(401).json({ message: "Invalid or expired token" });
    }
}

function getGridFS() {
    if (!mongoose.connection.db) throw new Error("Database is not ready");
    return new GridFSBucket(mongoose.connection.db, { bucketName: "uploads" });
}

app.get("/api/health", (req, res) => {
    res.json({ ok: true, database: mongoose.connection.readyState === 1 });
});

app.post("/api/auth/login", authLimiter, async (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ message: "Username and password are required" });

    try {
        const user = await User.findOne({ username });
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ message: "Invalid credentials" });
        }

        const token = jwt.sign(
            { id: user._id.toString(), role: user.role, username: user.username },
            process.env.JWT_SECRET,
            { expiresIn: "1d" }
        );

        res.json({ token, user: { id: user._id, username: user.username, role: user.role } });
    } catch (err) {
        console.error("Login error:", err);
        res.status(500).json({ message: "Server error" });
    }
});

// Public content APIs
app.get("/api/notices", async (req, res) => {
    try { res.json(await Notice.find({ published: true }).sort({ createdAt: -1 })); }
    catch (err) { res.status(500).json({ message: "Unable to load notices" }); }
});

app.get("/api/notices/latest", async (req, res) => {
    try { res.json(await Notice.find({ published: true }).sort({ createdAt: -1 }).limit(5)); }
    catch (err) { res.status(500).json({ message: "Unable to load notices" }); }
});

app.get("/api/gallery", async (req, res) => {
    try { res.json(await Gallery.find().sort({ createdAt: -1 })); }
    catch (err) { res.status(500).json({ message: "Unable to load gallery" }); }
});

app.get("/api/videos", async (req, res) => {
    try { res.json(await Video.find().sort({ createdAt: -1 })); }
    catch (err) { res.status(500).json({ message: "Unable to load videos" }); }
});

app.get("/api/events", async (req, res) => {
    try { res.json(await Event.find().sort({ eventDate: 1 })); }
    catch (err) { res.status(500).json({ message: "Unable to load events" }); }
});

// Admin APIs
app.post("/api/notices", requireAuth, async (req, res) => {
    try { res.status(201).json(await Notice.create(req.body)); }
    catch (err) { res.status(400).json({ message: err.message }); }
});

app.post("/api/gallery", requireAuth, async (req, res) => {
    try { res.status(201).json(await Gallery.create(req.body)); }
    catch (err) { res.status(400).json({ message: err.message }); }
});

app.post("/api/videos", requireAuth, async (req, res) => {
    try { res.status(201).json(await Video.create(req.body)); }
    catch (err) { res.status(400).json({ message: err.message }); }
});

app.post("/api/events", requireAuth, async (req, res) => {
    try { res.status(201).json(await Event.create(req.body)); }
    catch (err) { res.status(400).json({ message: err.message }); }
});

app.post("/api/upload", requireAuth, upload.single("file"), async (req, res) => {
    if (!req.file) return res.status(400).json({ message: "No file selected" });

    try {
        const bucket = getGridFS();
        const filename = `${Date.now()}-${req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const stream = bucket.openUploadStream(filename, {
            contentType: req.file.mimetype,
            metadata: { originalName: req.file.originalname }
        });

        stream.end(req.file.buffer);
        stream.on("finish", () => {
            res.status(201).json({
                message: "File uploaded successfully",
                url: `/api/uploads/${stream.id.toString()}`,
                id: stream.id.toString(),
                contentType: req.file.mimetype
            });
        });
        stream.on("error", (err) => {
            console.error("GridFS upload error:", err);
            if (!res.headersSent) res.status(500).json({ message: "Upload failed" });
        });
    } catch (err) {
        console.error("Upload error:", err);
        res.status(500).json({ message: "Upload failed" });
    }
});

app.get("/api/uploads/:id", async (req, res) => {
    try {
        const id = new ObjectId(req.params.id);
        const files = await mongoose.connection.db.collection("uploads.files").find({ _id: id }).limit(1).toArray();
        if (!files.length) return res.status(404).send("File not found");

        res.set("Content-Type", files[0].contentType || "application/octet-stream");
        res.set("Cache-Control", "public, max-age=31536000, immutable");
        getGridFS().openDownloadStream(id).on("error", () => {
            if (!res.headersSent) res.status(404).end();
        }).pipe(res);
    } catch {
        res.status(400).send("Invalid file id");
    }
});

// Serve the complete frontend from the same Node service (no localhost URLs needed).
app.use(express.static(FRONTEND_DIR, { extensions: ["html"] }));

app.get("/{*splat}", (req, res) => {
    if (req.path.startsWith("/api/")) return res.status(404).json({ message: "API route not found" });
    res.sendFile(path.join(FRONTEND_DIR, "index.html"));
});

app.use((err, req, res, next) => {
    console.error(err);
    if (err instanceof multer.MulterError) return res.status(400).json({ message: err.message });
    res.status(400).json({ message: err.message || "Request failed" });
});

async function start() {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("MongoDB connected");

    const adminExists = await User.findOne({ role: "admin" });
    if (!adminExists) {
        const hashedPassword = await bcrypt.hash(process.env.ADMIN_PASSWORD, 12);
        await User.create({ username: process.env.ADMIN_USERNAME, password: hashedPassword, role: "admin" });
        console.log(`Initial admin '${process.env.ADMIN_USERNAME}' created.`);
    }

    app.listen(PORT, "0.0.0.0", () => console.log(`Server running on port ${PORT}`));
}

start().catch((err) => {
    console.error("Startup failed:", err);
    process.exit(1);
});
