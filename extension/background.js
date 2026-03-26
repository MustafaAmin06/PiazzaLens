// ============================================================
// PiazzaLens — Background Service Worker
// Handles API routing, message passing, and state management
// ============================================================

// ---- Configuration ----
const DEFAULT_ROLE = "professor";
const DEFAULT_THEME = "dark";
const CACHE_TTL_MS = 15 * 60 * 1000;
const PIAZZA_CACHE_PREFIX = "piazzaCache:";

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
  console.log("[PiazzaLens] Extension installed. Role:", DEFAULT_ROLE, "Theme:", DEFAULT_THEME);
});

// ---- Message Handler ----
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { action, payload } = message;

  switch (action) {
    case "GET_ROLE":
      chrome.storage.local.get("userRole", (data) => {
        sendResponse({ role: data.userRole || DEFAULT_ROLE });
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

// ---- Email Generation ----
async function handleGenerateEmail(payload) {
  const { studentName, topics } = payload;
  const name = studentName || "Student";
  const topicsStr = (topics || ["recent topics"]).join(" and ");
  return {
    email: `Subject: Checking in about the course\n\nHi ${name},\n\nI noticed you've had several questions recently about ${topicsStr}. That's completely normal — these are challenging topics that many students find tricky.\n\nIf you'd like, we can schedule a quick 15-minute meeting to go over any concepts you're finding difficult. I'm available during office hours, or we can find another time that works for you.\n\nDon't hesitate to reach out — I'm here to help.\n\nBest,\nProf. Smith`
  };
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
