# 🎬 RecordX

**Chrome Extension Screen Recorder** featuring high-fidelity system audio capture, microphone recording, live offscreen transcription, a standalone floating popup, and a designer-grade Minutes of Meeting (MoM) editorial board with AI generation and premium PDF/MD export.

![RecordX](src/assets/logo.svg)

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🖥️ **Screen Recording** | Record entire screens, specific windows, or browser tabs in high-quality WebM. |
| 🔊 **Hi-Fi System Audio** | Crisp system audio capture with echo cancellation & noise suppression disabled specifically for system tracks to avoid muffled audio. |
| 🎙️ **Microphone Capture** | Capture your microphone voice simultaneously with Web Audio API mixing. |
| 📌 **Persistent Floating Window** | Popup opens as a standalone floating OS window that **never auto-closes** on focus loss, letting you easily pause/resume/stop and monitor transcripts. |
| 📝 **Offscreen Transcription** | Stable real-time transcription using the Web Speech API delegated to an Offscreen Document, preserving transcription across popup closures. |
| 📋 **Luxury MoM Editor** | Structured meeting notes featuring agenda topic cards, inline decision lists, draggable action item tables, and collapsible raw transcripts. |
| 🔲 **Designer Monochrome Theme** | Stunning, corporate-ready minimalist black-and-white theme featuring deep obsidian glass, crisp white actions, and elegant metallic gradients. |
| 📄 **High-Fidelity PDF & MD Export** | Export beautifully designed MoMs to Markdown, or save directly as PDF using custom `@media print` style sheets that strip interactive controls for standard publication-grade prints. |
| ⚡ **IndexedDB Sharing** | Zero-copy binary sharing between pages and the service worker via IndexedDB, solving extension messaging size limits and 0-byte file upload issues. |
| 🔐 **Google OAuth** | Secure, background-delegated Google sign-in using Supabase PKCE flow. |
| ☁️ **Supabase Cloud Storage** | Automatic background uploads to Supabase Storage with metadata tracked in a PostgreSQL database. |

## 🏗️ Architecture

```
                 [ Floating Popup UI ]
                           │
             (Runtime Message - State Sync)
                           │
                           ▼
                  [ Service Worker ]
                           │
             (Create & Orchestrate Stream)
                           │
                           ▼
                 [ Offscreen Document ]
               ┌───────────┴───────────┐
               ▼                       ▼
      [ MediaRecorder ]        [ Web Speech API ]
      (Audio Context)         (Mic Transcribing)
               │                       │
               ▼                       ▼
      [ Write IndexedDB ]     [ Stream Segment ]
      (Zero-Copy Blob)        (Real-time Text)
```

- **Manifest V3 Specification** with background service worker life-cycle orchestration.
- **Persistent Offscreen Document** keeping transcription and recording threads alive across popup open/close states.
- **Web Audio API mixing engine** combining display streams and microphone input.
- **Tus-based Supabase Chunked Storage Uploader** for unlimited recording sizes.

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- npm or pnpm
- A [Supabase](https://supabase.com) project with a PostgreSQL database and a storage bucket
- Google Cloud Console credentials
- OpenAI API key for AI MoM generation

### 1. Install Dependencies

```bash
cd RecordX
npm install
```

### 2. Configure Environment

Create a `.env` file in the root directory:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_OPENAI_API_KEY=your-openai-key  # Required for AI MoM generation
```

### 3. Set Up Supabase

1. Open the Supabase dashboard.
2. Go to the **SQL Editor** and run the query in `supabase/schema.sql` to generate database tables, schemas, and Row Level Security (RLS) policies.
3. Create a **Storage Bucket** named `recordings` with public access (or customized RLS).
4. Go to **Authentication > URL Configuration > Redirects** and add your unique extension callback URL:
   ```
   https://<your-extension-id>.chromiumapp.org/
   ```
5. Enable **Google** as an Authentication Provider under **Authentication > Providers**.

### 4. Configure Google Cloud Console

1. Navigate to the [Google Cloud Console](https://console.cloud.google.com).
2. Create a new OAuth 2.0 Web Client credential.
3. Add the Supabase Auth callback URL to the authorized redirect URIs.
4. Input the Client ID and Client Secret into the Supabase Google authentication settings.

### 5. Build the Extension

```bash
# Compile for production
npm run build
```

This compiles your extension code and packages it into the `/dist` directory.

### 6. Load in Chrome

1. Open **Google Chrome** and navigate to `chrome://extensions/`.
2. Enable **Developer mode** (toggle in the top-right corner).
3. Click **Load unpacked** in the top-left corner.
4. Select the `dist/` directory inside the project folder.
5. Pin **RecordX** to your browser toolbar!

---

## 📖 Recording Modes

| Mode | Screen | Microphone | System Audio | Transcription | Audio Treatment |
|------|:------:|:----------:|:------------:|:-------------:|:----------------|
| **Screen Only** | ✅ | ❌ | ❌ | ❌ | - |
| **Screen + Mic** | ✅ | ✅ | ❌ | ✅ | Mic only |
| **Screen + Mic + System** | ✅ | ✅ | ✅ | ✅ | mixed streams, no system DSP |
| **Screen + System** | ✅ | ❌ | ✅ | ❌ | No system DSP (unmuffled) |

> **Echo Cancellation & Noise Suppression Warning:** Standard display capture audio can sound muffled because Chrome applies microphone filters by default. RecordX disables echo cancellation and auto gain control on system captures, guaranteeing crystal-clear program sounds.

---

## 📁 Project Structure

```
RecordX/
├── manifest.json            # Chrome MV3 manifest
├── vite.config.js           # Vite compile configuration with CRXJS
├── package.json             # Core dependency packages
├── .env.example             # Env variables template
├── src/
│   ├── background/
│   │   └── service-worker.js # Main background orchestration and Auth Flow
│   ├── offscreen/
│   │   ├── offscreen.html
│   │   └── offscreen.js      # Web Audio mixer & MediaRecorder engine
│   ├── popup/
│   │   ├── popup.html
│   │   ├── popup.css         # Glassmorphism dark-mode popup
│   │   └── popup.js          # Recording control dashboard
│   ├── pages/
│   │   ├── history.html / js / css  # Sleek monochrome recordings history board
│   │   └── mom.html / js / css      # Luxury monochrome editorial MoM board
│   ├── lib/
│   │   ├── auth.js          # Background PKCE sign-in
│   │   ├── database.js      # Recording / Transcript / MoM database queries
│   │   ├── storage.js       # Signed URL generation and file uploading
│   │   ├── recorder.js      # Orchestrated State Machine
│   │   ├── transcriber.js   # Offscreen speech recognizing
│   │   └── mom-generator.js # OpenAI prompt engineering
│   ├── utils/
│   │   ├── constants.js
│   │   └── helpers.js       # IndexedDB helpers & visual formatting
│   └── assets/
│       ├── logo.svg
│       └── icons/           # Required size resolutions (16, 32, 48, 128)
└── supabase/
    └── schema.sql           # Complete schema setup & RLS guidelines
```

---

## 📄 License

MIT License.
