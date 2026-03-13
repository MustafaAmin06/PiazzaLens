// ============================================================
// PiazzaLens — Popup Script
// Controls the extension popup UI
// ============================================================

document.addEventListener("DOMContentLoaded", () => {
  // ---- Role Toggle ----
  const btnProfessor = document.getElementById("btn-professor");
  const btnStudent = document.getElementById("btn-student");
  const btnThemeDark = document.getElementById("btn-theme-dark");
  const btnThemeLight = document.getElementById("btn-theme-light");
  const btnExportData = document.getElementById("btn-export-data");

  setupTheme();
  refreshSyncStatus().catch(() => {});

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
  document.getElementById("btn-open-dashboard").addEventListener("click", () => {
    // Send message to toggle dashboard on the active tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: "SET_DASHBOARD_STATE",
          payload: { open: true }
        }).catch(() => {
          // If content script isn't loaded, inject it
          chrome.scripting.executeScript({
            target: { tabId: tabs[0].id },
            files: ["mock_data.js", "piazza_api.js", "content.js"]
          }).then(() => {
            chrome.scripting.insertCSS({
              target: { tabId: tabs[0].id },
              files: ["content_inject.css"]
            });
            // Wait for injection, then open
            setTimeout(() => {
              chrome.tabs.sendMessage(tabs[0].id, {
                action: "SET_DASHBOARD_STATE",
                payload: { open: true }
              });
            }, 500);
          });
        });
      }
    });
    window.close();
  });

  // ---- Export Visible Piazza Data ----
  btnExportData.addEventListener("click", async () => {
    const defaultLabel = "🔄 Sync Piazza Data";
    let progressTimer = null;

    try {
      setActionState(btnExportData, "⏳ Preparing sync...", "rgba(99, 102, 241, 0.25)", "#c4b5fd");

      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
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
        setActionState(btnExportData, `✅ Loaded ${exportedCount} cached posts`, "rgba(34, 197, 94, 0.3)", "#22c55e");
      } else if (exportResult.uploaded) {
        setActionState(btnExportData, `✅ Synced ${exportedCount} posts`, "rgba(34, 197, 94, 0.3)", "#22c55e");
      } else {
        setActionState(btnExportData, `⚠️ Synced ${exportedCount} posts locally`, "rgba(245, 158, 11, 0.3)", "#f59e0b");
      }

      await refreshSyncStatus(tab.url);
    } catch (error) {
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
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["mock_data.js", "piazza_api.js", "content.js"]
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
        // Ignore polling failures when the tab navigates or responds late.
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
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
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

    statusCourse.textContent = summary.courseName || payload.course?.name || "this Piazza course";
    syncMeta.textContent = `Last synced ${formatRelativeTime(entry.fetchedAt)}${cached.fresh ? "" : " · refresh recommended"}`;

    statPosts.textContent = String(summary.postCount || posts.length || 0);
    statUnresolved.textContent = String(countUnresolvedPosts(posts));
    statRisk.textContent = String(countAtRiskStudents(students));
    statHealth.textContent = String(calculateHealthScore(posts, students));
  }

  function extractNetworkId(url) {
    const match = String(url || "").match(/\/class\/([^/?#]+)/i);
    return match ? match[1] : null;
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

  function calculateHealthScore(posts, students) {
    if (!posts.length) {
      return 82;
    }

    const resolvedCount = posts.filter((post) => post?.resolved).length;
    const activeStudents = students.length;
    const engagement = Math.min(100, 35 + Math.round(posts.length * 0.5) + Math.round(activeStudents * 1.5));
    const resolution = Math.round((resolvedCount / posts.length) * 100);
    const participation = Math.min(100, 30 + Math.round(activeStudents * 3) + Math.round(posts.length * 0.2));
    const responseCoverage = Math.min(100, 45 + Math.round(posts.filter((post) => post?.answerCount || post?.followupCount).length * 1.8));
    return Math.round((engagement + resolution + participation + responseCoverage) / 4);
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
    statHealth.textContent = "82";
    statPosts.textContent = "0";
    statUnresolved.textContent = "0";
    statRisk.textContent = "0";
  }
});
