// ============================================================
// PiazzaLens — Dashboard Logic
// Powers all dashboard panels and API calls
// ============================================================

(function () {
  "use strict";

  // ---- State ----
  let currentRole = "professor";
  let currentTheme = "dark";
  let mockData = null;
  let dataMode = "demo";

  // ---- Initialize ----
  document.addEventListener("DOMContentLoaded", () => {
    setupTheme();
    setupTabNavigation();
    setupSearch();
    setupEmailModal();
    setupCloseButton();
    listenForMessages();
    listenForStorageChanges();
    loadDashboardData();
  });

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
    // The mock data is embedded as a global from mock_data.js
    // In the dashboard iframe, we fetch it
    fetch(getExtensionURL("mock_data.js"))
      .then((r) => r.text())
      .then((text) => {
        // Execute to get MOCK_DATA
        const fn = new Function(text + "; return MOCK_DATA;");
        mockData = fn();
        dataMode = "demo";
        applyDashboardDataMode();
        renderProfessorView();
        renderStudentView();
      })
      .catch(() => {
        // Fallback: use inline data
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

  // ---- Theme ----
  function setupTheme() {
    const themeBtn = document.getElementById("btn-theme");
    if (!themeBtn) return;

    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(["theme"], ({ theme }) => {
        applyTheme(theme || "dark");
      });

      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === "local" && changes.theme) {
          applyTheme(changes.theme.newValue || "dark");
        }
      });
    } else {
      applyTheme("dark");
    }

    themeBtn.addEventListener("click", () => {
      const nextTheme = currentTheme === "dark" ? "light" : "dark";
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ theme: nextTheme });
      } else {
        applyTheme(nextTheme);
      }
    });
  }

  function applyTheme(theme) {
    currentTheme = theme;
    document.documentElement.dataset.theme = theme;

    const themeBtn = document.getElementById("btn-theme");
    const themeLabel = theme === "dark" ? "Switch to light mode" : "Switch to dark mode";
    const themeIcon = theme === "dark" ? "☀️" : "🌙";

    if (themeBtn) {
      themeBtn.setAttribute("title", themeLabel);
      themeBtn.setAttribute("aria-label", themeLabel);
      themeBtn.innerHTML = `<span class="theme-toggle-icon">${themeIcon}</span>`;
    }
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
    const badge = document.getElementById("data-mode-badge");
    const courseName = document.getElementById("course-name");
    const courseDetail = document.getElementById("course-detail");
    const course = mockData?.course || getInlineMockData().course;

    if (courseName) {
      courseName.textContent = course.name;
    }

    if (courseDetail) {
      if (dataMode === "live") {
        const postCount = Array.isArray(mockData?.posts) ? mockData.posts.length : 0;
        const studentCount = Array.isArray(mockData?.students) ? mockData.students.length : 0;
        const detailParts = [
          `${postCount} synced posts`,
          studentCount ? `${studentCount} active students` : null,
          fetchedAt ? `Updated ${formatRelativeTime(fetchedAt)}` : null
        ].filter(Boolean);
        courseDetail.textContent = detailParts.join(" · ");
      } else {
        courseDetail.textContent = "Demo dataset";
      }
    }

    if (badge) {
      badge.textContent = dataMode === "live" ? "Live" : "Demo";
      badge.className = dataMode === "live" ? "badge badge-green" : "badge badge-purple";
    }
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
        const assignmentDetail = Number.isFinite(student.assignmentsSubmitted) && Number.isFinite(student.assignmentsTotal)
          ? ` · ${student.assignmentsSubmitted}/${student.assignmentsTotal} assignments`
          : "";
        return `
          <div class="student-item" style="animation-delay:${i * 0.1}s">
            <div class="student-avatar risk-${student.riskLevel}">${initials}</div>
            <div class="student-info">
              <div class="student-name">${student.name}</div>
              <div class="student-detail">${student.postsCount} posts · ${student.confusionSignals} confusion signals${assignmentDetail}</div>
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

    const tags = buildTrendingTags(mockData?.posts || getInlineMockData().posts);

    tagsEl.innerHTML = tags
      .map(
        (t) => `<span class="trending-tag">${t.name} <span class="tag-count">${t.count}</span></span>`
      )
      .join("");
  }

  function renderStudyTips() {
    const tipsEl = document.getElementById("tips-content");
    if (!tipsEl) return;

    const lectures = mockData?.confusionByLecture || getInlineMockData().confusionByLecture;
    const posts = mockData?.posts || getInlineMockData().posts;
    const topLecture = [...lectures].sort((a, b) => b.confusionScore - a.confusionScore)[0];
    const topTag = buildTrendingTags(posts)[0];
    const unresolvedCount = posts.filter((post) => !post.resolved).length;

    const tips = [
      {
        icon: "🧠",
        title: "Most Confused Topic This Week",
        text: topLecture
          ? `${topLecture.title} — ${topLecture.confusionScore} confusion signals. Focus your study time here first.`
          : "Recent Piazza activity highlights a cluster of open questions. Start with the newest unresolved thread."
      },
      {
        icon: "📖",
        title: "Recommended Resources",
        text: topTag
          ? `Review recent posts tagged ${topTag.name} and read the highest-upvoted answers before posting.`
          : "Review the most active threads first and compare instructor answers with student follow-ups."
      },
      {
        icon: "⏰",
        title: "Best Time to Get Help",
        text: unresolvedCount
          ? `${unresolvedCount} synced posts are still unresolved. Checking existing follow-ups before posting will save time.`
          : "Most recent synced posts already have answers or follow-ups, so search before creating a duplicate thread."
      },
      {
        icon: "🤝",
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

  function transformExportPayload(payload) {
    if (!payload || !Array.isArray(payload.posts) || payload.posts.length === 0) {
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
    const students = Array.isArray(payload.students) && payload.students.length
      ? payload.students.map((student) => ({
          ...student,
          postsCount: Number(student.postsCount || 0),
          confusionSignals: Number(student.confusionSignals || 0),
          riskScore: Number(student.riskScore || 0),
          riskLevel: student.riskLevel || (Number(student.riskScore || 0) >= 70 ? "high" : Number(student.riskScore || 0) >= 40 ? "medium" : "low"),
          topics: Array.isArray(student.topics) ? student.topics : []
        }))
      : buildStudentProfiles(posts);
    const confusionByLecture = buildConfusionByLecture(posts);

    return {
      course: {
        id: payload.course?.id || "piazza-course",
        name: payload.course?.name || "Piazza Course",
        professor: "Piazza Live Sync",
        students: students.length,
        tas: []
      },
      posts,
      students,
      clusters: buildClusters(posts),
      confusionByLecture,
      courseHealth: buildCourseHealth(posts, students, confusionByLecture)
    };
  }

  function buildStudentProfiles(posts) {
    const byAuthor = new Map();

    posts.forEach((post) => {
      const author = post.author || "Unknown";
      if (author === "Unknown" || author === "Anonymous") {
        return;
      }

      const existing = byAuthor.get(author) || {
        name: author,
        postsCount: 0,
        confusionSignals: 0,
        riskScore: 0,
        riskLevel: "low",
        topics: []
      };

      existing.postsCount += 1;
      existing.confusionSignals += post.resolved ? 0 : 1;
      if (post.topic && !existing.topics.includes(post.topic)) {
        existing.topics.push(post.topic);
      }

      byAuthor.set(author, existing);
    });

    return Array.from(byAuthor.values()).map((student) => {
      const riskScore = Math.min(100, student.postsCount * 10 + student.confusionSignals * 20);
      return {
        ...student,
        riskScore,
        riskLevel: riskScore >= 70 ? "high" : riskScore >= 40 ? "medium" : "low"
      };
    });
  }

  function buildClusters(posts) {
    const groups = new Map();

    posts.forEach((post) => {
      const topic = normalizeTopic(post.topic || post.tags?.[0] || "General");
      const group = groups.get(topic) || {
        topic,
        count: 0,
        unresolved: 0,
        exampleQuestions: [],
        topUpvotes: 0
      };

      group.count += 1;
      group.unresolved += post.resolved ? 0 : 1;
      group.topUpvotes = Math.max(group.topUpvotes, Number(post.upvotes || 0));
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
        suggestedAction: group.unresolved >= 2
          ? `Review unresolved ${group.topic.toLowerCase()} threads and pin the clearest answer.`
          : `Point students to the strongest existing ${group.topic.toLowerCase()} thread before new duplicates appear.`,
        severity: group.unresolved >= 3 || group.count >= 6 ? "high" : group.unresolved >= 1 || group.count >= 3 ? "medium" : "low",
        score: group.count * 10 + group.unresolved * 15 + group.topUpvotes
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }

  function buildConfusionByLecture(posts) {
    const lecturePosts = posts.filter((post) => Number.isInteger(post.lecture));
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
        group.signalCount += post.followupCount || post.answerCount || 0;
        groups.set(lectureKey, group);
      });

      return Array.from(groups.values())
        .sort((a, b) => a.lecture - b.lecture)
        .map((group) => ({
          lecture: group.lecture,
          title: group.title,
          posts: group.posts,
          unresolvedPosts: group.unresolvedPosts,
          confusionScore: clamp(Math.round((group.unresolvedPosts / Math.max(group.posts, 1)) * 65 + Math.min(35, group.signalCount * 5)), 0, 100)
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
    const answeredPosts = posts.filter((post) => post.answerCount || post.followupCount).length;
    const activeStudents = students.length;
    const topics = new Set(posts.flatMap((post) => post.tags || [post.topic]).filter(Boolean));
    const engagementScore = clamp(Math.round(40 + Math.min(35, posts.length * 0.7) + Math.min(25, activeStudents * 2)), 0, 100);
    const responseScore = clamp(Math.round((answeredPosts / totalPosts) * 100), 0, 100);
    const resolutionScore = clamp(Math.round(((totalPosts - unresolvedPosts) / totalPosts) * 100), 0, 100);
    const participationScore = clamp(Math.round(35 + Math.min(35, activeStudents * 2.5) + Math.min(30, topics.size * 3)), 0, 100);
    const score = Math.round((engagementScore + responseScore + resolutionScore + participationScore) / 4);
    const hottestLecture = [...confusionByLecture].sort((a, b) => b.confusionScore - a.confusionScore)[0];

    return {
      score,
      breakdown: {
        engagement: {
          score: engagementScore,
          label: engagementScore >= 80 ? "High" : engagementScore >= 60 ? "Good" : "Low",
          detail: `${posts.length} synced posts, ${activeStudents} active students`
        },
        responseTime: {
          score: responseScore,
          label: responseScore >= 80 ? "Strong" : responseScore >= 60 ? "Fair" : "Thin",
          detail: `${answeredPosts} posts include answers or follow-ups`
        },
        resolution: {
          score: resolutionScore,
          label: resolutionScore >= 80 ? "Healthy" : resolutionScore >= 60 ? "Fair" : "Needs Attention",
          detail: `${unresolvedPosts} unresolved posts (${Math.round((unresolvedPosts / totalPosts) * 100)}%)`
        },
        participation: {
          score: participationScore,
          label: participationScore >= 80 ? "Broad" : participationScore >= 60 ? "Moderate" : "Narrow",
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
      ],
      trend: confusionByLecture.slice(-6).map((item, index) => ({
        week: `Sync ${index + 1}`,
        score: item.confusionScore
      }))
    };
  }

  function buildTrendingTags(posts) {
    const counts = new Map();

    posts.forEach((post) => {
      const tags = Array.isArray(post.tags) && post.tags.length ? post.tags : [post.topic || "general"];
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
    const text = String(value || "General").replace(/[-_]/g, " ").trim();
    if (!text) {
      return "General";
    }
    return text.replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function formatRelativeTime(timestamp) {
    const time = Number(timestamp);
    if (!Number.isFinite(time) || time <= 0) {
      return "just now";
    }

    const diffMs = Math.max(0, Date.now() - time);
    const diffMinutes = Math.floor(diffMs / 60000);
    if (diffMinutes < 1) {
      return "just now";
    }
    if (diffMinutes < 60) {
      return `${diffMinutes} min ago`;
    }

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) {
      return `${diffHours} hr ago`;
    }

    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
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
