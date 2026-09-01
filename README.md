# Dibya Jyoti Secondary School Website

Full-stack school website using Node.js, Express, MongoDB and a static HTML/CSS/JS frontend.

## Local run
1. Copy `backend/.env.example` to `backend/.env` and fill in MongoDB + admin values.
2. Run `cd backend && npm install && npm start`.
3. Open `http://localhost:5000`.

## Render deployment
- Root Directory: `backend`
- Build Command: `npm install`
- Start Command: `npm start`
- Add these environment variables in Render: `MONGODB_URI`, `JWT_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`.
- `PORT` is supplied by Render automatically.

Uploaded images/PDFs are stored in MongoDB GridFS, so they do not depend on the server's local filesystem.
