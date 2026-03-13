// ============================================================
// PiazzaLens — Background Service Worker
// Handles API routing, message passing, and state management
// ============================================================

// ---- Configuration ----
// After running `sam deploy` in aws/, paste the ApiUrl output below and set USE_MOCK to false.
// Example: API_BASE_URL: "https://abc123.execute-api.us-east-1.amazonaws.com/prod"
const CONFIG = {
  API_BASE_URL: "",
  USE_MOCK: true,
  DEFAULT_ROLE: "professor",
  DEFAULT_THEME: "dark"
};
const CACHE_TTL_MS = 15 * 60 * 1000;
const PIAZZA_CACHE_PREFIX = "piazzaCache:";

// ---- State ----
let userRole = CONFIG.DEFAULT_ROLE;

// ---- Initialize ----
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(["userRole", "useMock", "apiBaseUrl", "dashboardOpen", "theme"], (data) => {
    chrome.storage.local.set({
      userRole: data.userRole || CONFIG.DEFAULT_ROLE,
      useMock: data.useMock ?? CONFIG.USE_MOCK,
      apiBaseUrl: data.apiBaseUrl ?? CONFIG.API_BASE_URL,
      dashboardOpen: data.dashboardOpen ?? false,
      theme: data.theme || CONFIG.DEFAULT_THEME
    });
  });
  console.log("[PiazzaLens] Extension installed. Role:", CONFIG.DEFAULT_ROLE, "Theme:", CONFIG.DEFAULT_THEME);
});

// ---- Message Handler ----
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { action, payload } = message;

  switch (action) {
    case "GET_ROLE":
      chrome.storage.local.get("userRole", (data) => {
        sendResponse({ role: data.userRole || CONFIG.DEFAULT_ROLE });
      });
      return true; // async response

    case "SET_ROLE":
      userRole = payload.role;
      chrome.storage.local.set({ userRole: payload.role });
      // Notify all tabs of role change
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach((tab) => {
          chrome.tabs.sendMessage(tab.id, {
            action: "ROLE_CHANGED",
            payload: { role: payload.role }
          }).catch(() => {}); // ignore tabs that can't receive
        });
      });
      sendResponse({ success: true, role: payload.role });
      return true;

    case "API_REQUEST":
      handleApiRequest(payload)
        .then((result) => sendResponse({ success: true, data: result }))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true; // async response

    case "TOGGLE_DASHBOARD":
      chrome.storage.local.get("dashboardOpen", (data) => {
        const newState = !data.dashboardOpen;
        chrome.storage.local.set({ dashboardOpen: newState });
        // Notify content script
        if (sender.tab) {
          chrome.tabs.sendMessage(sender.tab.id, {
            action: "SET_DASHBOARD_STATE",
            payload: { open: newState }
          });
        }
        sendResponse({ open: newState });
      });
      return true;

    case "GENERATE_EMAIL":
      handleGenerateEmail(payload)
        .then((result) => sendResponse({ success: true, data: result }))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true;

    case "EXPORT_PIAZZA_DATA":
      handleExportPiazzaData(payload)
        .then((result) => sendResponse({ success: true, data: result }))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true;

    case "GET_CACHED_PIAZZA_DATA":
      handleGetCachedPiazzaData(payload)
        .then((result) => sendResponse({ success: true, data: result }))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true;

    case "INVALIDATE_PIAZZA_CACHE":
      invalidateCache(payload?.networkId)
        .then(() => sendResponse({ success: true }))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true;

    default:
      sendResponse({ success: false, error: "Unknown action: " + action });
      return false;
  }
});

