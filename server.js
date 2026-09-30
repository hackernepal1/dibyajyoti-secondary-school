require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const path = require("path");
const rateLimit = require("express-rate-limit");
const { GridFSBucket, ObjectId } = require("mongodb");


/* =====================================================
   MODELS
===================================================== */

const User = require("./User");
const Notice = require("./Notice");
const Gallery = require("./Gallery");
const Video = require("./Video");
const Event = require("./Event");
const Admission = require("./Admission");


/* =====================================================
   APP
===================================================== */

const app = express();

const PORT = process.env.PORT || 5000;
const FRONTEND_DIR = path.join(__dirname);


/* =====================================================
   MIDDLEWARE
===================================================== */

app.use(cors());

app.use(express.json({ limit: "10mb" }));

app.use(
    express.urlencoded({
        extended: true,
        limit: "10mb"
    })
);

app.set("trust proxy", 1);


/* =====================================================
   ENVIRONMENT CHECK
===================================================== */

if (!process.env.MONGODB_URI) {
    console.error("❌ MONGODB_URI is missing in .env");
    process.exit(1);
}

if (!process.env.JWT_SECRET) {
    console.error("❌ JWT_SECRET is missing in .env");
    process.exit(1);
}

if (!process.env.ADMIN_USERNAME) {
    console.error("❌ ADMIN_USERNAME is missing in .env");
    process.exit(1);
}

if (!process.env.ADMIN_PASSWORD) {
    console.error("❌ ADMIN_PASSWORD is missing in .env");
    process.exit(1);
}


/* =====================================================
   RATE LIMITERS
===================================================== */

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        message: "Too many requests. Please try again later."
    }
});


const admissionLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        message: "Too many admission requests. Please try again later."
    }
});


/* =====================================================
   CLOUDINARY
===================================================== */

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});


const cloudinaryStorage = new CloudinaryStorage({
    cloudinary,

    params: {
        folder: "dibya-jyoti-school",

        allowed_formats: [
            "jpg",
            "jpeg",
            "png",
            "webp"
        ]
    }
});


const uploadCloudinary = multer({
    storage: cloudinaryStorage
});


/* =====================================================
   MONGODB / GRIDFS
===================================================== */

let gridFSBucket = null;


/* =====================================================
   AUTH MIDDLEWARE
===================================================== */

function requireAuth(req, res, next) {

    try {

        const authHeader = req.headers.authorization;

        if (
            !authHeader ||
            !authHeader.startsWith("Bearer ")
        ) {

            return res.status(401).json({
                message: "Authentication required."
            });

        }


        const token = authHeader.split(" ")[1];


        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET
        );


        if (decoded.role !== "admin") {

            return res.status(403).json({
                message: "Admin access required."
            });

        }


        req.user = decoded;

        next();

    } catch (error) {

        return res.status(401).json({
            message: "Invalid or expired token."
        });

    }

}


/* =====================================================
   HEALTH
===================================================== */

app.get(
    "/api/health",
    (req, res) => {

        res.json({
            ok: true,
            message: "Dibya Jyoti backend is running."
        });

    }
);


/* =====================================================
   LOGIN
===================================================== */

app.post(
    "/api/auth/login",
    authLimiter,
    async (req, res) => {

        try {

            const {
                username,
                password
            } = req.body;


            if (!username || !password) {

                return res.status(400).json({
                    message:
                        "Username and password are required."
                });

            }


            const user = await User.findOne({
                username
            });


            if (!user) {

                return res.status(401).json({
                    message:
                        "Invalid username or password."
                });

            }


            const passwordMatch =
                await bcrypt.compare(
                    password,
                    user.password
                );


            if (!passwordMatch) {

                return res.status(401).json({
                    message:
                        "Invalid username or password."
                });

            }


            if (user.role !== "admin") {

                return res.status(403).json({
                    message:
                        "Admin access required."
                });

            }


            const token = jwt.sign(

                {
                    id: user._id.toString(),
                    username: user.username,
                    role: user.role
                },

                process.env.JWT_SECRET,

                {
                    expiresIn: "7d"
                }

            );


            res.json({

                message:
                    "Login successful.",

                token,

                user: {

                    id: user._id,
                    username: user.username,
                    role: user.role

                }

            });

        } catch (error) {

            console.error(
                "Login error:",
                error
            );

            res.status(500).json({
                message: "Login failed."
            });

        }

    }
);


/* =====================================================
   PUBLIC NOTICES
===================================================== */

app.get(
    "/api/notices",
    async (req, res) => {

        try {

            const notices =
                await Notice
                    .find({
                        published: true
                    })
                    .sort({
                        createdAt: -1
                    });

            res.json(notices);

        } catch (error) {

            console.error(error);

            res.status(500).json({
                message:
                    "Could not load notices."
            });

        }

    }
);


app.get(
    "/api/notices/latest",
    async (req, res) => {

        try {

            const notices =
                await Notice
                    .find({
                        published: true
                    })
                    .sort({
                        createdAt: -1
                    })
                    .limit(5);

            res.json(notices);

        } catch (error) {

            console.error(error);

            res.status(500).json({
                message:
                    "Could not load latest notices."
            });

        }

    }
);


