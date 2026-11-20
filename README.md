# Student Mentor Connection Platform – v2
Multipage version. Open `http://localhost:5000` after `npm install` and `npm run dev`.
Copy your existing `.env` here (add `GEMINI_API_KEY` for the chatbot; see `.env.example`). `npm run create-admin` still creates an admin.

## What changed
- **Multipage UI** in `public/`: index, login, register, dashboard, mentors, connections, feed, messages, chatbot, research, events, resources, profile, notifications, admin (one shared `app.js` + `style.css`).
- **Real-time AI chatbot** (`src/chatbot.js`): Gemini streamed over Socket.IO, key kept on the server, 12 questions/min limit, clear error if no key.
- **Notification bell** top right: live badge and toast via Socket.IO (any `Notification.create` is pushed automatically), dropdown, mark all read, history page.
- **Editable profile** page: name, university, department, field, bio, skills, interests, photo.
- **Newsfeed JPG upload**: JPG only, 3 MB, file signature verified, stored in `public/uploads/posts`.
Old single-page `script.js`/`index.html` and the duplicate root copies were removed.