// ---- API Request Handler ----
async function handleApiRequest(payload) {
  const { endpoint, data } = payload;

  // Check if we should use mock
  const config = await chrome.storage.local.get(["useMock", "apiBaseUrl"]);

  if (config.useMock || !config.apiBaseUrl) {
    return getMockResponse(endpoint, data);
  }

  // Real API call
  try {
    const response = await fetch(`${config.apiBaseUrl}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    return await response.json();
  } catch (err) {
    console.warn("[PiazzaLens] API call failed, falling back to mock:", err);
    return getMockResponse(endpoint, data);
  }
}

// ---- Mock Response Generator ----
function getMockResponse(endpoint, data) {
  // These mirror the Lambda function responses
  switch (endpoint) {
    case "/cluster-questions":
      return {
        clusters: [
          {
            topic: "Gradient Descent & Optimization",
            count: 17,
            exampleQuestions: [
              "How does gradient descent converge?",
              "Learning rate too high — diverging",
              "Why does larger batch size sometimes hurt generalization?"
            ],
            suggestedAction: "Review gradient descent convergence theory with visual animations. Provide a learning rate selection guide.",
            severity: "high"
          },
          {
            topic: "Neural Network Architecture & Training",
            count: 14,
            exampleQuestions: [
              "How many hidden layers to use?",
              "Vanishing gradient problem",
              "Batch normalization explanation"
            ],
            suggestedAction: "Dedicate lecture time to practical architecture decisions with side-by-side training curves.",
            severity: "high"
          },
          {
            topic: "Backpropagation & Chain Rule",
            count: 11,
            exampleQuestions: [
              "Backpropagation chain rule step-by-step",
              "Derivative step in backprop"
            ],
            suggestedAction: "Walk through backprop on whiteboard with numerical example.",
            severity: "medium"
          },
          {
            topic: "Model Selection & Comparison",
            count: 9,
            exampleQuestions: [
              "SVM vs logistic regression",
              "K-means vs DBSCAN"
            ],
            suggestedAction: "Create comparison table handout with decision flowchart.",
            severity: "medium"
          },
          {
            topic: "Attention & Transformers",
            count: 8,
            exampleQuestions: [
              "Attention mechanism intuition",
              "BERT vs GPT architecture"
            ],
            suggestedAction: "Use animated visualization of attention weights in lecture.",
            severity: "high"
          }
        ]
      };

    case "/detect-confusion":
      return {
        lectures: [
          { lecture: 1, title: "Linear Regression", confusionScore: 34, posts: 6, unresolvedPosts: 1 },
          { lecture: 2, title: "Logistic Regression", confusionScore: 28, posts: 5, unresolvedPosts: 1 },
          { lecture: 3, title: "Neural Networks", confusionScore: 78, posts: 7, unresolvedPosts: 2 },
          { lecture: 4, title: "SVMs", confusionScore: 42, posts: 4, unresolvedPosts: 2 },
          { lecture: 5, title: "Clustering", confusionScore: 56, posts: 7, unresolvedPosts: 2 },
          { lecture: 6, title: "Deep Learning / CNNs", confusionScore: 65, posts: 6, unresolvedPosts: 2 },
          { lecture: 7, title: "NLP / Transformers", confusionScore: 71, posts: 5, unresolvedPosts: 2 },
          { lecture: 8, title: "Reinforcement Learning", confusionScore: 31, posts: 3, unresolvedPosts: 2 }
        ]
      };

    case "/course-health":
      return {
        score: 82,
        breakdown: {
          engagement: { score: 88, label: "High", detail: "187 students, 156 active on Piazza" },
          responseTime: { score: 79, label: "Good", detail: "Average response time: 2.3 hours" },
          resolution: { score: 74, label: "Needs Attention", detail: "14 unresolved posts (28%)" },
          participation: { score: 85, label: "High", detail: "83% of students have posted or commented" }
        },
        insights: [
          "Engagement is high — 83% student participation rate",
          "14 unresolved posts need attention, mostly in Lectures 3, 5, and 7",
          "Response time has increased from 1.8h to 2.3h this week",
          "Neural Networks (Lecture 3) has the highest confusion score"
        ],
        trend: [
          { week: "Week 1", score: 90 },
          { week: "Week 2", score: 87 },
          { week: "Week 3", score: 85 },
          { week: "Week 4", score: 82 },
          { week: "Week 5", score: 78 },
          { week: "Week 6", score: 82 }
        ]
      };

    case "/semantic-search":
      const query = (data?.query || "").toLowerCase();
      // Simple keyword matching for mock
      const keywords = ["gradient descent", "neural network", "backpropagation", "attention", "clustering", "overfitting"];
      const matched = keywords.find(k => query.includes(k)) || "gradient descent";
      return {
        query: data?.query,
        results: [
          { id: 2, title: "How does gradient descent converge?", similarity: 0.94, excerpt: "I understand the formula but I'm confused about when it converges..." },
          { id: 5, title: "Learning rate too high", similarity: 0.89, excerpt: "My gradient descent is diverging. How do I choose the right learning rate?" },
          { id: 3, title: "Normal equation vs gradient descent?", similarity: 0.82, excerpt: "When should we use the normal equation versus gradient descent?" }
        ],
        similarCount: 14
      };

    case "/generate-email":
      const student = data?.studentName || "Student";
      const topics = data?.topics || ["recent topics"];
      return {
        email: `Subject: Checking in about the course\n\nHi ${student},\n\nI noticed you've had several questions recently about ${topics.join(" and ")}. That's completely normal — these are challenging topics that many students find tricky.\n\nIf you'd like, we can schedule a quick 15-minute meeting to go over any concepts you're finding difficult. I'm available during office hours, or we can find another time that works for you.\n\nDon't hesitate to reach out — I'm here to help.\n\nBest,\nProf. Smith`
      };

    case "/score-students":
      return {
        students: [
          { name: "Alex T.", postsCount: 9, confusionSignals: 7, assignmentsSubmitted: 2, assignmentsTotal: 3, riskScore: 85, riskLevel: "high", topics: ["backpropagation", "attention", "kernel-trick"] },
          { name: "Jordan M.", postsCount: 6, confusionSignals: 4, assignmentsSubmitted: 3, assignmentsTotal: 3, riskScore: 52, riskLevel: "medium", topics: ["multiclass", "vanishing-gradient"] },
          { name: "Priya R.", postsCount: 5, confusionSignals: 3, assignmentsSubmitted: 2, assignmentsTotal: 3, riskScore: 48, riskLevel: "medium", topics: ["regularization", "feature-scaling"] },
          { name: "Chris L.", postsCount: 4, confusionSignals: 2, assignmentsSubmitted: 2, assignmentsTotal: 3, riskScore: 42, riskLevel: "medium", topics: ["learning-rate", "dropout"] }
        ]
      };

    default:
      return { error: "Unknown endpoint" };
  }
}

