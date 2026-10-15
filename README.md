# 🌌 Gemini Aura — Full-Stack Gemini LLM Chatbot

A fast, responsive, and aesthetically designed AI chatbot powered by **Google Gemini LLM**. Built with a clean separation of concerns between a dedicated **Node.js/Express backend** and a modern, framework-free **Vanilla HTML/CSS/JavaScript frontend**.

---

## 📁 Project Architecture & Folder Differentiation

The project is structured with a clear, distinct separation between the frontend client and the backend server:

```
Antigravity/
├── backend/                       # 🟢 BACKEND (Server, API & LLM Logic)
│   ├── server.js                  # Express server, Gemini SDK & Supabase integration
│   ├── package.json               # Backend dependencies (@google/generative-ai, @supabase/supabase-js, express)
│   ├── .ev                        # Backend environment configuration (Gemini & Supabase)
│   ├── .env                       # Backend environment configuration (.env format)
│   └── .env.example               # Template for backend environment configuration
│
├── frontend/                      # 🔵 FRONTEND (User Interface & Client Logic)
│   ├── index.html                 # Semantic HTML structure & accessible layout
│   ├── .ev                        # Frontend environment variables (Supabase URL & Anon Key)
│   ├── .env                       # Frontend environment variables (.env format)
│   ├── css/
│   │   └── style.css              # Obsidian dark theme, glassmorphism, micro-animations
│   └── js/
│       └── app.js                 # Client state, SSE streaming, Markdown & Supabase Cloud Sync
│
├── supabase_schema.sql            # Ready-to-run SQL schema for conversations & messages in Supabase
├── .gitignore                     # Git ignore rules for node_modules, .env, and .ev
├── package.json                   # Root convenience script runner
└── README.md                      # Documentation
```

### Why this separation?
- **Security**: The Gemini API key and backend service role key remain protected on the backend.
- **Client Configuration**: Public, client-safe Supabase parameters (`SUPABASE_URL`, `SUPABASE_ANON_KEY`) are decoupled in `frontend/.ev`.
- **Modularity**: The frontend can be hosted independently or served seamlessly by the Express backend.

---

## ⚡ Supabase Setup (Cloud Database Sync)

### 1. Database Tables Setup (Single Command Migration)
You can apply the migration in one of the following ways:

- **Option A (Automated CLI Script)**:
  Run from project root:
  ```powershell
  npm run migrate
  ```
- **Option B (Supabase CLI)**:
  ```powershell
  npx supabase db push
  ```
- **Option C (Supabase SQL Editor)**:
  Open [supabase/migrations/20261014000000_create_chatbot_tables.sql](file:///c:/Users/S%20P%20K/Antigravity/supabase/migrations/20261014000000_create_chatbot_tables.sql), paste into your [Supabase SQL Editor](https://supabase.com/dashboard/project/vmadcsoegpkklidcltwc/sql/new), and click **Run**.

### 2. Environment Variables (.ev / .env)
Populate your Supabase Project URL & Anon Key into:
- [`backend/.ev`](file:///c:/Users/S%20P%20K/Antigravity/backend/.ev):
  ```env
  SUPABASE_URL=https://your-project-id.supabase.co
  SUPABASE_ANON_KEY=your-supabase-anon-key-here
  SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key-here
  GEMINI_API_KEY=your_gemini_api_key_here
  PORT=5000
  ```
- [`frontend/.ev`](file:///c:/Users/S%20P%20K/Antigravity/frontend/.ev):
  ```env
  SUPABASE_URL=https://your-project-id.supabase.co
  SUPABASE_ANON_KEY=your-supabase-anon-key-here
  BACKEND_URL=http://localhost:5000
  ```

*(You can also configure or test Supabase directly in the web UI Settings Modal via the "Test Supabase Connection" button).*

---

## ✨ Features

- ⚡ **Real-Time Token Streaming**: Server-Sent Events (SSE) streaming for instantaneous responses.
- 🧠 **Conversational Memory**: Maintains multi-turn context throughout the conversation.
- 🎨 **Obsidian Glassmorphism Aesthetic**: Dark UI with radiant gradients, ambient glow, and micro-animations.
- 🛠️ **Model Selection**: Switch between `gemini-2.5-flash`, `gemini-2.5-pro`, `gemini-1.5-flash`, and `gemini-1.5-pro`.
- 🎭 **Custom Personas**: Switch between **Default Assistant**, **Senior Full-Stack Engineer**, **Concise Explainer**, **Socratic Tutor**, and **Creative Strategist**.
- 🎚️ **Creativity Slider**: Dynamic temperature adjustment (0.0 to 1.5).
- 📝 **Markdown & Code Highlighting**: Syntax highlighting for code blocks with one-click "Copy Code".
- 💾 **Local Session History**: Auto-saves conversations to `localStorage`, with support for creating, switching, and deleting chats.
- 📤 **Export Chat**: Download any chat session as clean GitHub-flavored Markdown (`.md`).
- 🔑 **Flexible API Key Configuration**: Provide your key either via `backend/.env` or dynamically in the Web UI modal without restarting the server.

---

## 🚀 Quick Start Guide

### 1. Prerequisites
- **Node.js**: v18+ (tested on Node v24)
- **Gemini API Key**: Free key from [Google AI Studio](https://aistudio.google.com/app/apikey).

### 2. Configure Your API Key
Open [backend/.env](file:///c:/Users/S%20P%20K/Antigravity/backend/.env) and insert your Gemini API Key:
```env
GEMINI_API_KEY=your_actual_gemini_api_key_here
PORT=5000
DEFAULT_MODEL=gemini-2.5-flash
```
*(Alternatively, you can leave it blank and enter your API key directly through the settings dialog in the web interface).*

### 3. Start the Server
From the workspace root, run:
```powershell
node backend/server.js
```
or using npm:
```powershell
npm.cmd start
```

### 4. Open the Web Application
Open your browser and navigate to:
```
http://localhost:5000
```

---

## 📡 Backend API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Checks server health and whether `GEMINI_API_KEY` is configured. |
| `GET` | `/api/models` | Lists supported Gemini models with descriptions. |
| `POST` | `/api/chat` | Non-streaming chat completion with multi-turn conversation history. |
| `POST` | `/api/chat/stream` | Server-Sent Events (SSE) streaming chat completion for live tokens. |
| `GET` | `/*` | Serves the static frontend single-page application. |

---

## ⌨️ Keyboard Shortcuts
- **Send Message**: `Enter`
- **New Line**: `Shift + Enter`
- **New Conversation**: `Ctrl + K` or `Cmd + K`
