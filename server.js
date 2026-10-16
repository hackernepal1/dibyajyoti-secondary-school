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
const fs = require("fs");
const rateLimit = require("express-rate-limit");

// ===============================
// CLOUDINARY CONFIGURATION
// ===============================

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// ===============================
// MODELS
// ===============================

const User = require("./User");
const Notice = require("./Notice");
const Gallery = require("./Gallery");
const Video = require("./Video");
const Event = require("./Event");

// ===============================
// APP CONFIG
// ===============================

const app = express();

const PORT = process.env.PORT || 5000;

const FRONTEND_DIR = path.join(__dirname);

// ===============================
// MIDDLEWARE
// ===============================

app.use(cors());

app.use(express.json());

app.use(
  express.urlencoded({
    extended: true
  })
);

// ===============================
// ENVIRONMENT CHECK
// ===============================

if (!process.env.MONGODB_URI) {
  throw new Error("MONGODB_URI is required");
}

if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET is required");
}

if (
  !process.env.ADMIN_USERNAME ||
  !process.env.ADMIN_PASSWORD
) {
  throw new Error(
    "ADMIN_USERNAME and ADMIN_PASSWORD are required"
  );
}

app.set("trust proxy", 1);

// ===============================
// LOGIN RATE LIMIT
// ===============================

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false
});

// ===============================
// CLOUDINARY UPLOAD
// ===============================

const upload = multer({
  storage: new CloudinaryStorage({
    cloudinary: cloudinary,

    params: {
      folder: "school_gallery",
      upload_preset: "ml_default"
    }
  }),

  limits: {
    fileSize: 30 * 1024 * 1024
  },

  fileFilter: (req, file, cb) => {

    const allowed = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
      "image/gif",
      "image/heic",
      "image/heif",
      "application/pdf"
    ];

    if (
      !allowed.includes(
        file.mimetype.toLowerCase()
      )
    ) {
      return cb(
        new Error(
          "Only JPG, JPEG, PNG, WEBP, GIF, HEIC, HEIF images and PDF files are allowed."
        )
      );
    }

    cb(null, true);
  }
});

// ===============================
// GRIDFS UPLOAD
// ===============================

const gridfsUpload = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: 30 * 1024 * 1024
  },

  fileFilter: (req, file, cb) => {

    const allowed = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
      "image/gif",
      "image/heic",
      "image/heif",
      "application/pdf"
    ];

    if (
      !allowed.includes(
        file.mimetype.toLowerCase()
      )
    ) {
      return cb(
        new Error(
          "Only JPG, JPEG, PNG, WEBP, GIF, HEIC, HEIF images and PDF files are allowed."
        )
      );
    }

    cb(null, true);
  }
});

// ===============================
// AUTH
// ===============================

function requireAuth(req, res, next) {

  const header =
    req.headers.authorization || "";

  const token =
    header.startsWith("Bearer ")
      ? header.slice(7)
      : null;

  if (!token) {
    return res.status(401).json({
      message: "Authentication required"
    });
  }

  try {

    req.user = jwt.verify(
      token,
      process.env.JWT_SECRET
    );

    if (req.user.role !== "admin") {
      return res.status(403).json({
        message: "Admin access required"
      });
    }

    next();

  } catch {

    return res.status(401).json({
      message: "Invalid or expired token"
    });
  }
}

// ===============================
// GRIDFS
// ===============================

function getGridFS() {

  if (!mongoose.connection.db) {
    throw new Error(
      "Database is not ready"
    );
  }

  return new mongoose.mongo.GridFSBucket(
    mongoose.connection.db,
    {
      bucketName: "uploads"
    }
  );
}

// ===============================
// HEALTH
// ===============================

app.get(
  "/api/health",
  (req, res) => {

    res.json({
      ok: true,

      database:
        mongoose.connection.readyState === 1
    });

  }
);

// ===============================
// LOGIN
// ===============================