// ---- Email Generation ----
async function handleGenerateEmail(payload) {
  const { studentName, topics, type } = payload;
  return getMockResponse("/generate-email", { studentName, topics, type });
}

// ---- Piazza Export ----
async function handleExportPiazzaData(payload) {
  const tabId = payload?.tabId;
  if (!tabId) {
    throw new Error("Missing tab id for export");
  }

  const tab = await chrome.tabs.get(tabId);
  const networkId = payload?.networkId || deriveNetworkIdFromUrl(tab?.url || "");
  const cached = networkId ? await getCachedData(networkId) : null;

  if (cached?.fresh && cached.entry?.result?.response) {
    if (cached.entry.result.lastPiazzaExport) {
      await chrome.storage.local.set({ lastPiazzaExport: cached.entry.result.lastPiazzaExport });
    }

    return {
      ...cached.entry.result.response,
      fromCache: true,
      cachedAt: new Date(cached.entry.fetchedAt).toISOString(),
      cacheAgeMs: cached.ageMs
    };
  }

  const extraction = await chrome.tabs.sendMessage(tabId, {
    action: "EXTRACT_PIAZZA_DATA"
  });

  if (!extraction?.success) {
    throw new Error(extraction?.error || "Unable to extract Piazza data from the page");
  }

  const exportPayload = extraction.data;
  const summary = {
    postCount: exportPayload.posts?.length || 0,
    studentCount: exportPayload.students?.length || 0,
    pageType: exportPayload.page?.type || "unknown",
    courseName: exportPayload.course?.name || "Unknown course",
    extractedAt: exportPayload.extractedAt,
    extractionMode: exportPayload.extractionMode || "visible-dom-v1",
    warnings: exportPayload.warnings || []
  };

  const persisted = await persistPiazzaExport(exportPayload, summary);
  const cacheNetworkId = exportPayload.course?.networkId || networkId;

  if (cacheNetworkId) {
    await setCachedData(cacheNetworkId, {
      fetchedAt: persisted.lastPiazzaExport.fetchedAt,
      payload: exportPayload,
      summary,
      result: persisted
    });
  }

  return {
    ...persisted.response,
    fromCache: false,
    cachedAt: new Date(persisted.lastPiazzaExport.fetchedAt).toISOString()
  };
}

