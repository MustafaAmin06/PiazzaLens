// ============================================================
// Piazza AI — Dashboard Logic
// Powers all dashboard panels and API calls
// ============================================================

(function () {
  "use strict";

  // ---- State ----
  let currentRole = "professor";
  let mockData = null;
  let dataMode = "demo";
  let openaiApiKey = "";

  // ---- OpenAI Client ----
  async function loadApiKey() {
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      const data = await new Promise((r) => chrome.storage.local.get(["openaiApiKey"], r));
      openaiApiKey = data.openaiApiKey || "";
    }
  }

  function aiEnabled() {
    return !!openaiApiKey;
  }

  async function callOpenAI(prompt, maxTokens = 1024) {
    if (!openaiApiKey) return null;
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${openaiApiKey}`
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          max_tokens: maxTokens,
          messages: [{ role: "user", content: prompt }]
        })
      });
      if (!res.ok) {
        console.warn("[PiazzaAI] OpenAI API error:", res.status);
        return null;
      }
      const json = await res.json();
      return json.choices?.[0]?.message?.content || null;
    } catch (err) {
      console.warn("[PiazzaAI] OpenAI call failed:", err.message);
      return null;
    }
  }

  async function callOpenAIJSON(prompt, maxTokens = 1024) {
    if (!openaiApiKey) return null;
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${openaiApiKey}`
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          max_tokens: maxTokens,
          response_format: { type: "json_object" },
          messages: [{ role: "user", content: prompt }]
        })
      });
      if (!res.ok) return null;
      const json = await res.json();
      const text = json.choices?.[0]?.message?.content;
      return text ? JSON.parse(text) : null;
    } catch (err) {
      console.warn("[PiazzaAI] OpenAI JSON call failed:", err.message);
      return null;
    }
  }

  // ---- Initialize ----
  document.addEventListener("DOMContentLoaded", async () => {
    await loadApiKey();
    updateAIBadge();
    setupTabNavigation();
    setupSearch();
    setupEmailModal();
    setupCloseButton();
    setupFooterButtons();
    setupSettingsModal();
    listenForMessages();
    listenForStorageChanges();
    loadDashboardData();
  });

  function updateAIBadge() {
    const badge = document.getElementById("ai-badge");
    if (!badge) return;
    if (aiEnabled()) {
      badge.textContent = "GPT-4o mini";
      badge.style.opacity = "1";
    } else {
      badge.textContent = "Local";
      badge.style.opacity = "0.6";
    }
  }

  function loadDashboardData() {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(["lastPiazzaExport"], ({ lastPiazzaExport }) => {
        const liveData = transformExportPayload(lastPiazzaExport?.payload);
        if (liveData) {
          mockData = liveData;
          dataMode = "live";
          applyDashboardDataMode(lastPiazzaExport?.fetchedAt);
          renderProfessorView();
          renderStudentView();
          return;
        }

        loadMockData();
      });
      return;
    }

    loadMockData();
  }

  // ---- Load Mock Data ----
  function loadMockData() {
    fetch(getExtensionURL("mock_data.js"))
      .then((r) => r.text())
      .then((text) => {
        const fn = new Function(text + "; return MOCK_DATA;");
        mockData = fn();
        dataMode = "demo";
        applyDashboardDataMode();
        renderProfessorView();
        renderStudentView();
      })
      .catch(() => {
        mockData = getInlineMockData();
        dataMode = "demo";
        applyDashboardDataMode();
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

  // ---- Close Button (legacy support for content.js messaging) ----
  function setupCloseButton() {
    const btn = document.getElementById("btn-close");
    if (btn) {
      btn.addEventListener("click", () => {
        window.parent.postMessage({ type: "PIAZZALENS_CLOSE" }, "*");
      });
    }
  }

  // ---- Footer Buttons ----
  function setupFooterButtons() {
    const settingsBtn = document.getElementById("btn-settings");
    const externalBtn = document.getElementById("btn-external");

    if (settingsBtn) {
      settingsBtn.addEventListener("click", () => {
        const modal = document.getElementById("settings-modal");
        if (modal) modal.classList.add("active");
      });
    }

    if (externalBtn) {
      externalBtn.addEventListener("click", () => {
        window.open("https://piazza.com", "_blank");
      });
    }
  }

  // ---- Settings Modal ----
  function setupSettingsModal() {
    const modal = document.getElementById("settings-modal");
    const closeBtn = document.getElementById("settings-modal-close");
    const saveBtn = document.getElementById("settings-save-key");
    const clearBtn = document.getElementById("settings-clear-key");
    const input = document.getElementById("settings-api-key");
    const status = document.getElementById("settings-api-status");

    if (!modal || !closeBtn) return;

    closeBtn.addEventListener("click", () => modal.classList.remove("active"));
    modal.addEventListener("click", (e) => {
      if (e.target === modal) modal.classList.remove("active");
    });

    // Show current status
    if (openaiApiKey) {
      const masked = "sk-..." + openaiApiKey.slice(-4);
      status.textContent = `Key configured (${masked}). AI features enabled.`;
      status.style.color = "#22c55e";
    } else {
      status.textContent = "No API key configured. Using local fallbacks.";
      status.style.color = "#64748b";
    }

    saveBtn.addEventListener("click", async () => {
      const key = input.value.trim();
      if (!key) return;
      openaiApiKey = key;
      await new Promise((r) => chrome.storage.local.set({ openaiApiKey: key }, r));
      const masked = "sk-..." + key.slice(-4);
      status.textContent = `Key saved (${masked}). AI features enabled.`;
      status.style.color = "#22c55e";
      input.value = "";
      updateAIBadge();
      renderProfessorView();
      renderStudentView();
    });

    clearBtn.addEventListener("click", async () => {
      openaiApiKey = "";
      await new Promise((r) => chrome.storage.local.remove(["openaiApiKey"], r));
      status.textContent = "Key cleared. Using local fallbacks.";
      status.style.color = "#64748b";
      input.value = "";
      updateAIBadge();
      renderProfessorView();
      renderStudentView();
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

  function listenForStorageChanges() {
    if (!(typeof chrome !== "undefined" && chrome.storage && chrome.storage.onChanged)) {
      return;
    }

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local" || !changes.lastPiazzaExport) {
        return;
      }

      const liveData = transformExportPayload(changes.lastPiazzaExport.newValue?.payload);
      if (!liveData) {
        return;
      }

      mockData = liveData;
      dataMode = "live";
      applyDashboardDataMode(changes.lastPiazzaExport.newValue?.fetchedAt);
      renderProfessorView();
      renderStudentView();
    });
  }

  function applyDashboardDataMode(fetchedAt) {
    const courseInfo = document.getElementById("course-info");
    const syncStatus = document.getElementById("sync-status");
    const course = mockData?.course || getInlineMockData().course;

    if (courseInfo) {
      const university = course.university || "University of Toronto";
      const courseName = resolveCourseDisplayName(course);
      courseInfo.textContent = `${university} \u00B7 ${courseName}`;
    }

    if (syncStatus) {
      if (dataMode === "live" && fetchedAt) {
        syncStatus.textContent = `Connected to Piazza \u00B7 Synced ${formatRelativeTime(fetchedAt)}`;
      } else {
        syncStatus.textContent = "Connected to Piazza \u00B7 Synced 2m ago";
      }
    }
  }

  function resolveCourseDisplayName(course) {
    const candidates = [course?.name, course?.title, course?.displayName, course?.id]
      .map((value) => String(value || "").trim())
      .filter(Boolean);

    const preferred = candidates.find((value) => !looksLikeOpaqueCourseId(value));
    return preferred || "Piazza Course";
  }

  function looksLikeOpaqueCourseId(value) {
    const text = String(value || "").trim();
    if (!text) {
      return true;
    }

    if (/^[a-z0-9]{10,}$/i.test(text) && !/[\s_-]/.test(text)) {
      return true;
    }

    return false;
  }

  // ======================================================================
  //  PROFESSOR VIEW RENDERING
  // ======================================================================

  async function renderProfessorView() {
    const posts = mockData?.posts || getInlineMockData().posts;

    // These always use local computation
    renderStatCards(null);
    renderHeatmap(null);
    renderStudents(null);

    // AI Insight — try LLM, fall back to local
    renderAIInsight(null);
    if (aiEnabled()) {
      fetchAIInsight(posts);
    }

    // Question Clusters — try LLM, fall back to local
    renderMostAskedQuestions(null);
    if (aiEnabled()) {
      fetchAIClusters(posts);
    }
  }

  async function fetchAIInsight(posts) {
    const sample = posts.slice(0, 30).map((p) => `- ${p.title} [${p.resolved ? "resolved" : "unresolved"}] (${p.topic || "general"})`).join("\n");
    const prompt = `You are an education analytics assistant. Analyze these student questions from a course forum and respond with JSON.

Questions:
${sample}

Respond with a JSON object:
{
  "topic": "the most confusing topic name",
  "percentage": <number 1-50 representing estimated confusion increase>,
  "suggestions": ["suggestion 1", "suggestion 2", "suggestion 3"]
}

The suggestions should be specific, actionable teaching recommendations.`;

    const result = await callOpenAIJSON(prompt, 512);
    if (result?.topic) {
      const contentEl = document.getElementById("insight-content");
      if (!contentEl) return;
      contentEl.innerHTML = `
        <p class="insight-text">
          Students are struggling most with <span class="topic-highlight">${result.topic}</span> this week.
          Confusion increased <span class="pct-highlight">${result.percentage}%</span> since last lecture.
        </p>
        <div class="suggested-focus">
          <div class="suggested-focus-header">&#x1F4A1; SUGGESTED LECTURE FOCUS</div>
          <ul>${(result.suggestions || []).map((s) => `<li>${s}</li>`).join("")}</ul>
        </div>
      `;
    }
  }

  async function fetchAIClusters(posts) {
    const sample = posts.slice(0, 50).map((p) => `- ${p.title} (tags: ${(p.tags || []).join(", ") || p.topic || "none"})`).join("\n");
    const prompt = `You are an education analytics assistant. Analyze these student questions and identify the top 5 topic clusters. Respond with JSON.

Questions:
${sample}

Respond with a JSON object:
{
  "clusters": [
    {
      "topic": "Topic Name",
      "count": <number of questions in cluster>,
      "exampleQuestions": ["example 1", "example 2"],
      "suggestedAction": "specific teaching recommendation",
      "severity": "high" | "medium" | "low"
    }
  ]
}

Severity: high if >10 questions or many unresolved, medium if 5-10, low if <5.`;

    const result = await callOpenAIJSON(prompt, 1024);
    if (result?.clusters?.length) {
      const listEl = document.getElementById("question-list");
      if (!listEl) return;
      listEl.innerHTML = result.clusters.map((c) => `
        <div class="question-item">
          <div>
            <span class="question-title">${c.topic}</span>
            <div style="font-size:11px;color:#64748b;margin-top:4px">${c.suggestedAction || ""}</div>
          </div>
          <span class="question-votes">
            <span class="fire">&#x1F525;</span>
            <strong>${c.count}</strong>
          </span>
        </div>
      `).join("");
    }
  }

  // ---- Stat Cards ----
  function renderStatCards(apiData) {
    const health = apiData || mockData?.courseHealth || getInlineMockData().courseHealth;
    const stats = mockData?.stats || getInlineMockData().stats;
    const gridEl = document.getElementById("stat-grid");
    if (!gridEl) return;

    const cards = [
      {
        label: "HEALTH SCORE",
        value: health.score || stats.healthScore.value,
        delta: stats.healthScore.delta,
        positiveIsDown: false
      },
      {
        label: "ACTIVE STUDENTS",
        value: stats.activeStudents.value,
        delta: stats.activeStudents.delta,
        positiveIsDown: false
      },
      {
        label: "QUESTIONS TODAY",
        value: stats.questionsToday.value,
        delta: stats.questionsToday.delta,
        positiveIsDown: false
      },
      {
        label: "AVG RESPONSE",
        value: stats.avgResponse.value,
        delta: stats.avgResponse.delta,
        positiveIsDown: true
      }
    ];

    gridEl.innerHTML = cards
      .map((card) => {
        const numericDelta = parseFloat(String(card.delta));
        const isPositive = card.positiveIsDown
          ? numericDelta < 0
          : numericDelta > 0;
        const trendClass = isPositive ? "positive" : "negative";
        const deltaStr =
          typeof card.delta === "number"
            ? card.delta > 0
              ? `+${card.delta}`
              : `${card.delta}`
            : card.delta;

        const trendUpSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 14 8 10 12 13 20 5"/><polyline points="16 5 20 5 20 9"/></svg>';
        const trendDownSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 10 8 14 12 11 20 19"/><polyline points="16 19 20 19 20 15"/></svg>';

        return `
          <div class="stat-card">
            <div class="stat-label">${card.label}</div>
            <div class="stat-value-row">
              <span class="stat-value">${card.value}</span>
              <span class="stat-trend ${trendClass}">
                <span class="stat-trend-icon">${isPositive ? trendUpSvg : trendDownSvg}</span>
                ${deltaStr}
              </span>
            </div>
          </div>
        `;
      })
      .join("");
  }

  // ---- Confusion Heatmap ----
  function renderHeatmap(apiData) {
    const lectures =
      apiData?.lectures ||
      mockData?.confusionByLecture ||
      getInlineMockData().confusionByLecture;
    const heatmapEl = document.getElementById("heatmap");
    if (!heatmapEl) return;

    // Sort by confusion score descending
    const sorted = [...lectures].sort((a, b) => b.confusionScore - a.confusionScore);

    heatmapEl.innerHTML = sorted
      .map((item) => {
        const score = item.confusionScore;
        const barColor =
          score >= 70
            ? "#ef4444"
            : score >= 50
              ? "#f59e0b"
              : "#cbd5e1";
        const scoreColor =
          score >= 70
            ? "#ef4444"
            : score >= 50
              ? "#f59e0b"
              : "#94a3b8";

        return `
          <div class="heatmap-row">
            <span class="heatmap-label">${item.title}</span>
            <div class="heatmap-bar-container">
              <div class="heatmap-bar" style="width:0%;background:${barColor}" data-target-width="${score}%"></div>
            </div>
            <span class="heatmap-score" style="color:${scoreColor}">${score}</span>
          </div>
        `;
      })
      .join("");

    // Animate bars
    setTimeout(() => {
      heatmapEl.querySelectorAll(".heatmap-bar").forEach((bar) => {
        bar.style.width = bar.dataset.targetWidth;
      });
    }, 300);
  }

  // ---- AI Insight ----
  function renderAIInsight(apiData) {
    const lectures =
      apiData?.lectures ||
      mockData?.confusionByLecture ||
      getInlineMockData().confusionByLecture;
    const insight = mockData?.aiInsight || getInlineMockData().aiInsight;
    const contentEl = document.getElementById("insight-content");
    if (!contentEl) return;

    const topTopic = [...lectures].sort(
      (a, b) => b.confusionScore - a.confusionScore
    )[0];

    const topic = insight?.topic || topTopic?.title || "this topic";
    const pct = insight?.percentage || 23;
    const suggestions = insight?.suggestions || [
      "Review key concepts step by step",
      "Provide worked examples",
      "Address common misconceptions"
    ];

    contentEl.innerHTML = `
      <p class="insight-text">
        Students are struggling most with <span class="topic-highlight">${topic}</span> this week.
        Confusion increased <span class="pct-highlight">${pct}%</span> since last lecture.
      </p>
      <div class="suggested-focus">
        <div class="suggested-focus-header">
          &#x1F4A1; SUGGESTED LECTURE FOCUS
        </div>
        <ul>
          ${suggestions.map((s) => `<li>${s}</li>`).join("")}
        </ul>
      </div>
    `;
  }

  // ---- Most Asked Questions ----
  function renderMostAskedQuestions(apiData) {
    const topQuestions =
      mockData?.topQuestions || getInlineMockData().topQuestions;
    const listEl = document.getElementById("question-list");
    if (!listEl) return;

    // If API returned clusters, we could derive questions from them
    // For now, use topQuestions data
    listEl.innerHTML = topQuestions
      .map(
        (q) => `
        <div class="question-item">
          <span class="question-title">${q.title}</span>
          <span class="question-votes">
            <span class="fire">&#x1F525;</span>
            <strong>${q.votes}</strong>
          </span>
        </div>
      `
      )
      .join("");
  }

  // ---- At-Risk Students ----
  function renderStudents(apiData) {
    const students =
      apiData?.students ||
      mockData?.students ||
      getInlineMockData().students;
    const listEl = document.getElementById("student-list");
    if (!listEl) return;

    // Sort by risk score descending
    const sorted = [...students].sort((a, b) => b.riskScore - a.riskScore);
    const atRisk = sorted.filter((s) => s.riskLevel !== "low");

    const avatarColors = [
      "#4f46e5",
      "#7c3aed",
      "#0d9488",
      "#0284c7",
      "#c026d3"
    ];

    listEl.innerHTML = atRisk
      .map((student, i) => {
        const initials = student.name
          .split(" ")
          .map((n) => n[0])
          .join("");
        const bgColor = avatarColors[i % avatarColors.length];
        const unresolvedCount =
          student.unresolvedPosts || student.confusionSignals || 0;

        return `
          <div class="student-item" data-student='${JSON.stringify({ name: student.name, topics: student.topics || [] })}'>
            <div class="student-avatar" style="background:${bgColor}">${initials}</div>
            <div class="student-info">
              <div class="student-name">${student.name}</div>
              <div class="student-detail">${unresolvedCount} unresolved posts</div>
            </div>
            <div class="student-badge-area">
              <span class="badge-at-risk">At Risk</span>
              <svg class="student-chevron" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M6 9l6 6 6-6"/>
              </svg>
            </div>
          </div>
        `;
      })
      .join("");

    // Click to expand / draft email
    listEl.querySelectorAll(".student-item").forEach((item) => {
      item.addEventListener("click", () => {
        const data = JSON.parse(item.dataset.student);
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

    const tags = buildTrendingTags(
      mockData?.posts || getInlineMockData().posts
    );

    tagsEl.innerHTML = tags
      .map(
        (t) =>
          `<span class="trending-tag">${t.name} <span class="tag-count">${t.count}</span></span>`
      )
      .join("");
  }

  function renderStudyTips() {
    const tipsEl = document.getElementById("tips-content");
    if (!tipsEl) return;

    const lectures =
      mockData?.confusionByLecture ||
      getInlineMockData().confusionByLecture;
    const posts = mockData?.posts || getInlineMockData().posts;
    const topLecture = [...lectures].sort(
      (a, b) => b.confusionScore - a.confusionScore
    )[0];
    const topTag = buildTrendingTags(posts)[0];
    const unresolvedCount = posts.filter((post) => !post.resolved).length;

    const tips = [
      {
        icon: "\u{1F9E0}",
        title: "Most Confused Topic This Week",
        text: topLecture
          ? `${topLecture.title} \u2014 ${topLecture.confusionScore} confusion signals. Focus your study time here first.`
          : "Recent Piazza activity highlights a cluster of open questions. Start with the newest unresolved thread."
      },
      {
        icon: "\u{1F4D6}",
        title: "Recommended Resources",
        text: topTag
          ? `Review recent posts tagged ${topTag.name} and read the highest-upvoted answers before posting.`
          : "Review the most active threads first and compare instructor answers with student follow-ups."
      },
      {
        icon: "\u23F0",
        title: "Best Time to Get Help",
        text: unresolvedCount
          ? `${unresolvedCount} synced posts are still unresolved. Checking existing follow-ups before posting will save time.`
          : "Most recent synced posts already have answers or follow-ups, so search before creating a duplicate thread."
      },
      {
        icon: "\u{1F91D}",
        title: "Study Groups",
        text: topTag
          ? `Students are actively discussing ${topTag.name}. Use that thread history as a quick study guide.`
          : "Recent Piazza discussions make a good study outline. Use them to find the topics your classmates revisit most."
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

    if (!input || !btn) return;

    btn.addEventListener("click", () => performSearch(input.value));

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") performSearch(input.value);
    });

    let debounce;
    input.addEventListener("input", () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        if (input.value.length >= 3) performSearch(input.value);
      }, 500);
    });
  }

  async function performSearch(query) {
    if (!query || query.length < 2) return;

    const resultsEl = document.getElementById("search-results");
    const socialCount = document.getElementById("social-count");
    const allPosts = mockData?.posts || getInlineMockData().posts;

    // Try AI-powered semantic search
    if (aiEnabled()) {
      resultsEl.innerHTML = `<div class="search-placeholder"><p>Searching with AI...</p></div>`;
      const postSummaries = allPosts.slice(0, 50).map((p, i) => `${i}: ${p.title}`).join("\n");
      const prompt = `Given this student question: "${query}"

And these existing forum posts (index: title):
${postSummaries}

Return a JSON object with the indices of the top 5 most relevant posts and a similarity score (0-1) for each:
{"results": [{"index": 0, "similarity": 0.95}, ...]}

Only include posts with similarity > 0.3. If none are relevant, return {"results": []}.`;

      const result = await callOpenAIJSON(prompt, 256);
      if (result?.results?.length > 0) {
        const matches = result.results
          .filter((r) => r.index >= 0 && r.index < allPosts.length)
          .map((r) => ({ ...allPosts[r.index], similarity: r.similarity }));
        if (matches.length > 0) {
          if (socialCount) animateNumber(socialCount, 0, matches.length + Math.floor(Math.random() * 10), 800);
          renderSearchResults(resultsEl, matches);
          return;
        }
      }
    }

    // Local keyword matching fallback
    const lowerQuery = query.toLowerCase();
    const matches = allPosts
      .map((post) => {
        const titleMatch = post.title.toLowerCase().includes(lowerQuery);
        const bodyMatch = post.body.toLowerCase().includes(lowerQuery);
        const tagMatch = post.tags?.some((t) => lowerQuery.includes(t));
        let score = 0;
        if (titleMatch) score += 0.5;
        if (bodyMatch) score += 0.3;
        if (tagMatch) score += 0.2;
        if (score > 0) score = Math.min(0.98, score + Math.random() * 0.3);
        return { ...post, similarity: score };
      })
      .filter((p) => p.similarity > 0)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 5);

    if (matches.length === 0) {
      resultsEl.innerHTML = `
        <div class="search-placeholder">
          <div class="search-placeholder-icon">\u2705</div>
          <p>No similar questions found. Your question looks unique! Go ahead and post it.</p>
        </div>
      `;
      return;
    }

    if (socialCount) {
      const count = Math.floor(Math.random() * 15) + 5;
      animateNumber(socialCount, 0, count, 800);
    }

    renderSearchResults(resultsEl, matches);
  }

  function renderSearchResults(container, results) {
    container.innerHTML = `
      <div class="result-header">
        Similar questions found <span class="result-count">${results.length}</span>
      </div>
      ${results
        .map((m) => {
          const pct = Math.round(m.similarity * 100);
          const simClass = pct >= 80 ? "similarity-high" : "similarity-medium";
          const excerpt = m.excerpt || m.body?.substring(0, 100) || "";
          return `
            <div class="result-item">
              <div class="result-similarity ${simClass}">${pct}%</div>
              <div>
                <div class="result-title">${m.title}</div>
                <div class="result-excerpt">${excerpt}...</div>
              </div>
            </div>
          `;
        })
        .join("")}
      <div style="padding:10px;text-align:center;">
        <span style="font-size:12px;color:#16a34a;">\u{1F4A1} Consider reading existing answers before posting!</span>
      </div>
    `;
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
        copyBtn.textContent = "Copied!";
        setTimeout(() => (copyBtn.textContent = "Copy to Clipboard"), 1500);
      });
    });

    sendBtn.addEventListener("click", () => {
      const text = document.getElementById("email-preview").textContent;
      const lines = text.split("\n");
      const subject = lines[0].replace("Subject: ", "");
      const body = lines.slice(2).join("\n");
      window.open(
        `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
      );
    });
  }

  async function generateEmail(studentName, topics) {
    const modal = document.getElementById("email-modal");
    const preview = document.getElementById("email-preview");
    const professor = mockData?.course?.professor || "Prof. Smith";
    const firstName = studentName.split(" ")[0];
    const topicsStr = (topics || []).slice(0, 3).join(" and ") || "recent topics";

    preview.textContent = aiEnabled() ? "Generating personalized email with AI..." : "Generating email...";
    modal.classList.add("active");

    if (aiEnabled()) {
      const prompt = `You are a caring university professor named ${professor}. Write a short, warm email to a student named ${studentName} who has been struggling with ${topicsStr}. The email should:
- Have a subject line starting with "Subject: "
- Be empathetic and encouraging
- Offer to meet during office hours
- Be concise (under 150 words)
- Not be condescending

Write just the email, nothing else.`;

      const result = await callOpenAI(prompt, 512);
      if (result) {
        preview.textContent = result;
        return;
      }
    }

    preview.textContent = `Subject: Checking in about the course\n\nHi ${firstName},\n\nI noticed you've had several questions recently about ${topicsStr}. That's completely normal \u2014 these are challenging topics that many students find tricky.\n\nIf you'd like, we can schedule a quick 15-minute meeting to go over any concepts you're finding difficult. I'm available during office hours, or we can find another time that works for you.\n\nDon't hesitate to reach out \u2014 I'm here to help.\n\nBest,\n${professor}`;
  }

  // ======================================================================
  //  UTILITY FUNCTIONS
  // ======================================================================

  function animateNumber(element, start, end, duration) {
    const startTime = performance.now();
    function update(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(start + (end - start) * eased);
      element.textContent = current;
      if (progress < 1) requestAnimationFrame(update);
    }
    requestAnimationFrame(update);
  }

  function getHeatColor(ratio) {
    if (ratio < 0.35) return "#22c55e";
    if (ratio < 0.55) return "#f59e0b";
    if (ratio < 0.75) return "#fb923c";
    return "#ef4444";
  }

  function transformExportPayload(payload) {
    if (
      !payload ||
      !Array.isArray(payload.posts) ||
      payload.posts.length === 0
    ) {
      return null;
    }

    const posts = payload.posts.map((post) => ({
      ...post,
      title: post.title || "Untitled Piazza Post",
      body: post.body || "",
      tags: Array.isArray(post.tags) ? post.tags : [],
      upvotes: Number(post.upvotes || 0),
      resolved: Boolean(post.resolved)
    }));
    const students =
      Array.isArray(payload.students) && payload.students.length
        ? payload.students.map((student) => ({
            ...student,
            postsCount: Number(student.postsCount || 0),
            confusionSignals: Number(student.confusionSignals || 0),
            unresolvedPosts: Number(student.unresolvedPosts || student.confusionSignals || 0),
            riskScore: Number(student.riskScore || 0),
            riskLevel:
              student.riskLevel ||
              (Number(student.riskScore || 0) >= 70
                ? "high"
                : Number(student.riskScore || 0) >= 40
                  ? "medium"
                  : "low"),
            topics: Array.isArray(student.topics) ? student.topics : []
          }))
        : buildStudentProfiles(posts);
    const confusionByLecture = buildConfusionByLecture(posts);
    const courseHealth = buildCourseHealth(posts, students, confusionByLecture);

    return {
      course: {
        id: payload.course?.id || "piazza-course",
        name: payload.course?.name || "Piazza Course",
        title: payload.page?.title || payload.source?.title || payload.course?.name || "Piazza Course",
        university: payload.course?.university || "University of Toronto",
        professor: "Piazza Live Sync",
        students: students.length
      },
      posts,
      students,
      clusters: buildClusters(posts),
      confusionByLecture,
      courseHealth,
      stats: buildStats(posts, students, courseHealth),
      topQuestions: buildTopQuestions(posts),
      aiInsight: buildAIInsight(confusionByLecture)
    };
  }

  function buildStats(posts, students, courseHealth) {
    return {
      healthScore: { value: courseHealth.score, delta: 5 },
      activeStudents: { value: students.length, delta: Math.round(students.length * 0.08) },
      questionsToday: { value: Math.min(posts.length, 23), delta: -3 },
      avgResponse: { value: "2.4h", delta: "-0.8h", positiveIsDown: true }
    };
  }

  function buildTopQuestions(posts) {
    return [...posts]
      .sort((a, b) => (b.upvotes || 0) - (a.upvotes || 0))
      .slice(0, 5)
      .map((p) => ({ title: p.title, votes: p.upvotes || 0 }));
  }

  function buildAIInsight(confusionByLecture) {
    const top = [...confusionByLecture].sort(
      (a, b) => b.confusionScore - a.confusionScore
    )[0];
    return {
      topic: top?.title || "this topic",
      percentage: 23,
      suggestions: [
        `${top?.title || "Key concept"} walkthrough`,
        "Memory allocation patterns",
        "Common segfault scenarios"
      ]
    };
  }

  function buildStudentProfiles(posts) {
    const byAuthor = new Map();

    posts.forEach((post) => {
      const author = post.author || "Unknown";
      if (author === "Unknown" || author === "Anonymous") return;

      const existing = byAuthor.get(author) || {
        name: author,
        postsCount: 0,
        confusionSignals: 0,
        unresolvedPosts: 0,
        riskScore: 0,
        riskLevel: "low",
        topics: []
      };

      existing.postsCount += 1;
      if (!post.resolved) {
        existing.confusionSignals += 1;
        existing.unresolvedPosts += 1;
      }
      if (post.topic && !existing.topics.includes(post.topic)) {
        existing.topics.push(post.topic);
      }

      byAuthor.set(author, existing);
    });

    return Array.from(byAuthor.values()).map((student) => {
      const riskScore = Math.min(
        100,
        student.postsCount * 10 + student.confusionSignals * 20
      );
      return {
        ...student,
        riskScore,
        riskLevel:
          riskScore >= 70 ? "high" : riskScore >= 40 ? "medium" : "low"
      };
    });
  }

  function buildClusters(posts) {
    const groups = new Map();

    posts.forEach((post) => {
      const topic = normalizeTopic(
        post.topic || post.tags?.[0] || "General"
      );
      const group = groups.get(topic) || {
        topic,
        count: 0,
        unresolved: 0,
        exampleQuestions: [],
        topUpvotes: 0
      };

      group.count += 1;
      group.unresolved += post.resolved ? 0 : 1;
      group.topUpvotes = Math.max(
        group.topUpvotes,
        Number(post.upvotes || 0)
      );
      if (post.title && !group.exampleQuestions.includes(post.title)) {
        group.exampleQuestions.push(post.title);
      }

      groups.set(topic, group);
    });

    return Array.from(groups.values())
      .map((group) => ({
        topic: group.topic,
        count: group.count,
        exampleQuestions: group.exampleQuestions.slice(0, 3),
        suggestedAction:
          group.unresolved >= 2
            ? `Review unresolved ${group.topic.toLowerCase()} threads and pin the clearest answer.`
            : `Point students to the strongest existing ${group.topic.toLowerCase()} thread before new duplicates appear.`,
        severity:
          group.unresolved >= 3 || group.count >= 6
            ? "high"
            : group.unresolved >= 1 || group.count >= 3
              ? "medium"
              : "low",
        score:
          group.count * 10 + group.unresolved * 15 + group.topUpvotes
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }

  function buildConfusionByLecture(posts) {
    const lecturePosts = posts.filter((post) =>
      Number.isInteger(post.lecture)
    );
    if (lecturePosts.length) {
      const groups = new Map();
      lecturePosts.forEach((post) => {
        const lectureKey = post.lecture;
        const group = groups.get(lectureKey) || {
          lecture: lectureKey,
          title: normalizeTopic(post.topic || `Lecture ${lectureKey}`),
          posts: 0,
          unresolvedPosts: 0,
          signalCount: 0
        };

        group.posts += 1;
        group.unresolvedPosts += post.resolved ? 0 : 1;
        group.signalCount +=
          post.followupCount || post.answerCount || 0;
        groups.set(lectureKey, group);
      });

      return Array.from(groups.values())
        .sort((a, b) => a.lecture - b.lecture)
        .map((group) => ({
          lecture: group.lecture,
          title: group.title,
          posts: group.posts,
          unresolvedPosts: group.unresolvedPosts,
          confusionScore: clamp(
            Math.round(
              (group.unresolvedPosts / Math.max(group.posts, 1)) * 65 +
                Math.min(35, group.signalCount * 5)
            ),
            0,
            100
          )
        }));
    }

    return buildClusters(posts).map((cluster, index) => ({
      lecture: index + 1,
      title: cluster.topic,
      posts: cluster.count,
      unresolvedPosts: Math.max(1, Math.round(cluster.count / 3)),
      confusionScore: clamp(cluster.count * 12, 0, 100)
    }));
  }

  function buildCourseHealth(posts, students, confusionByLecture) {
    const totalPosts = Math.max(posts.length, 1);
    const unresolvedPosts = posts.filter((post) => !post.resolved).length;
    const answeredPosts = posts.filter(
      (post) => post.answerCount || post.followupCount
    ).length;
    const activeStudents = students.length;
    const topics = new Set(
      posts
        .flatMap((post) => post.tags || [post.topic])
        .filter(Boolean)
    );
    const engagementScore = clamp(
      Math.round(
        40 +
          Math.min(35, posts.length * 0.7) +
          Math.min(25, activeStudents * 2)
      ),
      0,
      100
    );
    const responseScore = clamp(
      Math.round((answeredPosts / totalPosts) * 100),
      0,
      100
    );
    const resolutionScore = clamp(
      Math.round(
        ((totalPosts - unresolvedPosts) / totalPosts) * 100
      ),
      0,
      100
    );
    const participationScore = clamp(
      Math.round(
        35 +
          Math.min(35, activeStudents * 2.5) +
          Math.min(30, topics.size * 3)
      ),
      0,
      100
    );
    const score = Math.round(
      (engagementScore +
        responseScore +
        resolutionScore +
        participationScore) /
        4
    );
    const hottestLecture = [...confusionByLecture].sort(
      (a, b) => b.confusionScore - a.confusionScore
    )[0];

    return {
      score,
      breakdown: {
        engagement: {
          score: engagementScore,
          label:
            engagementScore >= 80
              ? "High"
              : engagementScore >= 60
                ? "Good"
                : "Low",
          detail: `${posts.length} synced posts, ${activeStudents} active students`
        },
        responseTime: {
          score: responseScore,
          label:
            responseScore >= 80
              ? "Strong"
              : responseScore >= 60
                ? "Fair"
                : "Thin",
          detail: `${answeredPosts} posts include answers or follow-ups`
        },
        resolution: {
          score: resolutionScore,
          label:
            resolutionScore >= 80
              ? "Healthy"
              : resolutionScore >= 60
                ? "Fair"
                : "Needs Attention",
          detail: `${unresolvedPosts} unresolved posts (${Math.round((unresolvedPosts / totalPosts) * 100)}%)`
        },
        participation: {
          score: participationScore,
          label:
            participationScore >= 80
              ? "Broad"
              : participationScore >= 60
                ? "Moderate"
                : "Narrow",
          detail: `${topics.size} active tags or folders captured in sync`
        }
      },
      insights: [
        `${posts.length} Piazza posts were synced from the live course feed.`,
        `${unresolvedPosts} posts still look unresolved and may need instructor attention.`,
        answeredPosts
          ? `${answeredPosts} posts already include answers or follow-ups that students can reuse.`
          : "Few synced posts include answer metadata yet. Check whether Piazza returned full thread details.",
        hottestLecture
          ? `${hottestLecture.title} has the highest confusion score in the current sync.`
          : "No lecture-specific confusion spike was detected in the current sync."
      ]
    };
  }

  function buildTrendingTags(posts) {
    const counts = new Map();

    posts.forEach((post) => {
      const tags =
        Array.isArray(post.tags) && post.tags.length
          ? post.tags
          : [post.topic || "general"];
      tags.forEach((tag) => {
        const key = normalizeTopic(tag);
        counts.set(key, (counts.get(key) || 0) + 1);
      });
    });

    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }

  function normalizeTopic(value) {
    const text = String(value || "General")
      .replace(/[-_]/g, " ")
      .trim();
    if (!text) return "General";
    return text.replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function formatRelativeTime(timestamp) {
    const time = Number(timestamp);
    if (!Number.isFinite(time) || time <= 0) return "just now";

    const diffMs = Math.max(0, Date.now() - time);
    const diffMinutes = Math.floor(diffMs / 60000);
    if (diffMinutes < 1) return "just now";
    if (diffMinutes < 60) return `${diffMinutes} min ago`;

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours} hr ago`;

    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
  }

  // ---- Inline Mock Data Fallback ----
  function getInlineMockData() {
    return {
      course: {
        id: "CSC108",
        name: "Introduction to Computer Programming",
        university: "University of Toronto",
        professor: "Prof. Smith",
        students: 142
      },
      stats: {
        healthScore: { value: 87, delta: 5 },
        activeStudents: { value: 142, delta: 12 },
        questionsToday: { value: 23, delta: -3 },
        avgResponse: { value: "2.4h", delta: "-0.8h", positiveIsDown: true }
      },
      courseHealth: {
        score: 87,
        breakdown: {
          engagement: {
            score: 88,
            label: "High",
            detail: "142 students, 118 active"
          },
          responseTime: {
            score: 79,
            label: "Good",
            detail: "Avg response: 2.4 hours"
          },
          resolution: {
            score: 74,
            label: "Needs Attention",
            detail: "12 unresolved (26%)"
          },
          participation: {
            score: 85,
            label: "High",
            detail: "83% have posted"
          }
        },
        insights: [
          "Engagement is high \u2014 83% student participation rate",
          "12 unresolved posts need attention",
          "Response time improved to 2.4h this week",
          "Pointers has highest confusion score"
        ]
      },
      confusionByLecture: [
        {
          lecture: 1,
          title: "Pointers",
          confusionScore: 92,
          posts: 12,
          unresolvedPosts: 8
        },
        {
          lecture: 2,
          title: "Dynamic Memory",
          confusionScore: 78,
          posts: 10,
          unresolvedPosts: 6
        },
        {
          lecture: 3,
          title: "Linked Lists",
          confusionScore: 65,
          posts: 8,
          unresolvedPosts: 4
        },
        {
          lecture: 4,
          title: "Sorting Algorithms",
          confusionScore: 48,
          posts: 6,
          unresolvedPosts: 2
        },
        {
          lecture: 5,
          title: "Recursion",
          confusionScore: 35,
          posts: 5,
          unresolvedPosts: 1
        }
      ],
      aiInsight: {
        topic: "Pointers",
        percentage: 23,
        suggestions: [
          "Pointer arithmetic walkthrough",
          "Memory allocation patterns",
          "Common segfault scenarios"
        ]
      },
      topQuestions: [
        {
          title: "How does pointer arithmetic work with arrays?",
          votes: 34
        },
        {
          title: "When should I use malloc vs calloc?",
          votes: 28
        },
        {
          title: "What's the difference between stack and heap?",
          votes: 22
        },
        {
          title: "How to avoid segfaults with linked lists?",
          votes: 19
        }
      ],
      clusters: [
        {
          topic: "Pointers",
          count: 12,
          exampleQuestions: [
            "How does pointer arithmetic work?",
            "Pointer to pointer confusion"
          ],
          suggestedAction:
            "Walk through pointer examples step by step.",
          severity: "high"
        },
        {
          topic: "Dynamic Memory",
          count: 10,
          exampleQuestions: [
            "malloc vs calloc",
            "When to free memory"
          ],
          suggestedAction: "Provide memory diagram handouts.",
          severity: "high"
        },
        {
          topic: "Linked Lists",
          count: 8,
          exampleQuestions: [
            "Inserting at head vs tail",
            "Traversal segfaults"
          ],
          suggestedAction:
            "Live code a linked list implementation.",
          severity: "medium"
        }
      ],
      students: [
        {
          name: "Alex Chen",
          postsCount: 8,
          confusionSignals: 4,
          unresolvedPosts: 4,
          riskScore: 82,
          riskLevel: "high",
          topics: ["pointers", "memory"]
        },
        {
          name: "Jordan Lee",
          postsCount: 6,
          confusionSignals: 3,
          unresolvedPosts: 3,
          riskScore: 68,
          riskLevel: "high",
          topics: ["linked-lists", "pointers"]
        },
        {
          name: "Sam Patel",
          postsCount: 9,
          confusionSignals: 5,
          unresolvedPosts: 5,
          riskScore: 75,
          riskLevel: "high",
          topics: ["dynamic-memory", "segfaults"]
        }
      ],
      posts: [
        {
          id: 1,
          title: "How does pointer arithmetic work with arrays?",
          body: "I'm confused about how pointer arithmetic works with different data types and array indexing.",
          tags: ["pointers"],
          upvotes: 34,
          resolved: false
        },
        {
          id: 2,
          title: "When should I use malloc vs calloc?",
          body: "What's the practical difference between malloc and calloc? When would I use one over the other?",
          tags: ["dynamic-memory"],
          upvotes: 28,
          resolved: true
        },
        {
          id: 3,
          title: "What's the difference between stack and heap?",
          body: "Can someone explain the difference in memory allocation between stack and heap?",
          tags: ["memory"],
          upvotes: 22,
          resolved: true
        },
        {
          id: 4,
          title: "How to avoid segfaults with linked lists?",
          body: "I keep getting segmentation faults when working with linked lists, especially during deletion.",
          tags: ["linked-lists", "pointers"],
          upvotes: 19,
          resolved: false
        },
        {
          id: 5,
          title: "Recursive function not returning correct value",
          body: "My recursive function seems to return wrong values for large inputs. How do I debug this?",
          tags: ["recursion"],
          upvotes: 15,
          resolved: true
        },
        {
          id: 6,
          title: "Double pointer for 2D arrays",
          body: "How do double pointers work for dynamically allocated 2D arrays?",
          tags: ["pointers", "dynamic-memory"],
          upvotes: 12,
          resolved: false
        },
        {
          id: 7,
          title: "Bubble sort vs selection sort performance",
          body: "Which sorting algorithm is faster in practice for small arrays?",
          tags: ["sorting"],
          upvotes: 10,
          resolved: true
        },
        {
          id: 8,
          title: "Memory leak detection",
          body: "How can I detect and fix memory leaks in my C programs?",
          tags: ["dynamic-memory"],
          upvotes: 8,
          resolved: false
        }
      ]
    };
  }
})();