app.post(
  "/api/auth/login",
  authLimiter,
  async (req, res) => {

    const {
      username,
      password
    } = req.body || {};

    if (!username || !password) {

      return res.status(400).json({
        message:
          "Username and password are required"
      });

    }

    try {

      const user =
        await User.findOne({
          username
        });

      if (
        !user ||
        !(await bcrypt.compare(
          password,
          user.password
        ))
      ) {

        return res.status(401).json({
          message:
            "Invalid credentials"
        });

      }

      const token =
        jwt.sign(
          {
            id: user._id.toString(),
            role: user.role,
            username: user.username
          },

          process.env.JWT_SECRET,

          {
            expiresIn: "1d"
          }
        );

      res.json({

        token,

        user: {
          id: user._id,
          username: user.username,
          role: user.role
        }

      });

    } catch (err) {

      console.error(
        "Login error:",
        err
      );

      res.status(500).json({
        message:
          "Server error"
      });

    }

  }
);

// ===============================
// PUBLIC APIs
// ===============================

// NOTICES

app.get(
  "/api/notices",
  async (req, res) => {

    try {

      res.json(
        await Notice.find({
          published: true
        }).sort({
          createdAt: -1
        })
      );

    } catch (err) {

      res.status(500).json({
        message:
          "Unable to load notices"
      });

    }

  }
);

// LATEST NOTICES

app.get(
  "/api/notices/latest",
  async (req, res) => {

    try {

      res.json(
        await Notice.find({
          published: true
        })
        .sort({
          createdAt: -1
        })
        .limit(5)
      );

    } catch (err) {

      res.status(500).json({
        message:
          "Unable to load notices"
      });

    }

  }
);

// GALLERY

app.get(
  "/api/gallery",
  async (req, res) => {

    try {

      res.json(
        await Gallery.find().sort({
          createdAt: -1
        })
      );

    } catch (err) {

      res.status(500).json({
        message:
          "Unable to load gallery"
      });

    }

  }
);

// VIDEOS

app.get(
  "/api/videos",
  async (req, res) => {

    try {

      res.json(
        await Video.find().sort({
          createdAt: -1
        })
      );

    } catch (err) {

      res.status(500).json({
        message:
          "Unable to load videos"
      });

    }

  }
);

// EVENTS

app.get(
  "/api/events",
  async (req, res) => {

    try {

      res.json(
        await Event.find().sort({
          eventDate: 1
        })
      );

    } catch (err) {

      res.status(500).json({
        message:
          "Unable to load events"
      });

    }

  }
);

// ===============================
// ADMIN - NOTICE
// ===============================

app.post(
  "/api/notices",

  requireAuth,

  upload.single("image"),

  async (req, res) => {

    try {

      const noticeData = {
        ...req.body
      };

      if (req.file) {
        noticeData.image =
          req.file.path;
      }

      const newNotice =
        await Notice.create(
          noticeData
        );

      res.status(201).json(
        newNotice
      );

    } catch (err) {

      res.status(400).json({
        message:
          err.message
      });

    }

  }
);

// ===============================
// ADMIN - GALLERY
// ===============================

app.post(
  "/api/gallery",

  requireAuth,

  upload.single("image"),

  async (req, res) => {

    try {

      const galleryData = {
        ...req.body
      };

      if (req.file) {
        galleryData.image =
          req.file.path;
      }

      const newGallery =
        await Gallery.create(
          galleryData
        );

      res.status(201).json(
        newGallery
      );

    } catch (err) {

      res.status(400).json({
        message:
          err.message
      });

    }

  }
);

// ===============================
// ADMIN - VIDEO
// ===============================

app.post(
  "/api/videos",

  requireAuth,

  async (req, res) => {

    try {

      res.status(201).json(
        await Video.create(
          req.body
        )
      );

    } catch (err) {

      res.status(400).json({
        message:
          err.message
      });

    }

  }
);

// ===============================
// ADMIN - EVENTS
// ===============================

app.post(
  "/api/events",

  requireAuth,

  async (req, res) => {

    try {

      res.status(201).json(
        await Event.create(
          req.body
        )
      );

    } catch (err) {

      res.status(400).json({
        message:
          err.message
      });

    }

  }
);

// ===============================
// GRIDFS FILE UPLOAD
// ===============================

