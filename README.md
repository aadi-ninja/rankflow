# RankFlow

A two-part tool for ranking-niche YouTube Shorts creators: a **website** for finding trending topics and downloading clips, and a **Chrome extension** for saving clips while browsing.

---

## Quick Start

### 1. Setup Supabase

1. Create a free project at [supabase.com](https://supabase.com)
2. Go to the **SQL Editor** and run the contents of `supabase-schema.sql`
3. Copy your project URL and anon key from **Settings → API**

### 2. Setup the Website

```bash
cd web
cp .env.local.example .env.local   # or edit .env.local directly
# Fill in your Supabase URL and anon key
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### 3. Setup the Extension

1. Open `extension/background.js` and replace `YOUR_SUPABASE_URL` and `YOUR_SUPABASE_ANON_KEY` with your actual values
2. Add icon images (16×16, 48×48, 128×128 PNG) to `extension/icons/`
3. Open Chrome → `chrome://extensions` → Enable **Developer mode**
4. Click **Load unpacked** → select the `extension/` folder

---

## Project Structure

```
Rankflow/
├── web/                          # Next.js website
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.js           # Main page (server wrapper)
│   │   │   ├── layout.js         # Root layout with Inter font
│   │   │   ├── globals.css       # Design system + animations
│   │   │   └── api/download/     # Video download proxy
│   │   ├── components/
│   │   │   ├── HomePage.js       # Tab navigation (client)
│   │   │   ├── IdeaFinder.js     # YouTube API search + trends
│   │   │   └── ClipDownloader.js # Session list + downloads
│   │   └── lib/
│   │       └── supabase.js       # Supabase client
│   └── .env.local                # Environment variables
│
├── extension/                    # Chrome Extension (Manifest V3)
│   ├── manifest.json
│   ├── background.js             # Session + clip management
│   ├── popup.html / popup.js     # Extension popup UI
│   ├── content-youtube.js        # YouTube content script
│   ├── content-tiktok.js         # TikTok content script
│   ├── content-instagram.js      # Instagram content script
│   ├── content-styles.css        # Shared injected styles
│   └── icons/                    # Extension icons
│
└── supabase-schema.sql           # Database setup script
```

---

## How It Works

1. **Idea Finder** — Paste your YouTube Data API key, pick a time filter, and find viral ranking topics. Videos are filtered by view thresholds and sorted by View Velocity (views per hour). Topics shared by 2+ channels are flagged as Trend Waves.

2. **Chrome Extension** — Create a session, browse TikTok/YouTube/Instagram, and save clips with one click. The extension injects Save Clip buttons directly onto video cards and provides a Sort by Views toolbar.

3. **Clip Downloader** — All sessions from the extension appear here. Click Download All to download clips sequentially to your Downloads folder.
