# PiazzaLens — AI Insights for Piazza

> Chrome Extension that enhances Piazza with AI-powered insights for professors and students.

![PiazzaLens](extension/icons/icon128.png)

## Features

### Professor Dashboard
- **Most Common Questions** — AI-clustered question topics with suggested lecture actions
- **Confusion Heatmap** — Visual breakdown of which lecture topics generate most confusion
- **Course Health Score** — Composite engagement score with breakdown metrics
- **At-Risk Student Detection** — Flags struggling students with AI-drafted outreach emails

### Student Features
- **Duplicate Question Prevention** — AI-powered semantic search of existing posts before asking
- **Social Validation** — See how many students asked similar questions ("You're not alone!")
- **Study Insights** — Trending topics and study tips based on course activity

---

## Quick Start

### Load the Chrome Extension

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right)
3. Click **Load unpacked**
4. Select the `extension/` folder from this project
5. Click the PiazzaLens icon in your toolbar, or navigate to any Piazza page

### Enable AI Features (Optional)

The extension works fully offline with local analytics. To enable GPT-4o mini powered features:

1. Open the PiazzaLens dashboard sidebar on any Piazza page
2. Click the **Settings** gear icon in the footer
3. Enter your **OpenAI API key**
4. Click **Save Key**

AI-powered features include: question clustering, AI insights, personalized email drafting, and semantic search. Without a key, all features use local computation fallbacks.

### Project Structure

```
PiazzaLens/
├── extension/           # Chrome Extension (Manifest V3)
│   ├── manifest.json    # Extension configuration
│   ├── background.js    # Service worker (state management)
│   ├── content.js       # Content script (sidebar injection)
│   ├── content_inject.css # Styles for injected elements
│   ├── popup.html/js    # Extension popup UI
│   ├── dashboard.html   # Main dashboard (sidebar)
│   ├── dashboard.js     # Dashboard logic, rendering, & OpenAI integration
│   ├── dashboard.css    # Dashboard styles (dark mode)
│   ├── mock_data.js     # Realistic mock data (50 posts)
│   ├── piazza_api.js    # Piazza RPC API client
│   └── icons/           # Extension icons
│
└── README.md
```

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│               CHROME BROWSER                    │
│  ┌─────────┐  ┌──────────┐  ┌──────────────┐  │
│  │ Popup   │  │Content.js│  │  Dashboard   │  │
│  │ (quick  │  │(inject   │  │  (sidebar    │  │
│  │ controls)│  │ sidebar) │  │   iframe)    │  │
│  └─────────┘  └────┬─────┘  └──────┬───────┘  │
│                     │               │           │
│              ┌──────┴───────────────┘           │
│              │ background.js (Service Worker)   │
│              └──────────────────────────────────│
│                                                 │
│              ┌──────────────────────────────┐   │
│              │ OpenAI API (optional)        │   │
│              │ GPT-4o mini for AI features  │   │
│              └──────────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

All analytics run locally in the browser. When an OpenAI API key is configured, AI-powered features (clustering, insights, email drafting, semantic search) enhance the local results.

---

## Tech Stack

| Component | Technology |
|---|---|
| Extension | Chrome Manifest V3, Vanilla JS |
| UI | CSS (dark glassmorphism), SVG gauges |
| AI (optional) | OpenAI GPT-4o mini |
| Data extraction | Piazza RPC API + DOM scraping fallback |
| Storage | Chrome local storage |

---

## License

MIT — Built for HackMIT 2026.
