// ============================================================
// PiazzaLens — Popup Script
// Controls the extension popup UI
// ============================================================

const log = globalThis.PiazzaLogger.create("Popup");

document.addEventListener("DOMContentLoaded", () => {
  // ---- Role Toggle ----
  const btnProfessor = document.getElementById("btn-professor");
  const btnStudent = document.getElementById("btn-student");
  const btnThemeDark = document.getElementById("btn-theme-dark");
  const btnThemeLight = document.getElementById("btn-theme-light");
  const btnExportData = document.getElementById("btn-export-data");
  const popupParams = new URLSearchParams(window.location.search);

  log.info("Popup initialized");
  setupTheme();
  refreshSyncStatus().catch(() => {
    log.debug("Initial sync status refresh failed");
  });

  // Load current role
  chrome.runtime.sendMessage({ action: "GET_ROLE" }, (response) => {
    if (response?.role === "student") {
      btnStudent.classList.add("active");
      btnProfessor.classList.remove("active");
    }
  });

  btnProfessor.addEventListener("click", () => {
    btnProfessor.classList.add("active");
    btnStudent.classList.remove("active");
    chrome.runtime.sendMessage({ action: "SET_ROLE", payload: { role: "professor" } });
  });

  btnStudent.addEventListener("click", () => {
    btnStudent.classList.add("active");
    btnProfessor.classList.remove("active");
    chrome.runtime.sendMessage({ action: "SET_ROLE", payload: { role: "student" } });
  });

  // ---- Open Dashboard ----
  document.getElementById("btn-open-dashboard").addEventListener("click", async () => {
    const tab = await resolvePiazzaTab();
    if (!tab?.id) {
      log.warn("Open dashboard requested without a Piazza tab");
      return;
    }

    chrome.tabs.sendMessage(tab.id, {
      action: "SET_DASHBOARD_STATE",
      payload: { open: true }
    }).catch(() => {
      log.info("Dashboard message failed, reinjecting content scripts", { tabId: tab.id });
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["logger.js", "piazza_api.js", "content.js"]
      }).then(() => {
        chrome.scripting.insertCSS({
          target: { tabId: tab.id },
          files: ["content_inject.css"]
        });
        setTimeout(() => {
          chrome.tabs.sendMessage(tab.id, {
            action: "SET_DASHBOARD_STATE",
            payload: { open: true }
          });
        }, 500);
      });
    });

    if (!popupParams.has("keepOpen")) {
      window.close();
    }
  });

  // ---- Export Visible Piazza Data ----
  btnExportData.addEventListener("click", async () => {
    const defaultLabel = "🔄 Sync Piazza Data";
    let progressTimer = null;

    try {
      log.info("Sync Piazza Data requested");
      setActionState(btnExportData, "⏳ Preparing sync...", "rgba(99, 102, 241, 0.25)", "#c4b5fd");

      const tab = await resolvePiazzaTab();
      if (!tab?.id || !tab.url) {
        throw new Error("No active tab available");
      }

      if (!tab.url.includes("piazza.com")) {
        throw new Error("Open a Piazza page before exporting");
      }

      await ensureContentScript(tab.id);
      progressTimer = startProgressPolling(tab.id, btnExportData);

      const response = await chrome.runtime.sendMessage({
        action: "EXPORT_PIAZZA_DATA",
        payload: {
          tabId: tab.id,
          networkId: extractNetworkId(tab.url)
        }
      });

      if (!response?.success) {
        throw new Error(response?.error || "Export failed");
      }

      const exportResult = response.data || {};
      const exportedCount = exportResult.summary?.postCount || 0;

      if (exportResult.fromCache) {
        log.info("Loaded cached Piazza export", { posts: exportedCount });
        setActionState(btnExportData, `✅ Loaded ${exportedCount} cached posts`, "rgba(34, 197, 94, 0.3)", "#22c55e");
      } else {
        log.info("Completed live Piazza export", { posts: exportedCount });
        setActionState(btnExportData, `✅ Synced ${exportedCount} posts`, "rgba(34, 197, 94, 0.3)", "#22c55e");
      }

      await refreshSyncStatus(tab.url);
    } catch (error) {
      log.warn("Piazza sync failed", error.message);
      setActionState(btnExportData, `❌ ${error.message}`, "rgba(239, 68, 68, 0.3)", "#ef4444");
    } finally {
      if (progressTimer) {
        clearInterval(progressTimer);
      }
    }

    setTimeout(() => {
      resetActionState(btnExportData, defaultLabel);
    }, 2500);
  });

  function setupTheme() {
    chrome.storage.local.get(["theme"], ({ theme }) => {
      applyTheme(theme || "dark");
    });

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === "local" && changes.theme) {
        applyTheme(changes.theme.newValue || "dark");
      }
    });

    btnThemeDark.addEventListener("click", () => {
      chrome.storage.local.set({ theme: "dark" });
    });

    btnThemeLight.addEventListener("click", () => {
      chrome.storage.local.set({ theme: "light" });
    });
  }

  function applyTheme(theme) {
    document.body.dataset.theme = theme;
    btnThemeDark.classList.toggle("active", theme === "dark");
    btnThemeLight.classList.toggle("active", theme === "light");
  }

  async function ensureContentScript(tabId) {
    try {
      await chrome.tabs.sendMessage(tabId, { action: "PING_PIAZZALENS" });
    } catch (error) {
      log.info("Content script missing, injecting dependencies", { tabId });
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["logger.js", "piazza_api.js", "content.js"]
      });
      await chrome.scripting.insertCSS({
        target: { tabId },
        files: ["content_inject.css"]
      });
    }
  }

  function setActionState(button, text, borderColor, color) {
    button.textContent = text;
    button.style.borderColor = borderColor;
    button.style.color = color;
  }

  function resetActionState(button, text) {
    button.textContent = text;
    button.style.borderColor = "";
    button.style.color = "";
  }

  function startProgressPolling(tabId, button) {
    return window.setInterval(async () => {
      try {
        const response = await chrome.tabs.sendMessage(tabId, { action: "GET_EXTRACTION_PROGRESS" });
        const progress = response?.progress;
        if (!progress?.active) {
          return;
        }

        const label = progress.total
          ? `⏳ Fetching ${progress.current}/${progress.total} posts...`
          : `⏳ ${progress.status || "Syncing Piazza data..."}`;
        setActionState(button, label, "rgba(99, 102, 241, 0.25)", "#c4b5fd");
      } catch (error) {
        log.debug("Progress polling skipped due to tab navigation or late response", { tabId });
      }
    }, 500);
  }

  async function refreshSyncStatus(preferredUrl) {
    const statusCourse = document.getElementById("status-course");
    const syncMeta = document.getElementById("sync-meta");
    const statHealth = document.getElementById("stat-health");
    const statPosts = document.getElementById("stat-posts");
    const statUnresolved = document.getElementById("stat-unresolved");
    const statRisk = document.getElementById("stat-risk");
    const tab = await resolvePiazzaTab();
    const tabUrl = preferredUrl || tab?.url || "";
    const networkId = extractNetworkId(tabUrl);

    if (!networkId) {
      statusCourse.textContent = "a Piazza course";
      syncMeta.textContent = "Open a Piazza course page to sync complete posts and metadata.";
      resetSyncStats(statHealth, statPosts, statUnresolved, statRisk);
      return;
    }

    const response = await chrome.runtime.sendMessage({
      action: "GET_CACHED_PIAZZA_DATA",
      payload: { networkId }
    });
    const cached = response?.success ? response.data : null;

    if (!cached?.entry) {
      statusCourse.textContent = "this Piazza course";
      syncMeta.textContent = "No cached sync yet.";
      resetSyncStats(statHealth, statPosts, statUnresolved, statRisk);
      return;
    }

    const entry = cached.entry;
    const summary = entry.summary || {};
    const payload = entry.payload || {};
    const posts = Array.isArray(payload.posts) ? payload.posts : [];
    const students = Array.isArray(payload.students) ? payload.students : [];

    statusCourse.textContent = resolveCourseLabel(summary.courseName || payload.course?.name, payload.course?.id);
    syncMeta.textContent = `Last synced ${formatRelativeTime(entry.fetchedAt)}${cached.fresh ? "" : " · refresh recommended"}`;

    statPosts.textContent = String(summary.postCount || posts.length || 0);
    statUnresolved.textContent = String(countUnresolvedPosts(posts));
    statRisk.textContent = String(countAtRiskStudents(students));
    statHealth.textContent = String(summary.healthScore ?? calculateHealthScore(posts, students));
  }

  function extractNetworkId(url) {
    const match = String(url || "").match(/\/class\/([^/?#]+)/i);
    return match ? match[1] : null;
  }

  function resolveCourseLabel(name, fallbackId) {
    const candidates = [name, fallbackId]
      .map((value) => String(value || "").trim())
      .filter(Boolean);

    const preferred = candidates.find((value) => isLikelyCourseLabel(value));
    return preferred || "this Piazza course";
  }

  function isLikelyCourseLabel(value) {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    if (!text) {
      return false;
    }

    if (text.length > 80) {
      return false;
    }

    if (/^[a-z0-9]{10,}$/i.test(text) && !/[\s_-]/.test(text)) {
      return false;
    }

    if (/[!?]{2,}|\b(on behalf of|welcome to|teaching team|q&a|question answer|instructor note)\b/i.test(text)) {
      return false;
    }

    return text.split(/\s+/).length <= 10;
  }

  function countUnresolvedPosts(posts) {
    return posts.filter((post) => !post?.resolved).length;
  }

  function countAtRiskStudents(students) {
    return students.filter((student) => {
      if (student?.riskLevel && student.riskLevel !== "low") {
        return true;
      }
      return Number(student?.riskScore || 0) >= 40;
    }).length;
  }

  // CANONICAL: keep in sync with buildCourseHealth in dashboard.js
  function calculateHealthScore(posts, students) {
    if (!posts.length) {
      return "\u2014";
    }

    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const totalPosts = Math.max(posts.length, 1);
    const unresolvedPosts = posts.filter((post) => !post?.resolved).length;
    const answeredPosts = posts.filter((post) => post?.answerCount || post?.followupCount).length;
    const activeStudents = students.length;
    const topics = new Set(posts.flatMap((post) => post?.tags || [post?.topic]).filter(Boolean));

    const engagement = clamp(Math.round(40 + Math.min(35, posts.length * 0.7) + Math.min(25, activeStudents * 2)), 0, 100);
    const response = clamp(Math.round((answeredPosts / totalPosts) * 100), 0, 100);
    const resolution = clamp(Math.round(((totalPosts - unresolvedPosts) / totalPosts) * 100), 0, 100);
    const participation = clamp(Math.round(35 + Math.min(35, activeStudents * 2.5) + Math.min(30, topics.size * 3)), 0, 100);

    return Math.round((engagement + response + resolution + participation) / 4);
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

  function resetSyncStats(statHealth, statPosts, statUnresolved, statRisk) {
    statHealth.textContent = "\u2014";
    statPosts.textContent = "\u2014";
    statUnresolved.textContent = "\u2014";
    statRisk.textContent = "\u2014";
  }

  async function resolvePiazzaTab() {
    const explicitTabId = Number.parseInt(popupParams.get("targetTabId") || "", 10);
    if (Number.isFinite(explicitTabId)) {
      try {
        const explicitTab = await chrome.tabs.get(explicitTabId);
        if (explicitTab?.url?.includes("piazza.com")) {
          return explicitTab;
        }
      } catch (error) {
        // Fall through to discovery.
      }
    }

    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTab?.url?.includes("piazza.com")) {
      return activeTab;
    }

    const currentWindowPiazzaTabs = await chrome.tabs.query({
      currentWindow: true,
      url: ["*://*.piazza.com/*"]
    });
    const courseTab = choosePiazzaTab(currentWindowPiazzaTabs);
    if (courseTab) {
      return courseTab;
    }

    const allPiazzaTabs = await chrome.tabs.query({
      url: ["*://*.piazza.com/*"]
    });
    return choosePiazzaTab(allPiazzaTabs);
  }

  function choosePiazzaTab(tabs) {
    if (!Array.isArray(tabs) || tabs.length === 0) {
      return null;
    }

    return tabs.find((tab) => /\/class\//i.test(tab.url || "")) || tabs[0] || null;
  }
});