app.post(
  "/api/upload",

  requireAuth,

  gridfsUpload.single("file"),

  async (req, res) => {

    if (!req.file) {

      return res.status(400).json({
        message:
          "No file selected"
      });

    }

    try {

      const bucket =
        getGridFS();

      const safeName =
        req.file.originalname.replace(
          /[^a-zA-Z0-9._-]/g,
          "_"
        );

      const filename =
        `${Date.now()}-${safeName}`;

      const stream =
        bucket.openUploadStream(
          filename,
          {
            contentType:
              req.file.mimetype,

            metadata: {
              originalName:
                req.file.originalname
            }
          }
        );

      stream.on(
        "error",
        (err) => {

          console.error(
            "GridFS upload error:",
            err
          );

          if (!res.headersSent) {

            res.status(500).json({
              message:
                "Upload failed",

              error:
                err.message
            });

          }

        }
      );

      stream.on(
        "finish",
        () => {

          const id =
            stream.id.toString();

          res.status(201).json({

            message:
              "File uploaded successfully",

            url:
              `/api/uploads/${id}`,

            id: id,

            contentType:
              req.file.mimetype

          });

        }
      );

      stream.end(
        req.file.buffer
      );

    } catch (err) {

      console.error(
        "Upload error:",
        err
      );

      if (!res.headersSent) {

        res.status(500).json({

          message:
            "Upload failed",

          error:
            err.message

        });

      }

    }

  }
);

// ===============================
// GRIDFS FILE VIEW
// ===============================

app.get(
  "/api/uploads/:id",
  async (req, res) => {

    try {

      if (!mongoose.connection.db) {

        return res
          .status(500)
          .send(
            "Database is not ready"
          );

      }

      const id =
        new mongoose.mongo.ObjectId(
          req.params.id
        );

      const files =
        await mongoose.connection.db
          .collection(
            "uploads.files"
          )
          .find({
            _id: id
          })
          .limit(1)
          .toArray();

      if (!files.length) {

        return res
          .status(404)
          .send(
            "File not found"
          );

      }

      res.set(
        "Content-Type",

        files[0].contentType ||
          "application/octet-stream"
      );

      res.set(
        "Cache-Control",
        "public, max-age=31536000, immutable"
      );

      getGridFS()
        .openDownloadStream(id)
        .on(
          "error",
          () => {

            if (!res.headersSent) {
              res.status(404).end();
            }

          }
        )
        .pipe(res);

    } catch (err) {

      console.error(
        "GridFS download error:",
        err
      );

      res.status(400).send(
        "Invalid file id"
      );

    }

  }
);

// ===============================
// SEO - ROBOTS.TXT
// ===============================

app.get(
  "/robots.txt",
  (req, res) => {

    res.type(
      "text/plain"
    );

    res.send(
`User-agent: *
Allow: /
Disallow: /api/
Disallow: /admin.html

Sitemap: https://dibyajyotiss.edu.np/sitemap.xml
`
    );

  }
);

// ===============================
// SEO - SITEMAP.XML
// ===============================

app.get(
  "/sitemap.xml",
  (req, res) => {

    const baseUrl =
      "https://dibyajyotiss.edu.np";

    let htmlFiles = [];

    try {

      htmlFiles =
        fs
          .readdirSync(
            FRONTEND_DIR
          )
          .filter(
            file =>
              file.endsWith(
                ".html"
              ) &&
              file.toLowerCase() !==
                "admin.html" &&
              file.toLowerCase() !==
                "login.html" &&
              !file
                .toLowerCase()
                .startsWith(
                  "google"
                )
          );

    } catch (err) {

      console.error(
        "Sitemap file scan error:",
        err
      );

    }

    const urls = [

      `<url>
  <loc>${baseUrl}/</loc>
</url>`

    ];

    htmlFiles.forEach(
      file => {

        urls.push(
`<url>
  <loc>${baseUrl}/${file}</loc>
</url>`
        );

      }
    );

    const sitemap =
`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>`;

    res.type(
      "application/xml"
    );

    res.send(
      sitemap
    );

  }
);


 // ==========================================
 // REDCSS TEAM | SECURE FILE ACCESS
 // Animated Cyber Security Response
 // ==========================================

const blockedFiles = new Set([
  "/server.js",
  "/user.js",
  "/notice.js",
  "/gallery.js",
  "/video.js",
  "/event.js",
  "/package.json",
  "/package-lock.json",
  "/.env"
]);