async function handleGetCachedPiazzaData(payload) {
  const networkId = payload?.networkId;

  if (networkId) {
    const cached = await getCachedData(networkId);
    if (!cached) {
      return null;
    }

    return {
      entry: cached.entry,
      fresh: cached.fresh,
      ageMs: cached.ageMs
    };
  }

  const data = await chrome.storage.local.get(["lastPiazzaExport"]);
  return data.lastPiazzaExport ? { entry: data.lastPiazzaExport, fresh: false, ageMs: null } : null;
}

async function persistPiazzaExport(exportPayload, summary) {
  const config = await chrome.storage.local.get(["apiBaseUrl"]);
  const apiBaseUrl = config.apiBaseUrl;
  const fetchedAt = Date.now();

  if (!apiBaseUrl) {
    const response = {
      uploaded: false,
      storedLocally: true,
      summary,
      warning: "API base URL is not configured; export kept in local extension storage"
    };
    const lastPiazzaExport = {
      ...response,
      payload: exportPayload,
      fetchedAt
    };

    await chrome.storage.local.set({
      lastPiazzaExport
    });

    return { response, lastPiazzaExport };
  }

  const response = await fetch(`${apiBaseUrl}/ingest-export`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(exportPayload)
  });

  if (!response.ok) {
    throw new Error(`Export upload failed with status ${response.status}`);
  }

  const ingestResult = await response.json();
  const resultResponse = {
    uploaded: true,
    storedLocally: false,
    summary,
    ingestResult
  };
  const lastPiazzaExport = {
    ...resultResponse,
    payload: exportPayload,
    fetchedAt
  };

  await chrome.storage.local.set({
    lastPiazzaExport
  });

  return { response: resultResponse, lastPiazzaExport };
}

async function getCachedData(networkId) {
  const cacheKey = getPiazzaCacheKey(networkId);
  if (!cacheKey) {
    return null;
  }

  const cached = await chrome.storage.local.get([cacheKey]);
  const entry = cached[cacheKey];
  if (!entry) {
    return null;
  }

  const ageMs = Date.now() - Number(entry.fetchedAt || 0);
  return {
    entry,
    ageMs,
    fresh: ageMs <= CACHE_TTL_MS
  };
}

function setCachedData(networkId, value) {
  const cacheKey = getPiazzaCacheKey(networkId);
  if (!cacheKey) {
    return Promise.resolve();
  }
  return chrome.storage.local.set({ [cacheKey]: value });
}

async function invalidateCache(networkId) {
  if (networkId) {
    await chrome.storage.local.remove([getPiazzaCacheKey(networkId)]);
    return;
  }

  const allData = await chrome.storage.local.get(null);
  const cacheKeys = Object.keys(allData).filter((key) => key.startsWith(PIAZZA_CACHE_PREFIX));
  const keysToRemove = [...cacheKeys, "lastPiazzaExport"];
  if (keysToRemove.length) {
    await chrome.storage.local.remove(keysToRemove);
  }
}

function getPiazzaCacheKey(networkId) {
  return networkId ? `${PIAZZA_CACHE_PREFIX}${networkId}` : null;
}

function deriveNetworkIdFromUrl(url) {
  const match = String(url || "").match(/\/class\/([^/?#]+)/i);
  return match ? match[1] : null;
}
