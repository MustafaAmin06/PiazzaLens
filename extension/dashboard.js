// ============================================================
// PiazzaLens — Dashboard Logic
// Powers all dashboard panels, voice interface, and API calls
// ============================================================

(function () {
  "use strict";

  // ---- State ----
  let currentRole = "professor";
  let mockData = null;

  // ---- Initialize ----
  document.addEventListener("DOMContentLoaded", () => {
    loadMockData();
    setupTabNavigation();
    setupVoiceInterface();
    setupSearch();
    setupEmailModal();
    setupCloseButton();
    renderProfessorView();
    renderStudentView();
    listenForMessages();
  });

  // ---- Load Mock Data ----
  function loadMockData() {
    // The mock data is embedded as a global from mock_data.js
    // In the dashboard iframe, we fetch it
    fetch(getExtensionURL("mock_data.js"))
      .then((r) => r.text())
      .then((text) => {
        // Execute to get MOCK_DATA
        const fn = new Function(text + "; return MOCK_DATA;");
        mockData = fn();
        renderProfessorView();
        renderStudentView();
      })
      .catch(() => {
        // Fallback: use inline data
        mockData = getInlineMockData();
        renderProfessorView();
        renderStudentView();
      });
  }

  function getExtensionURL(path) {
    if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getURL) {
      return chrome.runtime.getURL(path);
    }
    return path;
  }

  // ---- Tab Navigation ----
  function setupTabNavigation() {
    const tabBtns = document.querySelectorAll(".tab-btn");
    tabBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const tab = btn.dataset.tab;
        tabBtns.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        document.querySelectorAll(".view-panel").forEach((p) => p.classList.remove("active"));
        document.getElementById(`view-${tab}`).classList.add("active");
        currentRole = tab;
      });
    });
  }

  // ---- Close Button ----
  function setupCloseButton() {
    document.getElementById("btn-close").addEventListener("click", () => {
      window.parent.postMessage({ type: "PIAZZALENS_CLOSE" }, "*");
    });
  }

  // ---- Listen for Messages ----
  function listenForMessages() {
    window.addEventListener("message", (event) => {
      if (event.data?.type === "PIAZZALENS_ROLE_CHANGED") {
        const role = event.data.role;
        const tabBtn = document.querySelector(`.tab-btn[data-tab="${role}"]`);
        if (tabBtn) tabBtn.click();
      }
    });
  }

  // ======================================================================
  //  PROFESSOR VIEW RENDERING
  // ======================================================================

  function renderProfessorView() {
    renderHealthScore();
    renderClusters();
    renderHeatmap();
    renderStudents();
  }

  // ---- Health Score ----
  function renderHealthScore() {
    const data = mockData?.courseHealth || getInlineMockData().courseHealth;
    const score = data.score;

    // Update gauge
    const circumference = 2 * Math.PI * 52; // r=52
    const offset = circumference - (score / 100) * circumference;
    const gaugeFill = document.getElementById("gauge-fill");
    if (gaugeFill) {
      // Start from full offset, animate to target
      gaugeFill.style.strokeDasharray = circumference;
      gaugeFill.style.strokeDashoffset = circumference;
      setTimeout(() => {
        gaugeFill.style.strokeDashoffset = offset;
      }, 200);
    }

    const gaugeValue = document.getElementById("gauge-value");
    if (gaugeValue) animateNumber(gaugeValue, 0, score, 1500);

    // Update badge
    const badge = document.getElementById("health-badge");
    if (badge) {
      if (score >= 80) {
        badge.textContent = "Healthy";
        badge.className = "badge badge-green";
      } else if (score >= 60) {
        badge.textContent = "Fair";
        badge.className = "badge badge-amber";
      } else {
        badge.textContent = "Needs Attention";
        badge.className = "badge badge-red";
      }
    }

    // Breakdown
    const breakdownEl = document.getElementById("health-breakdown");
    if (breakdownEl) {
      const bd = data.breakdown;
      breakdownEl.innerHTML = Object.entries(bd)
        .map(([key, val]) => {
          const color = val.score >= 80 ? "#22c55e" : val.score >= 60 ? "#f59e0b" : "#ef4444";
          return `
            <div class="breakdown-item">
              <div class="breakdown-header">
                <span class="breakdown-label">${capitalize(key)}</span>
                <span class="breakdown-score" style="color:${color}">${val.score}%</span>
              </div>
              <div class="breakdown-detail">${val.detail}</div>
              <div class="breakdown-bar">
                <div class="breakdown-bar-fill" style="width:0%;background:${color}" data-target-width="${val.score}%"></div>
              </div>
            </div>
          `;
        })
        .join("");

      // Animate bars
      setTimeout(() => {
        breakdownEl.querySelectorAll(".breakdown-bar-fill").forEach((bar) => {
          bar.style.width = bar.dataset.targetWidth;
        });
      }, 300);
    }

    // Insights
    const insightsEl = document.getElementById("health-insights");
    if (insightsEl) {
      insightsEl.innerHTML = data.insights
        .map(
          (insight) => `
          <div class="insight-item">
            <div class="insight-dot"></div>
            <span>${insight}</span>
          </div>
        `
        )
        .join("");
    }
  }

  // ---- Question Clusters ----
  function renderClusters() {
    const clusters = mockData?.clusters || getInlineMockData().clusters;
    const listEl = document.getElementById("cluster-list");
    if (!listEl) return;

    listEl.innerHTML = clusters
      .map(
        (cluster, i) => `
        <div class="cluster-item" style="animation-delay:${i * 0.1}s">
          <div class="cluster-header">
            <div class="cluster-topic">
              <span class="cluster-severity severity-${cluster.severity}"></span>
              ${cluster.topic}
            </div>
            <span class="cluster-count">${cluster.count} posts</span>
          </div>
          <ul class="cluster-examples">
            ${cluster.exampleQuestions.map((q) => `<li class="cluster-example">${q}</li>`).join("")}
          </ul>
          <div class="cluster-action">${cluster.suggestedAction}</div>
        </div>
      `
      )
      .join("");
  }

  // ---- Confusion Heatmap ----
  function renderHeatmap() {
    const lectures = mockData?.confusionByLecture || getInlineMockData().confusionByLecture;
    const heatmapEl = document.getElementById("heatmap");
    if (!heatmapEl) return;

    const maxScore = Math.max(...lectures.map((l) => l.confusionScore));

    heatmapEl.innerHTML = lectures
      .map((lecture, i) => {
        const ratio = lecture.confusionScore / maxScore;
        const color = getHeatColor(ratio);
        return `
          <div class="heatmap-row" style="animation-delay:${i * 0.08}s">
            <span class="heatmap-label">L${lecture.lecture}: ${lecture.title}</span>
            <div class="heatmap-bar-container">
              <div class="heatmap-bar" style="width:0%;background:${color}" data-target-width="${ratio * 100}%">
                <span class="heatmap-score">${lecture.confusionScore}</span>
              </div>
            </div>
            <span class="heatmap-posts">${lecture.unresolvedPosts} open</span>
          </div>
        `;
      })
      .join("");

    // Animate bars
    setTimeout(() => {
      heatmapEl.querySelectorAll(".heatmap-bar").forEach((bar) => {
        bar.style.width = bar.dataset.targetWidth;
      });
    }, 400);
  }

  // ---- At-Risk Students ----
  function renderStudents() {
    const students = mockData?.students || getInlineMockData().students;
    const listEl = document.getElementById("student-list");
    if (!listEl) return;

    // Sort by risk score descending
    const sorted = [...students].sort((a, b) => b.riskScore - a.riskScore);
    // Show medium and high risk
    const atRisk = sorted.filter((s) => s.riskLevel !== "low");

    document.getElementById("risk-count").textContent = `${atRisk.length} flagged`;

    listEl.innerHTML = atRisk
      .map((student, i) => {
        const initials = student.name
          .split(" ")
          .map((n) => n[0])
          .join("");
        const riskColor =
          student.riskLevel === "high" ? "#ef4444" : student.riskLevel === "medium" ? "#f59e0b" : "#22c55e";
        return `
          <div class="student-item" style="animation-delay:${i * 0.1}s">
            <div class="student-avatar risk-${student.riskLevel}">${initials}</div>
            <div class="student-info">
              <div class="student-name">${student.name}</div>
              <div class="student-detail">${student.postsCount} posts · ${student.confusionSignals} confusion signals · ${student.assignmentsSubmitted}/${student.assignmentsTotal} assignments</div>
              <div class="student-risk-bar">
                <div class="student-risk-fill" style="width:0%;background:${riskColor}" data-target-width="${student.riskScore}%"></div>
              </div>
            </div>
            <div class="student-actions">
              <button class="student-btn email-btn" data-student='${JSON.stringify({ name: student.name, topics: student.topics })}'>📧 Draft Email</button>
            </div>
          </div>
        `;
      })
      .join("");

    // Animate risk bars
    setTimeout(() => {
      listEl.querySelectorAll(".student-risk-fill").forEach((bar) => {
        bar.style.width = bar.dataset.targetWidth;
      });
    }, 500);

    // Email button handlers
    listEl.querySelectorAll(".email-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const data = JSON.parse(e.target.dataset.student);
        generateEmail(data.name, data.topics);
      });
    });
  }

  // ======================================================================
  //  STUDENT VIEW RENDERING
  // ======================================================================

  function renderStudentView() {
    renderTrendingTags();
    renderStudyTips();
  }

  function renderTrendingTags() {
    const tagsEl = document.getElementById("trending-tags");
    if (!tagsEl) return;

    const tags = [
      { name: "backpropagation", count: 22 },
      { name: "gradient descent", count: 17 },
      { name: "attention", count: 15 },
      { name: "CNNs", count: 12 },
      { name: "K-means", count: 10 },
      { name: "overfitting", count: 9 },
      { name: "transformers", count: 8 },
      { name: "regularization", count: 7 }
    ];

    tagsEl.innerHTML = tags
      .map(
        (t) => `<span class="trending-tag">${t.name} <span class="tag-count">${t.count}</span></span>`
      )
      .join("");
  }

  function renderStudyTips() {
    const tipsEl = document.getElementById("tips-content");
    if (!tipsEl) return;

    const tips = [
      {
        icon: "🧠",
        title: "Most Confused Topic This Week",
        text: "Neural Networks (Lecture 3) — 78 confusion signals. Focus your study time here."
      },
      {
        icon: "📖",
        title: "Recommended Resources",
        text: "3Blue1Brown Neural Network playlist, CS229 Lecture Notes Ch. 5-6"
      },
      {
        icon: "⏰",
        title: "Best Time to Get Help",
        text: "Questions posted 10am-12pm get answered 47% faster on average."
      },
      {
        icon: "🤝",
        title: "Study Groups",
        text: "12 students are actively discussing Neural Networks. Consider joining a study group!"
      }
    ];

    tipsEl.innerHTML = tips
      .map(
        (tip) => `
        <div class="tip-item">
          <div class="tip-icon">${tip.icon}</div>
          <div class="tip-text">
            <h4>${tip.title}</h4>
            <p>${tip.text}</p>
          </div>
        </div>
      `
      )
      .join("");
  }

  // ======================================================================
  //  SEARCH (Duplicate Detection)
  // ======================================================================

  function setupSearch() {
    const input = document.getElementById("search-input");
    const btn = document.getElementById("search-btn");
    const results = document.getElementById("search-results");

    if (!input || !btn) return;

    // Search on button click
    btn.addEventListener("click", () => performSearch(input.value));

    // Search on Enter
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") performSearch(input.value);
    });

    // Live search with debounce
    let debounce;
    input.addEventListener("input", () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        if (input.value.length >= 3) performSearch(input.value);
      }, 500);
    });
  }

  function performSearch(query) {
    if (!query || query.length < 2) return;

    const results = document.getElementById("search-results");
    const socialCount = document.getElementById("social-count");

    // Try to match from mock data
    const lowerQuery = query.toLowerCase();
    const allPosts = mockData?.posts || getInlineMockData().posts;

    // Simple keyword matching
    const matches = allPosts
      .map((post) => {
        const titleMatch = post.title.toLowerCase().includes(lowerQuery);
        const bodyMatch = post.body.toLowerCase().includes(lowerQuery);
        const tagMatch = post.tags?.some((t) => lowerQuery.includes(t));
        let score = 0;
        if (titleMatch) score += 0.5;
        if (bodyMatch) score += 0.3;
        if (tagMatch) score += 0.2;
        // Add some randomness for realistic similarity scores
        if (score > 0) score = Math.min(0.98, score + Math.random() * 0.3);
        return { ...post, similarity: score };
      })
      .filter((p) => p.similarity > 0)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 5);

    if (matches.length === 0) {
      results.innerHTML = `
        <div class="search-placeholder">
          <div class="search-placeholder-icon">✅</div>
          <p>No similar questions found. Your question looks unique! Go ahead and post it.</p>
        </div>
      `;
      return;
    }

    // Update social count
    if (socialCount) {
      const count = Math.floor(Math.random() * 15) + 5;
      animateNumber(socialCount, 0, count, 800);
    }

    results.innerHTML = `
      <div class="result-header">
        Similar questions found <span class="result-count">${matches.length}</span>
      </div>
      ${matches
        .map((m) => {
          const pct = Math.round(m.similarity * 100);
          const simClass = pct >= 80 ? "similarity-high" : "similarity-medium";
          return `
            <div class="result-item">
              <div class="result-similarity ${simClass}">${pct}%</div>
              <div>
                <div class="result-title">${m.title}</div>
                <div class="result-excerpt">${m.body.substring(0, 100)}...</div>
              </div>
            </div>
          `;
        })
        .join("")}
      <div style="padding:10px;text-align:center;">
        <span style="font-size:12px;color:#22c55e;">💡 Consider reading existing answers before posting!</span>
      </div>
    `;
  }

  // ======================================================================
  //  VOICE INTERFACE
  // ======================================================================

  function setupVoiceInterface() {
    const voiceBtn = document.getElementById("btn-voice");
    const voiceOverlay = document.getElementById("voice-overlay");
    const voiceClose = document.getElementById("voice-close");
    const voiceStatus = document.getElementById("voice-status");
    const voiceTranscript = document.getElementById("voice-transcript");
    const voiceResponse = document.getElementById("voice-response");

    if (!voiceBtn) return;

    voiceBtn.addEventListener("click", () => {
      voiceOverlay.classList.add("active");
      voiceBtn.classList.add("active");
      voiceStatus.textContent = "Listening...";
      voiceTranscript.textContent = "";
      voiceResponse.classList.remove("visible");
      voiceResponse.textContent = "";

      startVoiceRecognition();
    });

    voiceClose.addEventListener("click", () => {
      voiceOverlay.classList.remove("active");
      voiceBtn.classList.remove("active");
      stopVoiceRecognition();
    });
  }

  let recognition = null;

  function startVoiceRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      // Fallback: simulate for demo
      simulateVoice();
      return;
    }

    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((r) => r[0].transcript)
        .join("");
      document.getElementById("voice-transcript").textContent = `"${transcript}"`;

      if (event.results[0].isFinal) {
        document.getElementById("voice-status").textContent = "Processing...";
        processVoiceQuery(transcript);
      }
    };

    recognition.onerror = (event) => {
      console.warn("[PiazzaLens] Voice error:", event.error);
      // Fallback to simulation
      simulateVoice();
    };

    recognition.onend = () => {
      // If no result, simulate
      const transcript = document.getElementById("voice-transcript").textContent;
      if (!transcript) simulateVoice();
    };

    try {
      recognition.start();
    } catch (e) {
      simulateVoice();
    }
  }

  function stopVoiceRecognition() {
    if (recognition) {
      try {
        recognition.stop();
      } catch (e) {}
      recognition = null;
    }
  }

  function simulateVoice() {
    const demos = [
      "How many students haven't submitted Assignment 3?",
      "What are the most confused topics?",
      "What's the course health score?",
      "What are the most common questions?"
    ];
    const chosen = demos[Math.floor(Math.random() * demos.length)];

    const transcript = document.getElementById("voice-transcript");
    const status = document.getElementById("voice-status");

    // Animate typing
    let i = 0;
    status.textContent = "Listening...";
    const interval = setInterval(() => {
      transcript.textContent = `"${chosen.substring(0, i + 1)}"`;
      i++;
      if (i >= chosen.length) {
        clearInterval(interval);
        status.textContent = "Processing...";
        processVoiceQuery(chosen);
      }
    }, 50);
  }

  function processVoiceQuery(transcript) {
    // Send to background for processing
    if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage(
        { action: "VOICE_QUERY", payload: { transcript } },
        (response) => {
          showVoiceResponse(response?.data?.answer || "I couldn't process that. Try again.");
        }
      );
    } else {
      // Standalone fallback
      const answer = getLocalVoiceResponse(transcript);
      showVoiceResponse(answer);
    }
  }

  function showVoiceResponse(answer) {
    const status = document.getElementById("voice-status");
    const response = document.getElementById("voice-response");
    status.textContent = "Here's what I found:";
    response.textContent = answer;
    response.classList.add("visible");
  }

  function getLocalVoiceResponse(transcript) {
    const lower = transcript.toLowerCase();
    if (lower.includes("submit") || lower.includes("assignment")) {
      return "Based on the current data, 31 out of 187 students haven't submitted Assignment 3 yet. That's about 17% of the class. The deadline is in 3 days.";
    }
    if (lower.includes("confused") || lower.includes("struggling")) {
      return "The top confusion areas are: Neural Networks (Lecture 3) with a confusion score of 78, NLP/Transformers (Lecture 7) at 71, and Deep Learning/CNNs (Lecture 6) at 65.";
    }
    if (lower.includes("health") || lower.includes("score")) {
      return "The current course health score is 82 out of 100. Engagement is high at 88%, but there are 14 unresolved posts that need attention.";
    }
    if (lower.includes("question") || lower.includes("common")) {
      return "The most common topic is Gradient Descent & Optimization with 17 similar questions. Students are confused about convergence and learning rate selection.";
    }
    return `Based on the course data, everything looks on track. The course health score is 82/100 with 83% student participation.`;
  }

  // ======================================================================
  //  EMAIL GENERATION
  // ======================================================================

  function setupEmailModal() {
    const modal = document.getElementById("email-modal");
    const closeBtn = document.getElementById("email-modal-close");
    const copyBtn = document.getElementById("email-copy");
    const sendBtn = document.getElementById("email-send");

    if (!closeBtn) return;

    closeBtn.addEventListener("click", () => modal.classList.remove("active"));
    modal.addEventListener("click", (e) => {
      if (e.target === modal) modal.classList.remove("active");
    });

    copyBtn.addEventListener("click", () => {
      const text = document.getElementById("email-preview").textContent;
      navigator.clipboard.writeText(text).then(() => {
        copyBtn.textContent = "✅ Copied!";
        setTimeout(() => (copyBtn.textContent = "📋 Copy to Clipboard"), 1500);
      });
    });

    sendBtn.addEventListener("click", () => {
      const text = document.getElementById("email-preview").textContent;
      const lines = text.split("\n");
      const subject = lines[0].replace("Subject: ", "");
      const body = lines.slice(2).join("\n");
      window.open(`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
    });
  }

  function generateEmail(studentName, topics) {
    const modal = document.getElementById("email-modal");
    const preview = document.getElementById("email-preview");

    // Generate email
    const email = `Subject: Checking in about the course

Hi ${studentName.split(" ")[0]},

I noticed you've had several questions recently about ${topics.slice(0, 3).join(" and ")}. That's completely normal — these are challenging topics that many students find tricky.

If you'd like, we can schedule a quick 15-minute meeting to go over any concepts you're finding difficult. I'm available during office hours, or we can find another time that works for you.

Don't hesitate to reach out — I'm here to help.

Best,
Prof. Smith`;

    preview.textContent = email;
    modal.classList.add("active");
  }

  // ======================================================================
  //  UTILITY FUNCTIONS
  // ======================================================================

  function animateNumber(element, start, end, duration) {
    const startTime = performance.now();
    function update(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(start + (end - start) * eased);
      element.textContent = current;
      if (progress < 1) requestAnimationFrame(update);
    }
    requestAnimationFrame(update);
  }

  function capitalize(str) {
    return str.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase());
  }

  function getHeatColor(ratio) {
    // From green to yellow to red
    if (ratio < 0.35) return "linear-gradient(90deg, #22c55e, #4ade80)";
    if (ratio < 0.55) return "linear-gradient(90deg, #eab308, #facc15)";
    if (ratio < 0.75) return "linear-gradient(90deg, #f59e0b, #fb923c)";
    return "linear-gradient(90deg, #ef4444, #f87171)";
  }

  // ---- Inline Mock Data Fallback ----
  function getInlineMockData() {
    return {
      courseHealth: {
        score: 82,
        breakdown: {
          engagement: { score: 88, label: "High", detail: "187 students, 156 active" },
          responseTime: { score: 79, label: "Good", detail: "Avg response: 2.3 hours" },
          resolution: { score: 74, label: "Needs Attention", detail: "14 unresolved (28%)" },
          participation: { score: 85, label: "High", detail: "83% have posted" }
        },
        insights: [
          "Engagement is high — 83% student participation rate",
          "14 unresolved posts need attention",
          "Response time increased to 2.3h this week",
          "Neural Networks has highest confusion score"
        ]
      },
      clusters: [
        { topic: "Gradient Descent & Optimization", count: 17, exampleQuestions: ["How does gradient descent converge?", "Learning rate too high"], suggestedAction: "Review convergence theory with visual animations.", severity: "high" },
        { topic: "Neural Network Architecture", count: 14, exampleQuestions: ["How many hidden layers?", "Vanishing gradient problem"], suggestedAction: "Dedicate lecture to practical architecture decisions.", severity: "high" },
        { topic: "Backpropagation & Chain Rule", count: 11, exampleQuestions: ["Chain rule step-by-step", "Weight initialization"], suggestedAction: "Walk through backprop with numerical example.", severity: "medium" },
        { topic: "Model Selection", count: 9, exampleQuestions: ["SVM vs logistic regression", "K-means vs DBSCAN"], suggestedAction: "Create comparison table handout.", severity: "medium" },
        { topic: "Attention & Transformers", count: 8, exampleQuestions: ["Attention mechanism intuition", "BERT vs GPT"], suggestedAction: "Use animated visualization of attention.", severity: "high" }
      ],
      confusionByLecture: [
        { lecture: 1, title: "Linear Regression", confusionScore: 34, posts: 6, unresolvedPosts: 1 },
        { lecture: 2, title: "Logistic Regression", confusionScore: 28, posts: 5, unresolvedPosts: 1 },
        { lecture: 3, title: "Neural Networks", confusionScore: 78, posts: 7, unresolvedPosts: 2 },
        { lecture: 4, title: "SVMs", confusionScore: 42, posts: 4, unresolvedPosts: 2 },
        { lecture: 5, title: "Clustering", confusionScore: 56, posts: 7, unresolvedPosts: 2 },
        { lecture: 6, title: "Deep Learning / CNNs", confusionScore: 65, posts: 6, unresolvedPosts: 2 },
        { lecture: 7, title: "NLP / Transformers", confusionScore: 71, posts: 5, unresolvedPosts: 2 },
        { lecture: 8, title: "Reinforcement Learning", confusionScore: 31, posts: 3, unresolvedPosts: 2 }
      ],
      students: [
        { name: "Alex T.", postsCount: 9, confusionSignals: 7, assignmentsSubmitted: 2, assignmentsTotal: 3, riskScore: 85, riskLevel: "high", topics: ["backpropagation", "attention", "kernel-trick"] },
        { name: "Jordan M.", postsCount: 6, confusionSignals: 4, assignmentsSubmitted: 3, assignmentsTotal: 3, riskScore: 52, riskLevel: "medium", topics: ["multiclass", "vanishing-gradient"] },
        { name: "Priya R.", postsCount: 5, confusionSignals: 3, assignmentsSubmitted: 2, assignmentsTotal: 3, riskScore: 48, riskLevel: "medium", topics: ["regularization", "feature-scaling"] },
        { name: "Chris L.", postsCount: 4, confusionSignals: 2, assignmentsSubmitted: 2, assignmentsTotal: 3, riskScore: 42, riskLevel: "medium", topics: ["learning-rate", "dropout"] }
      ],
      posts: [
        { id: 1, title: "Confused about the cost function", body: "Why do we use squared error instead of absolute error?", tags: ["linear-regression", "cost-function"] },
        { id: 2, title: "How does gradient descent converge?", body: "I understand the formula but confused about convergence.", tags: ["gradient-descent"] },
        { id: 3, title: "Normal equation vs gradient descent?", body: "When should we use which?", tags: ["normal-equation", "gradient-descent"] },
        { id: 12, title: "Backpropagation chain rule", body: "Can't follow the chain rule derivation for backprop.", tags: ["backpropagation", "chain-rule"] },
        { id: 36, title: "Attention mechanism intuition", body: "Still don't understand self-attention.", tags: ["attention", "transformers"] }
      ]
    };
  }
})();
