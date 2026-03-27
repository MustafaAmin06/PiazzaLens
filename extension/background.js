// ============================================================
// PiazzaLens — Background Service Worker
// Handles API routing, message passing, and state management
// ============================================================

importScripts("logger.js");

// ---- Configuration ----
const DEFAULT_ROLE = "professor";
const DEFAULT_THEME = "dark";
const CACHE_TTL_MS = 15 * 60 * 1000;
const PIAZZA_CACHE_PREFIX = "piazzaCache:";
const log = globalThis.PiazzaLogger.create("Background");

// ---- State ----
let userRole = DEFAULT_ROLE;

// ---- Initialize ----
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(["userRole", "dashboardOpen", "theme"], (data) => {
    chrome.storage.local.set({
      userRole: data.userRole || DEFAULT_ROLE,
      dashboardOpen: data.dashboardOpen ?? false,
      theme: data.theme || DEFAULT_THEME
    });
  });
  log.info("Extension installed", { role: DEFAULT_ROLE, theme: DEFAULT_THEME });
});

// ---- Message Handler ----
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { action, payload } = message;
  log.debug("Routing message", { action, tabId: sender.tab?.id || null });

  switch (action) {
    case "GET_ROLE":
      chrome.storage.local.get("userRole", (data) => {
        sendResponse({ role: data.userRole || DEFAULT_ROLE });
      });
      return true; // async response

    case "SET_ROLE":
      userRole = payload.role;
      chrome.storage.local.set({ userRole: payload.role });
      log.info("Role updated", { role: payload.role });
      // Notify all tabs of role change
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach((tab) => {
          chrome.tabs.sendMessage(tab.id, {
            action: "ROLE_CHANGED",
            payload: { role: payload.role }
          }).catch(() => {
            log.debug("Skipped role update for tab without receiver", { tabId: tab.id });
          });
        });
      });
      sendResponse({ success: true, role: payload.role });
      return true;

    case "TOGGLE_DASHBOARD":
      chrome.storage.local.get("dashboardOpen", (data) => {
        const newState = !data.dashboardOpen;
        chrome.storage.local.set({ dashboardOpen: newState });
        log.info("Dashboard state toggled", { open: newState, tabId: sender.tab?.id || null });
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
        .catch((err) => {
          log.error("Email generation failed", err.message);
          sendResponse({ success: false, error: err.message });
        });
      return true;

    case "AUTO_SYNC":
      handleAutoSync(payload, sender)
        .then((result) => sendResponse(result))
        .catch((err) => {
          log.error("Auto-sync check failed", err.message);
          sendResponse({ skipped: false, error: err.message });
        });
      return true;

    case "AUTO_SYNC_RESULT":
      handleAutoSyncResult(payload)
        .then((result) => sendResponse({ success: true, data: result }))
        .catch((err) => {
          log.error("Auto-sync result persistence failed", err.message);
          sendResponse({ success: false, error: err.message });
        });
      return true;

    case "EXPORT_PIAZZA_DATA":
      handleExportPiazzaData(payload)
        .then((result) => sendResponse({ success: true, data: result }))
        .catch((err) => {
          log.error("Piazza export failed", err.message);
          sendResponse({ success: false, error: err.message });
        });
      return true;

    case "GET_CACHED_PIAZZA_DATA":
      handleGetCachedPiazzaData(payload)
        .then((result) => sendResponse({ success: true, data: result }))
        .catch((err) => {
          log.error("Cached Piazza data lookup failed", err.message);
          sendResponse({ success: false, error: err.message });
        });
      return true;

    case "INVALIDATE_PIAZZA_CACHE":
      invalidateCache(payload?.networkId)
        .then(() => sendResponse({ success: true }))
        .catch((err) => {
          log.error("Cache invalidation failed", err.message);
          sendResponse({ success: false, error: err.message });
        });
      return true;

    default:
      log.warn("Unknown action received", { action });
      sendResponse({ success: false, error: "Unknown action: " + action });
      return false;
  }
});

// ---- Email Generation ----
async function handleGenerateEmail(payload) {
  log.warn("Background email generation requested after local fallback removal", {
    hasStudentName: Boolean(payload?.studentName),
    topicCount: Array.isArray(payload?.topics) ? payload.topics.length : 0
  });
  throw new Error("Background email fallback has been removed. Use the dashboard AI email flow.");
}

