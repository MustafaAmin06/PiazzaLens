// ============================================================
// Piazza AI — Dashboard Logic
// Powers all dashboard panels and API calls
// ============================================================

(function () {
  "use strict";

  const log = globalThis.PiazzaLogger.create("Dashboard");

  // ---- State ----
  let currentRole = "professor";
  let dashboardData = null;
  let dataMode = "empty";
  let backendApiKey = "";

  // ---- Backend Client ----
  const BACKEND_URL = "https://lovely-wonder-production-45ea.up.railway.app";

  function aiEnabled() {
    return Boolean(backendApiKey);
  }

  async function callBackend(endpoint, payload) {
    if (!aiEnabled()) {
      return null;
    }

    try {
      log.info("Calling backend endpoint", { endpoint, posts: payload?.posts?.length || 0 });
      const res = await fetch(`${BACKEND_URL}/api/${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": backendApiKey
        },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        log.warn("Backend returned non-OK status", { endpoint, status: res.status });
        return null;
      }
      const data = await res.json();
      if (data?.error) {
        log.warn("Backend returned AI fallback payload", { endpoint, error: data.error });
        return null;
      }

      log.info("Backend endpoint succeeded", { endpoint });
      return data.error ? null : data;
    } catch (err) {
      log.warn("Backend call failed", { endpoint, error: err.message });
      return null;
    }
  }

  // ---- Initialize ----
  document.addEventListener("DOMContentLoaded", async () => {
    updateAIBadge();
    setupTabNavigation();
    setupSearch();
    setupEmailModal();
    setupCloseButton();
    setupFooterButtons();
    listenForMessages();
    listenForStorageChanges();
    loadDashboardData();
  });

  function updateAIBadge() {
    const badge = document.getElementById("ai-badge");
    if (!badge) return;
    badge.textContent = aiEnabled() ? "GPT-4o mini" : "Local analysis";
    badge.style.opacity = "1";
  }

  function loadDashboardData() {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(["lastPiazzaExport", "backendApiKey"], ({ lastPiazzaExport, backendApiKey: storedApiKey }) => {
        backendApiKey = String(storedApiKey || "").trim();
        updateAIBadge();
        const liveData = transformExportPayload(lastPiazzaExport?.payload);
        if (liveData) {
          dashboardData = liveData;
          dataMode = "live";
          log.info("Loaded dashboard data in live mode", { fetchedAt: lastPiazzaExport?.fetchedAt || null });
          applyDashboardDataMode(lastPiazzaExport?.fetchedAt);
          renderProfessorView();
          renderStudentView();
          return;
        }

        dashboardData = null;
        dataMode = "empty";
        log.info("No live export found, rendering empty dashboard state");
        applyDashboardDataMode();
        renderProfessorView();
        renderStudentView();
      });
      return;
    }

    log.info("Chrome storage unavailable, rendering empty dashboard state");
    dashboardData = null;
    dataMode = "empty";
    applyDashboardDataMode();
    renderProfessorView();
    renderStudentView();
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
    const externalBtn = document.getElementById("btn-external");

    if (externalBtn) {
      externalBtn.addEventListener("click", () => {
        window.open("https://piazza.com", "_blank");
      });
    }
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
      if (areaName !== "local") {
        return;
      }

      if (changes.backendApiKey) {
        backendApiKey = String(changes.backendApiKey.newValue || "").trim();
        updateAIBadge();
      }

      if (!changes.lastPiazzaExport) {
        return;
      }

      const liveData = transformExportPayload(changes.lastPiazzaExport.newValue?.payload);
      if (!liveData) {
        dashboardData = null;
        dataMode = "empty";
        applyDashboardDataMode();
        renderProfessorView();
        renderStudentView();
        return;
      }

      dashboardData = liveData;
      dataMode = "live";
      applyDashboardDataMode(changes.lastPiazzaExport.newValue?.fetchedAt);
      renderProfessorView();
      renderStudentView();
    });
  }

  function applyDashboardDataMode(fetchedAt) {
    const courseInfo = document.getElementById("course-info");
    const syncStatus = document.getElementById("sync-status");
    const course = dashboardData?.course;

    if (courseInfo) {
      if (course) {
        const parts = [course.university, resolveCourseDisplayName(course)].filter(Boolean);
        courseInfo.textContent = parts.join(" \u00B7 ") || "Piazza Course";
      } else {
        courseInfo.textContent = "No course synced";
      }
    }

    if (syncStatus) {
      if (dataMode === "live" && fetchedAt) {
        syncStatus.textContent = `Connected to Piazza \u00B7 Synced ${formatRelativeTime(fetchedAt)}`;
      } else {
        syncStatus.textContent = "Not synced yet";
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
    const posts = dashboardData?.posts || [];

    // These always use local computation
    renderStatCards(null);
    renderHeatmap(null);
    renderStudents(null);

    // AI Insight — try LLM, fall back to local
    renderAIInsight(null);
    if (aiEnabled() && posts.length > 0) {
      fetchAIInsight(posts);
    }

    // Question Clusters — try LLM, fall back to local
    renderMostAskedQuestions(null);
    if (aiEnabled() && posts.length > 0) {
      fetchAIClusters(posts);
    }
  }

  async function fetchAIInsight(posts) {
    const sample = posts.slice(0, 30).map((p) => ({
      title: p.title,
      resolved: !!p.resolved,
      topic: p.topic || "general"
    }));
    const result = await callBackend("insight", { posts: sample });
    if (!result?.topic) {
      log.warn("AI insight unavailable, keeping local fallback content");
      return;
    }

    if (result?.topic) {
      const contentEl = document.getElementById("insight-content");
      if (!contentEl) return;
      log.info("Rendered AI insight", { topic: result.topic, suggestions: result.suggestions?.length || 0 });
      contentEl.innerHTML = `
        <p class="insight-text">
          Students are struggling most with <span class="topic-highlight">${escapeHtml(result.topic)}</span> this week.
          Confusion increased <span class="pct-highlight">${escapeHtml(String(result.percentage))}%</span> since last lecture.
        </p>
        <div class="suggested-focus">
          <div class="suggested-focus-header">&#x1F4A1; SUGGESTED LECTURE FOCUS</div>
          <ul>${(result.suggestions || []).map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ul>
        </div>
      `;
    }
  }

  async function fetchAIClusters(posts) {
    const sample = posts.slice(0, 50).map((p) => ({
      title: p.title,
      tags: p.tags || [],
      topic: p.topic || "none"
    }));
    const result = await callBackend("clusters", { posts: sample });
    if (!result?.clusters?.length) {
      log.warn("AI clusters unavailable, keeping local fallback content");
      return;
    }

    if (result?.clusters?.length) {
      const listEl = document.getElementById("question-list");
      if (!listEl) return;
      log.info("Rendered AI clusters", { clusters: result.clusters.length });
      listEl.innerHTML = result.clusters.map((c) => `
        <div class="question-item">
          <div>
            <span class="question-title">${escapeHtml(c.topic)}</span>
            <div style="font-size:11px;color:#64748b;margin-top:4px">${escapeHtml(c.suggestedAction || "")}</div>
          </div>
          <span class="question-votes">
            <span class="fire">&#x1F525;</span>
            <strong>${escapeHtml(String(c.count))}</strong>
          </span>
        </div>
      `).join("");
    }
  }

  // ---- Stat Cards ----
  function renderStatCards(apiData) {
    const health = apiData || dashboardData?.courseHealth || null;
    const stats = dashboardData?.stats || null;
    const gridEl = document.getElementById("stat-grid");
    if (!gridEl) return;

    const cards = [
      {
        label: "HEALTH SCORE",
        value: health?.score ?? "\u2014",
        delta: null,
        positiveIsDown: false
      },
      {
        label: "ACTIVE STUDENTS",
        value: stats?.activeStudents?.value ?? "\u2014",
        delta: null,
        positiveIsDown: false
      },
      {
        label: "SYNCED POSTS",
        value: stats?.syncedPosts?.value ?? "\u2014",
        delta: null,
        positiveIsDown: false
      },
      {
        label: "ANSWER COVERAGE",
        value: stats?.answerCoverage?.value ?? "\u2014",
        delta: null,
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
        const deltaStr = card.delta == null
          ? null
          :
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
              <span class="stat-value">${escapeHtml(String(card.value))}</span>
              ${deltaStr == null ? "" : `<span class="stat-trend ${trendClass}">`}
                <span class="stat-trend-icon">${isPositive ? trendUpSvg : trendDownSvg}</span>
                ${deltaStr == null ? "" : escapeHtml(String(deltaStr))}
              ${deltaStr == null ? "" : "</span>"}
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
      dashboardData?.confusionByLecture ||
      [];
    const heatmapEl = document.getElementById("heatmap");
    if (!heatmapEl) return;

    if (!lectures.length) {
      heatmapEl.innerHTML = renderEmptyState("Sync Piazza data to see where confusion is accumulating across topics.");
      return;
    }

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
            <span class="heatmap-label">${escapeHtml(item.title)}</span>
            <div class="heatmap-bar-container">
              <div class="heatmap-bar" style="width:0%;background:${barColor}" data-target-width="${escapeHtml(String(score))}%"></div>
            </div>
            <span class="heatmap-score" style="color:${scoreColor}">${escapeHtml(String(score))}</span>
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
      dashboardData?.confusionByLecture ||
      [];
    const insight = dashboardData?.aiInsight || null;
    const contentEl = document.getElementById("insight-content");
    if (!contentEl) return;

    if (!lectures.length) {
      contentEl.innerHTML = renderEmptyState("Sync Piazza data to generate course-level insight.");
      return;
    }

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
        Students are struggling most with <span class="topic-highlight">${escapeHtml(topic)}</span> this week.
        Confusion increased <span class="pct-highlight">${escapeHtml(String(pct))}%</span> since last lecture.
      </p>
      <div class="suggested-focus">
        <div class="suggested-focus-header">
          &#x1F4A1; SUGGESTED LECTURE FOCUS
        </div>
        <ul>
          ${suggestions.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}
        </ul>
      </div>
    `;
  }

  // ---- Most Asked Questions ----
  function renderMostAskedQuestions(apiData) {
    const topQuestions =
      dashboardData?.topQuestions || [];
    const listEl = document.getElementById("question-list");
    if (!listEl) return;

    if (!topQuestions.length) {
      listEl.innerHTML = renderEmptyState("No synced questions yet. Run a Piazza sync to populate this list.");
      return;
    }

    // If API returned clusters, we could derive questions from them
    // For now, use topQuestions data
    listEl.innerHTML = topQuestions
      .map(
        (q) => `
        <div class="question-item">
          <span class="question-title">${escapeHtml(q.title)}</span>
          <span class="question-votes">
            <span class="fire">&#x1F525;</span>
            <strong>${escapeHtml(String(q.votes))}</strong>
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
      dashboardData?.students ||
      [];
    const listEl = document.getElementById("student-list");
    if (!listEl) return;

    // Sort by risk score descending
    const sorted = [...students].sort((a, b) => b.riskScore - a.riskScore);
    const atRisk = sorted.filter((s) => s.riskLevel !== "low");

    if (!atRisk.length) {
      listEl.innerHTML = renderEmptyState(students.length
        ? "No students currently meet the at-risk threshold from the synced data."
        : "Sync Piazza data to identify students who may need follow-up.");
      return;
    }

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
          <div class="student-item" data-student="${escapeAttribute(JSON.stringify({ name: student.name, topics: student.topics || [] }))}">
            <div class="student-avatar" style="background:${bgColor}">${initials}</div>
            <div class="student-info">
              <div class="student-name">${escapeHtml(student.name)}</div>
              <div class="student-detail">${escapeHtml(String(unresolvedCount))} unresolved posts</div>
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
        const data = JSON.parse(decodeAttribute(item.dataset.student));
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
      dashboardData?.posts || []
    );

    if (!tags.length) {
      tagsEl.innerHTML = '<span class="trending-tag">No synced tags yet</span>';
      return;
    }

    tagsEl.innerHTML = tags
      .map(
        (t) =>
          `<span class="trending-tag">${escapeHtml(t.name)} <span class="tag-count">${escapeHtml(String(t.count))}</span></span>`
      )
      .join("");
  }

  function renderStudyTips() {
    const tipsEl = document.getElementById("tips-content");
    if (!tipsEl) return;

    const lectures =
      dashboardData?.confusionByLecture ||
      [];
    const posts = dashboardData?.posts || [];

    if (!posts.length) {
      tipsEl.innerHTML = renderEmptyState("Sync Piazza data to get study guidance based on the current course discussion.");
      return;
    }

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
            <h4>${escapeHtml(tip.title)}</h4>
            <p>${escapeHtml(tip.text)}</p>
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
    const allPosts = dashboardData?.posts || [];

    if (!allPosts.length) {
      if (socialCount) socialCount.textContent = "0";
      resultsEl.innerHTML = renderEmptyState("Sync Piazza data before searching for similar questions.");
      return;
    }

    // Try AI-powered semantic search
    if (aiEnabled()) {
      resultsEl.innerHTML = `<div class="search-placeholder"><p>Searching with AI...</p></div>`;
      const postSummaries = allPosts.slice(0, 50).map((p) => ({ title: p.title }));
      const result = await callBackend("search", { query, posts: postSummaries });
      if (result?.results?.length > 0) {
        const matches = result.results
          .filter((r) => r.index >= 0 && r.index < allPosts.length)
          .map((r) => ({ ...allPosts[r.index], similarity: r.similarity }));
        if (matches.length > 0) {
          if (socialCount) animateNumber(socialCount, 0, matches.length, 800);
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
        if (score > 0) score = Math.min(0.98, score);
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
      animateNumber(socialCount, 0, matches.length, 800);
    }

    renderSearchResults(resultsEl, matches);
  }

  function renderSearchResults(container, results) {
    container.innerHTML = `
      <div class="result-header">
        Similar questions found <span class="result-count">${escapeHtml(String(results.length))}</span>
      </div>
      ${results
        .map((m) => {
          const pct = Math.round(m.similarity * 100);
          const simClass = pct >= 80 ? "similarity-high" : "similarity-medium";
          const excerpt = m.excerpt || m.body?.substring(0, 100) || "";
          return `
            <div class="result-item">
              <div class="result-similarity ${simClass}">${escapeHtml(String(pct))}%</div>
              <div>
                <div class="result-title">${escapeHtml(m.title)}</div>
                <div class="result-excerpt">${escapeHtml(excerpt)}...</div>
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
    const professor = dashboardData?.course?.professor || "Instructor";

    preview.textContent = aiEnabled() ? "Generating personalized email with AI..." : "AI email generation is unavailable until a backend API key is configured.";
    modal.classList.add("active");

    if (!aiEnabled()) {
      return;
    }

    const result = await callBackend("email", {
      studentName,
      topics: (topics || []).slice(0, 3),
      professorName: professor
    });
    if (result?.email) {
      preview.textContent = result.email;
      return;
    }

    preview.textContent = "AI email generation failed. Check the backend configuration and try again.";
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
        university: payload.course?.university || "",
        professor: payload.course?.professor || payload.course?.instructor || "Instructor",
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
    const answeredPosts = posts.filter((post) => post.answerCount || post.followupCount).length;
    const answerCoverage = posts.length
      ? `${Math.round((answeredPosts / posts.length) * 100)}%`
      : "\u2014";

    return {
      healthScore: { value: courseHealth.score },
      activeStudents: { value: students.length },
      syncedPosts: { value: posts.length },
      answerCoverage: { value: answerCoverage }
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
    const percentage = top ? Math.max(5, Math.round(top.confusionScore / 4)) : 0;
    return {
      topic: top?.title || "this topic",
      percentage,
      suggestions: [
        `Review the highest-traffic ${top?.title || "course"} threads in lecture.`,
        "Surface one canonical answer and pin it where possible.",
        "Address the most common unresolved follow-ups before assigning new practice."
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

  // CANONICAL health score formula — popup.js and background.js mirror this logic
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

  function renderEmptyState(message) {
    return `
      <div class="search-placeholder">
        <div class="search-placeholder-icon">&#x1F4CC;</div>
        <p>${escapeHtml(message)}</p>
      </div>
    `;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function escapeAttribute(value) {
    return encodeURIComponent(String(value || ""));
  }

  function decodeAttribute(value) {
    return decodeURIComponent(String(value || ""));
  }
})();
