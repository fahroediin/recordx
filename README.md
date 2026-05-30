# 🎬 RecordX

**Chrome Extension Screen Recorder** with system audio capture, microphone recording, live transcription, and AI-powered Minutes of Meeting generator.

![RecordX](src/assets/logo.svg)

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🖥️ **Screen Recording** | Record your screen with high-quality video |
| 🎙️ **Microphone Capture** | Record your voice alongside screen capture |
| 🔊 **System Audio** | Capture system/tab audio |
| 🎛️ **Mixed Audio** | Record both mic and system audio simultaneously |
| 📝 **Live Transcription** | Real-time speech-to-text using Web Speech API |
| 📋 **Minutes of Meeting** | AI-generated meeting notes from transcripts |
| 🔐 **Google OAuth** | Secure authentication via Supabase |
| ☁️ **Cloud Storage** | Recordings saved to Supabase Storage |
| 📜 **Recording History** | Browse, play, and manage past recordings |

## 🏗️ Architecture

```
Popup UI ←→ Service Worker ←→ Offscreen Document
   ↓              ↓                    ↓
Auth Flow    Orchestration     MediaRecorder
   ↓              ↓              Web Audio API
Supabase     Chrome APIs      Audio Mixing
```

- **Manifest V3** with service worker
- **Offscreen Document** for media recording (DOM-dependent APIs)
- **Web Audio API** for mixing multiple audio streams
- **PKCE OAuth** flow via `chrome.identity.launchWebAuthFlow`

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- npm or pnpm
- A [Supabase](https://supabase.com) project
- Google Cloud Console OAuth credentials
- (Optional) OpenAI API key for MoM AI generation

### 1. Install Dependencies

```bash
cd RecordX
npm install
```

### 2. Configure Environment

Copy the example env file and fill in your credentials:

```bash
cp .env.example .env
```

Edit `.env`:
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_OPENAI_API_KEY=your-openai-key  # Optional
```

### 3. Set Up Supabase

1. Go to your Supabase project dashboard
2. Open the **SQL Editor**
3. Run the SQL from `supabase/schema.sql` to create tables and policies
4. Create a **Storage bucket** named `recordings`
5. Go to **Authentication > URL Configuration** and add your extension's redirect URL:
   ```
   https://<your-extension-id>.chromiumapp.org/
   ```
6. Enable **Google** provider under **Authentication > Providers**

### 4. Set Up Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create OAuth 2.0 credentials
3. Add the Supabase callback URL as an authorized redirect URI
4. Copy the Client ID to your Supabase Google provider settings

### 5. Build the Extension

```bash
npm run build
```

### 6. Load in Chrome

1. Open `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `dist` folder

### 7. Development Mode

For development with hot reload:

```bash
npm run dev
```

Then load the extension from the generated `dist` directory.

## 📖 Recording Modes

| Mode | Screen | Microphone | System Audio | Transcription |
|------|:------:|:----------:|:------------:|:-------------:|
| Screen Only | ✅ | ❌ | ❌ | ❌ |
| Screen + Mic | ✅ | ✅ | ❌ | ✅ |
| Screen + Mic + System | ✅ | ✅ | ✅ | ✅ |
| Screen + System | ✅ | ❌ | ✅ | ❌ |

> **Note:** Transcription is only available for modes that include microphone input, as Web Speech API requires mic access.

## 📁 Project Structure

```
RecordX/
├── manifest.json           # Chrome Extension Manifest V3
├── vite.config.js          # Build configuration
├── package.json
├── .env.example
├── src/
│   ├── background/         # Service worker (orchestration)
│   ├── offscreen/          # Offscreen doc (MediaRecorder)
│   ├── popup/              # Extension popup UI
│   ├── pages/              # Full-page views (history, MoM)
│   ├── lib/                # Core modules
│   │   ├── supabase.js     # Supabase client
│   │   ├── auth.js         # OAuth flow
│   │   ├── storage.js      # File upload/download
│   │   ├── database.js     # DB operations
│   │   ├── recorder.js     # State machine
│   │   ├── transcriber.js  # Speech-to-text
│   │   └── mom-generator.js # MoM AI generation
│   ├── utils/              # Constants & helpers
│   └── assets/             # Icons & logo
└── supabase/
    └── schema.sql          # Database schema
```

## ⚠️ Known Limitations

- **System audio capture** depends on OS support (Windows/ChromeOS best supported)
- **Web Speech API** requires internet connection and only works with microphone input
- **Transcription accuracy** varies by language and audio quality
- **Large recordings** (>50MB) may take time to upload

## 📄 License

MIT
# recordx