/* =====================================================
   ADMIN ADD NOTICE
===================================================== */

app.post(
    "/api/notices",
    requireAuth,
    async (req, res) => {

        try {

            const {
                title,
                description,
                documentUrl,
                published
            } = req.body;


            if (!title) {

                return res.status(400).json({
                    message:
                        "Notice title is required."
                });

            }


            const notice =
                await Notice.create({

                    title:
                        title.trim(),

                    description:
                        description
                            ? description.trim()
                            : "",

                    documentUrl:
                        documentUrl || "",

                    published:
                        published !== false

                });


            res.status(201).json(notice);

        } catch (error) {

            console.error(
                "Notice creation error:",
                error
            );

            res.status(500).json({
                message:
                    "Could not create notice."
            });

        }

    }
);


/* =====================================================
   PUBLIC GALLERY
===================================================== */

app.get(
    "/api/gallery",
    async (req, res) => {

        try {

            const gallery =
                await Gallery
                    .find()
                    .sort({
                        createdAt: -1
                    });

            res.json(gallery);

        } catch (error) {

            console.error(error);

            res.status(500).json({
                message:
                    "Could not load gallery."
            });

        }

    }
);


/* =====================================================
   ADMIN ADD GALLERY
===================================================== */

app.post(
    "/api/gallery",
    requireAuth,
    async (req, res) => {

        try {

            const {
                title,
                caption,
                imageUrl
            } = req.body;


            if (!imageUrl) {

                return res.status(400).json({
                    message:
                        "Image URL is required."
                });

            }


            const gallery =
                await Gallery.create({

                    title:
                        title ||
                        "School Gallery",

                    caption:
                        caption || "",

                    imageUrl

                });


            res.status(201).json(gallery);

        } catch (error) {

            console.error(
                "Gallery creation error:",
                error
            );

            res.status(500).json({
                message:
                    "Could not save gallery image."
            });

        }

    }
);


/* =====================================================
   PUBLIC VIDEOS
===================================================== */

app.get(
    "/api/videos",
    async (req, res) => {

        try {

            const videos =
                await Video
                    .find()
                    .sort({
                        createdAt: -1
                    });

            res.json(videos);

        } catch (error) {

            console.error(error);

            res.status(500).json({
                message:
                    "Could not load videos."
            });

        }

    }
);


/* =====================================================
   ADMIN ADD VIDEO
===================================================== */

app.post(
    "/api/videos",
    requireAuth,
    async (req, res) => {

        try {

            const {
                title,
                videoUrl,
                description
            } = req.body;


            if (!title || !videoUrl) {

                return res.status(400).json({
                    message:
                        "Video title and URL are required."
                });

            }


            const video =
                await Video.create({

                    title:
                        title.trim(),

                    videoUrl:
                        videoUrl.trim(),

                    description:
                        description
                            ? description.trim()
                            : ""

                });


            res.status(201).json(video);

        } catch (error) {

            console.error(
                "Video creation error:",
                error
            );

            res.status(500).json({
                message:
                    "Could not add video."
            });

        }

    }
);


/* =====================================================
   ADMIN DELETE VIDEO
===================================================== */

app.delete(
    "/api/videos/:id",
    requireAuth,
    async (req, res) => {

        try {

            const video =
                await Video.findByIdAndDelete(
                    req.params.id
                );


            if (!video) {

                return res.status(404).json({
                    message:
                        "Video not found."
                });

            }


            res.json({
                message:
                    "Video deleted successfully."
            });

        } catch (error) {

            console.error(
                "Video delete error:",
                error
            );

            res.status(500).json({
                message:
                    "Could not delete video."
            });

        }

    }
);


/* =====================================================
   PUBLIC EVENTS
===================================================== */

app.get(
    "/api/events",
    async (req, res) => {

        try {

            const events =
                await Event
                    .find()
                    .sort({
                        eventDate: 1
                    });

            res.json(events);

        } catch (error) {

            console.error(error);

            res.status(500).json({
                message:
                    "Could not load events."
            });

        }

    }
);


/* =====================================================
   ADMIN ADD EVENT
===================================================== */

app.post(
    "/api/events",
    requireAuth,
    async (req, res) => {

        try {

            const {
                title,
                eventDate,
                location,
                description
            } = req.body;


            if (!title || !eventDate) {

                return res.status(400).json({
                    message:
                        "Event title and date are required."
                });

            }


            const event =
                await Event.create({

                    title:
                        title.trim(),

                    eventDate,

                    location:
                        location
                            ? location.trim()
                            : "",

                    description:
                        description
                            ? description.trim()
                            : ""

                });


            res.status(201).json(event);

        } catch (error) {

            console.error(
                "Event creation error:",
                error
            );

            res.status(500).json({
                message:
                    "Could not add event."
            });

        }

    }
);


/* =====================================================
   ADMISSION - PUBLIC SUBMISSION
===================================================== */