app.use((req, res, next) => {
  const pathname = req.path.toLowerCase();

  if (!blockedFiles.has(pathname)) {
    return next();
  }

  // Never expose backend source or environment data.
  res.status(404);
  res.set("Cache-Control", "no-store");
  res.type("html");

  return res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<meta name="theme-color" content="#050816">
<title>Access Denied | REDCSS TEAM</title>

<style>
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

:root {
  color-scheme: dark;
}

body {
  min-height: 100vh;
  min-height: 100dvh;
  display: grid;
  place-items: center;
  overflow: hidden;
  padding: 24px;
  font-family: system-ui, Arial, sans-serif;
  color: #f1f5ff;
  background:
    radial-gradient(ellipse at 15% 15%,
      #112653 0%, transparent 42%),
    radial-gradient(ellipse at 85% 85%,
      #251044 0%, transparent 40%),
    #050816;
}

.grid {
  position: fixed;
  inset: 0;
  pointer-events: none;
  opacity: .17;
  background-image:
    linear-gradient(#4568a3 1px, transparent 1px),
    linear-gradient(90deg, #4568a3 1px, transparent 1px);
  background-size: 42px 42px;
  mask-image: linear-gradient(to bottom, black, transparent);
  animation: gridMove 18s linear infinite;
}

.orb {
  position: fixed;
  width: 230px;
  height: 230px;
  border-radius: 50%;
  filter: blur(85px);
  opacity: .24;
  pointer-events: none;
  animation: float 7s ease-in-out infinite alternate;
}

.orb.one {
  background: #00e5ff;
  top: -100px;
  left: -70px;
}

.orb.two {
  background: #8b5cf6;
  bottom: -100px;
  right: -70px;
  animation-delay: -3s;
}

.card {
  width: min(100%, 480px);
  position: relative;
  isolation: isolate;
  padding: 38px 25px;
  text-align: center;
  border: 1px solid #34456b;
  border-radius: 25px;
  background: rgba(8, 15, 35, .82);
  box-shadow:
    0 0 45px rgba(0, 229, 255, .09),
    0 25px 80px rgba(0, 0, 0, .4);
  backdrop-filter: blur(18px);
  animation: appear .8s cubic-bezier(.2,.8,.2,1) both;
}

.card::before {
  content: "";
  position: absolute;
  z-index: -1;
  inset: -1px;
  padding: 1px;
  border-radius: inherit;
  background: linear-gradient(
    130deg, #00e5ff, transparent 38%,
    #8b5cf6 72%, #00e5ff
  );
  background-size: 250% 250%;
  animation: borderFlow 5s linear infinite;
  -webkit-mask:
    linear-gradient(#fff 0 0) content-box,
    linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  pointer-events: none;
}

.logo {
  width: 94px;
  height: 94px;
  margin: 0 auto 24px;
  display: grid;
  place-items: center;
  border-radius: 26px;
  color: #00e5ff;
  border: 1px solid #245a7c;
  background: linear-gradient(145deg,
    rgba(0,229,255,.13),
    rgba(139,92,246,.13));
  box-shadow: 0 0 35px rgba(0,229,255,.15);
  animation: pulse 3s ease-in-out infinite;
}

.logo svg {
  width: 53px;
  height: 53px;
  filter: drop-shadow(0 0 8px #00e5ff);
}

.tag {
  display: inline-block;
  margin-bottom: 19px;
  padding: 7px 12px;
  border: 1px solid #24556a;
  border-radius: 30px;
  background: rgba(0,229,255,.06);
  color: #66efff;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 2px;
}

h1 {
  font-size: clamp(25px, 7vw, 35px);
  line-height: 1.2;
  letter-spacing: -1px;
  margin-bottom: 13px;
}

h1 span {
  color: #4deaff;
  text-shadow: 0 0 22px rgba(0,229,255,.25);
}

.description {
  color: #a8b5d0;
  font-size: 14px;
  line-height: 1.8;
  margin: 0 auto 25px;
  max-width: 340px;
}

.status {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  padding: 13px;
  border: 1px solid #263957;
  border-radius: 12px;
  background: rgba(255,255,255,.025);
  color: #c5d2ea;
  font-size: 12px;
}

.dot {
  width: 8px;
  height: 8px;
  flex-shrink: 0;
  border-radius: 50%;
  background: #42e9a4;
  box-shadow: 0 0 12px #42e9a4;
  animation: blink 1.5s infinite;
}

.footer {
  margin-top: 28px;
  padding-top: 20px;
  border-top: 1px solid #26314c;
  color: #7384a5;
  font-size: 11px;
  letter-spacing: 1px;
}

.footer strong {
  display: block;
  margin-bottom: 7px;
  color: #dbe9ff;
  font-size: 13px;
  letter-spacing: 2px;
}

@keyframes appear {
  from { opacity: 0; transform: translateY(24px) scale(.97); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

@keyframes pulse {
  0%, 100% { transform: scale(1); box-shadow: 0 0 22px #00e5ff12; }
  50% { transform: scale(1.045); box-shadow: 0 0 38px #00e5ff30; }
}

@keyframes borderFlow {
  to { background-position: 250% 250%; }
}

@keyframes float {
  to { transform: translate(35px, 30px) scale(1.2); }
}

@keyframes gridMove {
  to { background-position: 42px 42px; }
}

@keyframes blink {
  50% { opacity: .35; }
}

@media (max-width: 400px) {
  .card { padding: 30px 19px; }
  .logo { width: 80px; height: 80px; }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation: none !important;
    scroll-behavior: auto !important;
  }
}
</style>
</head>

<body>
<div class="grid"></div>
<div class="orb one"></div>
<div class="orb two"></div>

<main class="card">
  <div class="logo" aria-hidden="true">
    <svg viewBox="0 0 64 64" fill="none"
         stroke="currentColor" stroke-width="2.5"
         stroke-linecap="round" stroke-linejoin="round">
      <path d="M32 5 53 13V29C53 43 44 53 32 59
               20 53 11 43 11 29V13L32 5Z"/>
      <path d="m22 32 7 7 14-16"/>
    </svg>
  </div>

  <div class="tag">SYSTEM ACCESS CONTROL</div>

  <h1>ACCESS <span>RESTRICTED</span></h1>

  <p class="description">
    This resource is not publicly available.
    Protected application resources are restricted
    to prevent unauthorized access.
  </p>

  <div class="status">
    <span class="dot"></span>
    <span>RESTRICTED RESOURCE · HTTP 404</span>
  </div>

  <div class="footer">
    <strong>REDCSS TEAM</strong>
    Dibya Jyoti Secondary School Portal
    <p style="margin-top:10px">
      SECURITY • INTEGRITY • PROTECTION
    </p>
  </div>
</main>
</body>
</html>`);
});

// ===============================
// FRONTEND
// ===============================

app.use(
  express.static(
    FRONTEND_DIR,
    {
      extensions: ["html"]
    }
  )
);

// ===============================
// SPA / FRONTEND FALLBACK
// ===============================

app.get(
  "/{*splat}",
  (req, res) => {

    if (
      req.path.startsWith(
        "/api/"
      )
    ) {

      return res
        .status(404)
        .json({
          message:
            "API route not found"
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

// ===============================
// ERROR HANDLER
// ===============================

app.use(
  (err, req, res, next) => {

    console.error(err);

    if (
      err instanceof
      multer.MulterError
    ) {

      return res
        .status(400)
        .json({
          message:
            err.message
        });

    }

    res
      .status(400)
      .json({

        message:
          err.message ||
          "Request failed"

      });

  }
);

// ===============================
// START SERVER
// ===============================

async function start() {

  await mongoose.connect(
    process.env.MONGODB_URI
  );

  console.log(
    "MongoDB connected"
  );

  const adminExists =
    await User.findOne({
      role: "admin"
    });

  if (!adminExists) {

    const hashedPassword =
      await bcrypt.hash(
        process.env.ADMIN_PASSWORD,
        12
      );

    await User.create({

      username:
        process.env.ADMIN_USERNAME,

      password:
        hashedPassword,

      role:
        "admin"

    });

    console.log(
      `Initial admin '${process.env.ADMIN_USERNAME}' created.`
    );

  }

  app.listen(
    PORT,
    "0.0.0.0",
    () => {

      console.log(
        `Server running on port ${PORT}`
      );

    }
  );

}

start().catch(
  (err) => {

    console.error(
      "Startup failed:",
      err
    );

    process.exit(1);

  }
);
