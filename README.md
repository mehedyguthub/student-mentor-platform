# Student Mentor Connection Platform

A web platform where university students connect with mentors, share academic updates, collaborate on research and get help from an AI assistant.

## Features
- Registration and login for students, mentors and administrators (bcrypt + JWT)
- Editable profiles with photo, skills and research interests
- Find mentors and students, send and manage connection requests
- Real-time private messaging (Socket.IO)
- Live notification bell with unread count
- Newsfeed with likes, comments, reports and JPG picture uploads
- Research Hub, events and shared resources
- Real-time AI chatbot (Groq, streamed over Socket.IO)
- AI mentor recommendations with a keyword fallback
- Admin panel: manage users, review reports, view statistics

## Tech stack
Node.js, Express, MongoDB Atlas (Mongoose), Socket.IO, plain HTML/CSS/JavaScript frontend.

## Getting started
1. Clone the repository and open the folder.
2. Run `npm install`.
3. Copy `.env.example` to `.env` and fill in the values:
   - `MONGODB_URI`: your MongoDB Atlas connection string
   - `JWT_SECRET`: a long random string
   - `GROQ_API_KEY` and `GROQ_MODEL`: needed for the chatbot and recommendations (get a key at console.groq.com)
4. In MongoDB Atlas, add your IP address under Network Access.
5. Run `npm run dev` and open http://localhost:5000
6. Optional: `npm run create-admin` creates an administrator account.

Never commit your `.env` file. Share secrets with teammates privately.

## Project structure
```
src/
  models/       Mongoose schemas
  routes/       REST API endpoints
  middleware/   Authentication and role checks
  chatbot.js    Real-time AI chatbot (Socket.IO)
  server.js     App entry point
public/         Frontend pages, app.js and style.css
```

## Security
Passwords hashed with bcrypt, JWT authentication, role-based access, Helmet, rate limiting, input sanitization, escaped output, verified JPG uploads, and API keys kept on the server only.

## Known limitations
- The login token is stored in localStorage (httpOnly cookies would be stronger).
- Mentorship session scheduling, email verification and password reset are not built yet.

## Team
Md Mehedy Hasan
Md Sazzad Talukdar
Mst Suparna Bhowmik
