// ============================================================
// PiazzaLens — Background Service Worker
// Handles API routing, message passing, and state management
// ============================================================

// ---- Configuration ----
const CONFIG = {
  API_BASE_URL: "", // Set to your API Gateway URL when deployed
  USE_MOCK: true,   // Set to false when AWS backend is live
  DEFAULT_ROLE: "professor",
  DEFAULT_THEME: "dark"
};

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

    case "VOICE_QUERY":
      handleVoiceQuery(payload)
        .then((result) => sendResponse({ success: true, data: result }))
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

    default:
      return { error: "Unknown endpoint" };
  }
}

// ---- Email Generation ----
async function handleGenerateEmail(payload) {
  const { studentName, topics, type } = payload;
  return getMockResponse("/generate-email", { studentName, topics, type });
}

// ---- Voice Query Handler ----
async function handleVoiceQuery(payload) {
  const { transcript } = payload;
  const lower = transcript.toLowerCase();

  // Simple intent matching for demo
  if (lower.includes("submit") || lower.includes("assignment")) {
    return {
      answer: "Based on the current data, 31 out of 187 students haven't submitted Assignment 3 yet. That's about 17% of the class. The deadline is in 3 days.",
      intent: "assignment_status"
    };
  }
  if (lower.includes("confused") || lower.includes("struggling") || lower.includes("confusion")) {
    return {
      answer: "The top confusion areas are: Neural Networks (Lecture 3) with a confusion score of 78, NLP/Transformers (Lecture 7) at 71, and Deep Learning/CNNs (Lecture 6) at 65. I recommend reviewing backpropagation and attention mechanisms.",
      intent: "confusion_analysis"
    };
  }
  if (lower.includes("health") || lower.includes("score") || lower.includes("engagement")) {
    return {
      answer: "The current course health score is 82 out of 100. Engagement is high at 88%, but there are 14 unresolved posts that need attention. Response time has slightly increased this week.",
      intent: "course_health"
    };
  }
  if (lower.includes("question") || lower.includes("common") || lower.includes("asked")) {
    return {
      answer: "The most common question topic is Gradient Descent & Optimization with 17 similar questions. Students are particularly confused about convergence and learning rate selection. I'd suggest an interactive demo in your next lecture.",
      intent: "common_questions"
    };
  }

  return {
    answer: `I heard: "${transcript}". Based on the course data, everything looks on track. The course health score is 82/100 with 83% student participation. Is there something specific you'd like to know about?`,
    intent: "general"
  };
}