// ---- Auto-Sync ----
async function handleAutoSync(payload, sender) {
  const networkId = payload?.networkId;
  if (!networkId) {
    return { skipped: true, reason: "no_network_id" };
  }

  const cached = await getCachedData(networkId);
  if (cached?.fresh) {
    log.info("Auto-sync: fresh cache exists, skipping extraction", { networkId, ageMs: cached.ageMs });
    if (cached.entry?.result?.lastPiazzaExport) {
      await chrome.storage.local.set({ lastPiazzaExport: cached.entry.result.lastPiazzaExport });
    }
    return { skipped: true, reason: "fresh_cache" };
  }

  log.info("Auto-sync: cache stale or missing, requesting extraction", { networkId });
  return { skipped: false };
}

async function handleAutoSyncResult(payload) {
  const networkId = payload?.networkId;
  const exportPayload = payload?.data;

  if (!exportPayload?.posts?.length) {
    log.warn("Auto-sync result has no posts, skipping persistence", { networkId: networkId || null });
    return { stored: false };
  }

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

  log.info("Auto-sync data persisted", {
    networkId: cacheNetworkId || null,
    posts: summary.postCount,
    students: summary.studentCount,
    extractionMode: summary.extractionMode
  });

  return { stored: true, summary };
}

// ---- Piazza Export ----
async function handleExportPiazzaData(payload) {
  const tabId = payload?.tabId;
  if (!tabId) {
    throw new Error("Missing tab id for export");
  }

  const tab = await chrome.tabs.get(tabId);
  const networkId = payload?.networkId || deriveNetworkIdFromUrl(tab?.url || "");
  log.info("Starting Piazza export", { tabId, networkId: networkId || null });
  const cached = networkId ? await getCachedData(networkId) : null;

  if (cached?.fresh && cached.entry?.result?.response) {
    log.info("Using fresh Piazza cache", { networkId, ageMs: cached.ageMs });
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

  log.info("Cache miss or stale cache, requesting content extraction", { networkId: networkId || null });

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

  log.info("Piazza export stored locally", {
    networkId: cacheNetworkId || null,
    posts: summary.postCount,
    students: summary.studentCount,
    extractionMode: summary.extractionMode
  });

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
      log.debug("No cached Piazza data found", { networkId });
      return null;
    }

    log.debug("Loaded cached Piazza data", { networkId, ageMs: cached.ageMs, fresh: cached.fresh });

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
  summary.healthScore = computeHealthScore(
    exportPayload.posts || [],
    exportPayload.students || []
  );

  const fetchedAt = Date.now();
  const response = {
    storedLocally: true,
    summary
  };
  const lastPiazzaExport = {
    ...response,
    payload: exportPayload,
    fetchedAt
  };

  await chrome.storage.local.set({ lastPiazzaExport });
  return { response, lastPiazzaExport };
}

// CANONICAL: keep in sync with buildCourseHealth in dashboard.js
function computeHealthScore(posts, students) {
  if (!posts.length) return 0;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const totalPosts = Math.max(posts.length, 1);
  const unresolvedPosts = posts.filter((p) => !p.resolved).length;
  const answeredPosts = posts.filter((p) => p.answerCount || p.followupCount).length;
  const activeStudents = students.length;
  const topics = new Set(posts.flatMap((p) => p.tags || [p.topic]).filter(Boolean));

  const engagement = clamp(Math.round(40 + Math.min(35, posts.length * 0.7) + Math.min(25, activeStudents * 2)), 0, 100);
  const response = clamp(Math.round((answeredPosts / totalPosts) * 100), 0, 100);
  const resolution = clamp(Math.round(((totalPosts - unresolvedPosts) / totalPosts) * 100), 0, 100);
  const participation = clamp(Math.round(35 + Math.min(35, activeStudents * 2.5) + Math.min(30, topics.size * 3)), 0, 100);

  return Math.round((engagement + response + resolution + participation) / 4);
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
    log.info("Invalidated Piazza cache", { networkId });
    return;
  }

  const allData = await chrome.storage.local.get(null);
  const cacheKeys = Object.keys(allData).filter((key) => key.startsWith(PIAZZA_CACHE_PREFIX));
  const keysToRemove = [...cacheKeys, "lastPiazzaExport"];
  if (keysToRemove.length) {
    await chrome.storage.local.remove(keysToRemove);
  }
  log.info("Invalidated all Piazza cache entries", { removedKeys: keysToRemove.length });
}

function getPiazzaCacheKey(networkId) {
  return networkId ? `${PIAZZA_CACHE_PREFIX}${networkId}` : null;
}

function deriveNetworkIdFromUrl(url) {
  const match = String(url || "").match(/\/class\/([^/?#]+)/i);
  return match ? match[1] : null;
}
