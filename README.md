# PiazzaLens — AI Insights for Piazza

> 🚀 **Chrome Extension that enhances Piazza** with AI-powered insights for professors and students.

![PiazzaLens](extension/icons/icon128.png)

## Features

### 👨‍🏫 Professor Dashboard
- **Most Common Questions** — AI-clustered question topics with suggested lecture actions
- **Confusion Heatmap** — Visual breakdown of which lecture topics generate most confusion
- **Course Health Score** — Composite engagement score with breakdown metrics
- **At-Risk Student Detection** — Flags struggling students with AI-drafted outreach emails

### 🎓 Student Features  
- **Duplicate Question Prevention** — Search existing posts before asking
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

### Project Structure

```
PiazzaLens/
├── extension/           # Chrome Extension (Manifest V3)
│   ├── manifest.json    # Extension configuration
│   ├── background.js    # Service worker (API routing, state)
│   ├── content.js       # Content script (sidebar injection)
│   ├── content_inject.css # Styles for injected elements
│   ├── popup.html/js    # Extension popup UI
│   ├── dashboard.html   # Main dashboard (sidebar)
│   ├── dashboard.js     # Dashboard logic & rendering
│   ├── dashboard.css    # Dashboard styles (dark mode)
│   ├── mock_data.js     # Realistic mock data (50 posts)
│   └── icons/           # Extension icons
│
├── aws/                 # AWS Backend
│   ├── template.yaml    # SAM template (API Gateway + Lambda + DynamoDB)
│   └── lambda_functions/
│       ├── cluster_questions.py   # Bedrock-powered question clustering
│       ├── detect_confusion.py    # Lecture confusion scoring
│       ├── generate_email.py      # AI email drafts
│       ├── course_health.py       # Course health computation
│       └── semantic_search.py     # Embedding-based similarity search
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
│              └──────────┬───────────────────────│
└─────────────────────────┼───────────────────────┘
                          │ HTTPS
             ┌────────────▼────────────┐
             │   AWS API Gateway       │
             │   5 endpoints           │
             └────────────┬────────────┘
                          │
             ┌────────────▼────────────┐
             │   AWS Lambda (Python)   │
             └──┬──────────┬───────┬───┘
                │          │       │
          ┌─────▼──┐ ┌────▼──┐ ┌──▼─────────┐
          │DynamoDB │ │Bedrock│ │Titan Embed │
          └────────┘ └───────┘ └────────────┘
```

---

## AWS Deployment (Optional)

The extension works fully offline with mock data. To deploy the backend:

### Prerequisites
- [AWS CLI](https://aws.amazon.com/cli/) configured
- [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html)
- Amazon Bedrock model access enabled (Claude 3 Haiku + Titan Embed)

### Deploy

```bash
cd aws
sam build
sam deploy --guided
```

After deployment, copy the API Gateway URL and update `extension/background.js`:

```javascript
const CONFIG = {
  API_BASE_URL: "https://YOUR-API-ID.execute-api.us-east-1.amazonaws.com/prod",
  USE_MOCK: false,
  ...
};
```

---

## API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/cluster-questions` | POST | Clusters questions into topics using Bedrock |
| `/detect-confusion` | POST | Calculates per-lecture confusion scores |
| `/generate-email` | POST | Generates personalized outreach emails |
| `/course-health` | POST | Computes course engagement health score |
| `/semantic-search` | POST | Finds similar questions via embeddings |

---

## Hackathon MVP Notes

### What's Real
- ✅ Full Chrome Extension with Manifest V3
- ✅ Injected sidebar dashboard with glassmorphism UI
- ✅ Deployable AWS Lambda functions with Bedrock integration
- ✅ 50 realistic mock posts with pre-computed analytics

### What's Simulated
- 📋 Piazza post data (mock dataset — real integration would use Piazza API)
- 📋 Student risk scores (computed from mock activity patterns)
- 📋 Semantic search (keyword fallback when Bedrock not available)

---

## Tech Stack

| Component | Technology |
|---|---|
| Extension | Chrome Manifest V3, Vanilla JS |
| UI | CSS (dark glassmorphism), SVG gauges |
| Backend | AWS Lambda (Python 3.12) |
| AI/NLP | Amazon Bedrock (Claude 3 Haiku) |
| Embeddings | Amazon Titan Embed |
| Database | Amazon DynamoDB |
| IaC | AWS SAM |

---

## License

MIT — Built for hackathon use.