app.post(
    "/api/admissions",
    admissionLimiter,
    async (req, res) => {

        try {

            const {
                studentName,
                parentName,
                phone,
                grade,
                program,
                message
            } = req.body;


            if (
                !studentName ||
                !parentName ||
                !phone ||
                !grade ||
                !program
            ) {

                return res.status(400).json({

                    message:
                        "Student name, parent name, phone, grade and program are required."

                });

            }


            const admission =
                await Admission.create({

                    studentName:
                        studentName.trim(),

                    parentName:
                        parentName.trim(),

                    phone:
                        phone.trim(),

                    grade:
                        grade.trim(),

                    program:
                        program.trim(),

                    message:
                        message
                            ? message.trim()
                            : "",

                    status:
                        "new"

                });


            res.status(201).json({

                success: true,

                message:
                    "Admission enquiry submitted successfully.",

                admissionId:
                    admission._id

            });

        } catch (error) {

            console.error(
                "Admission submission error:",
                error
            );

            res.status(500).json({

                success: false,

                message:
                    "Could not submit admission enquiry."

            });

        }

    }
);


/* =====================================================
   ADMIN - GET ADMISSIONS
===================================================== */

app.get(
    "/api/admissions",
    requireAuth,
    async (req, res) => {

        try {

            const admissions =
                await Admission
                    .find()
                    .sort({
                        createdAt: -1
                    });

            res.json(admissions);

        } catch (error) {

            console.error(
                "Admission fetch error:",
                error
            );

            res.status(500).json({

                message:
                    "Could not load admissions."

            });

        }

    }
);


/* =====================================================
   ADMIN - UPDATE ADMISSION STATUS
===================================================== */

app.patch(
    "/api/admissions/:id/status",
    requireAuth,
    async (req, res) => {

        try {

            const {
                status
            } = req.body;


            const allowedStatuses = [
                "new",
                "contacted",
                "approved",
                "rejected"
            ];


            if (
                !allowedStatuses.includes(status)
            ) {

                return res.status(400).json({

                    message:
                        "Invalid admission status."

                });

            }


            const admission =
                await Admission.findByIdAndUpdate(

                    req.params.id,

                    {
                        status
                    },

                    {
                        new: true
                    }

                );


            if (!admission) {

                return res.status(404).json({

                    message:
                        "Admission not found."

                });
        
            }

        res.json({
            message: "Admission status updated successfully.",
            admission
        });

    } catch (error) {

        console.error(
            "Admission status update error:",
            error
        );

        res.status(500).json({
            message: "Could not update admission status."
        });

    }

});

/* =====================================================
   ADMIN DELETE ADMISSION
===================================================== */

app.delete(
    "/api/admissions/:id",
    requireAuth,
    async (req, res) => {

        try {

            const admission =
                await Admission.findByIdAndDelete(
                    req.params.id
                );

            if (!admission) {

                return res.status(404).json({
                    message: "Admission not found."
                });

            }

            res.json({
                message: "Admission deleted successfully."
            });

        } catch (error) {

            console.error(
                "Admission delete error:",
                error
            );

            res.status(500).json({
                message: "Could not delete admission."
            });

        }

    }
);


/* =====================================================
   STATIC FRONTEND
===================================================== */

app.use(
    express.static(
        FRONTEND_DIR,
        {
            extensions: ["html"]
        }
    )
);


/* =====================================================
   FRONTEND FALLBACK
===================================================== */

app.get(
    "/{*splat}",
    (req, res) => {

        if (
            req.path.startsWith("/api/")
        ) {

            return res.status(404).json({
                message: "API route not found."
            });

        }

        res.sendFile(
            path.join(
                FRONTEND_DIR,
                "index.html"
            )
        );

    }
);


/* =====================================================
   ERROR HANDLER
===================================================== */

app.use(
    (error, req, res, next) => {

        console.error(
            "Server error:",
            error
        );

        if (res.headersSent) {
            return next(error);
        }

        res.status(500).json({
            message: "Internal server error."
        });

    }
);


/* =====================================================
   START SERVER
===================================================== */

async function start() {

    try {

        await mongoose.connect(
            process.env.MONGODB_URI
        );

        console.log(
            "✅ MongoDB connected."
        );


        gridFSBucket =
            new GridFSBucket(
                mongoose.connection.db,
                {
                    bucketName: "uploads"
                }
            );


        let admin =
            await User.findOne({
                username:
                    process.env.ADMIN_USERNAME
            });


        if (!admin) {

            const hashedPassword =
                await bcrypt.hash(
                    process.env.ADMIN_PASSWORD,
                    12
                );

            admin =
                await User.create({

                    username:
                        process.env.ADMIN_USERNAME,

                    password:
                        hashedPassword,

                    role:
                        "admin"

                });

            console.log(
                "✅ Initial admin created."
            );

        }


        app.listen(
            PORT,
            "0.0.0.0",
            () => {

                console.log(
                    `🚀 Server running on port ${PORT}`
                );

            }
        );

    } catch (error) {

        console.error(
            "❌ Server startup failed:",
            error
        );

        process.exit(1);

    }

}

start();
