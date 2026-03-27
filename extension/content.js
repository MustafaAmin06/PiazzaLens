// ============================================================
// PiazzaLens — Content Script
// Injects sidebar dashboard and UI elements into Piazza pages
// ============================================================

(function () {
  "use strict";

  const log = globalThis.PiazzaLogger.create("Content");

  // Prevent double injection
  if (document.getElementById("piazzalens-root")) return;

  // ---- Create Root Container ----
  const root = document.createElement("div");
  root.id = "piazzalens-root";
  document.body.appendChild(root);

  // ---- Create Toggle Button (Floating Action Button) ----
  const fab = document.createElement("button");
  fab.id = "piazzalens-fab";
  fab.innerHTML = `
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" fill="url(#grad)"/>
      <path d="M12 6.5c-1.93 0-3.5 1.57-3.5 3.5 0 1.5.94 2.77 2.25 3.27V16h2.5v-2.73c1.31-.5 2.25-1.77 2.25-3.27 0-1.93-1.57-3.5-3.5-3.5z" fill="white"/>
      <circle cx="12" cy="10" r="1.5" fill="url(#grad)"/>
      <defs>
        <linearGradient id="grad" x1="2" y1="2" x2="22" y2="22">
          <stop offset="0%" stop-color="#6366f1"/>
          <stop offset="100%" stop-color="#8b5cf6"/>
        </linearGradient>
      </defs>
    </svg>
    <span class="piazzalens-fab-label">PiazzaLens</span>
  `;
  fab.title = "Toggle PiazzaLens Dashboard";
  root.appendChild(fab);

  // ---- Create Sidebar Container ----
  const sidebar = document.createElement("div");
  sidebar.id = "piazzalens-sidebar";
  sidebar.classList.add("piazzalens-sidebar-closed");
  root.appendChild(sidebar);

  // ---- Create Overlay ----
  const overlay = document.createElement("div");
  overlay.id = "piazzalens-overlay";
  root.appendChild(overlay);

  // ---- Create Dashboard Iframe ----
  const iframe = document.createElement("iframe");
  iframe.id = "piazzalens-iframe";
  iframe.src = chrome.runtime.getURL("dashboard.html");
  iframe.setAttribute("frameborder", "0");
  iframe.setAttribute("allowtransparency", "true");
  sidebar.appendChild(iframe);

  // ---- Sidebar State ----
  let isOpen = false;
  let extractionProgress = createIdleExtractionProgress();

  function toggleSidebar() {
    isOpen = !isOpen;
    sidebar.classList.toggle("piazzalens-sidebar-open", isOpen);
    sidebar.classList.toggle("piazzalens-sidebar-closed", !isOpen);
    overlay.classList.toggle("piazzalens-overlay-visible", isOpen);
    fab.classList.toggle("piazzalens-fab-active", isOpen);

    // Notify dashboard
    iframe.contentWindow.postMessage({
      type: "PIAZZALENS_VISIBILITY",
      visible: isOpen
    }, "*");
  }

  fab.addEventListener("click", toggleSidebar);
  overlay.addEventListener("click", toggleSidebar);

  function createIdleExtractionProgress() {
    return {
      active: false,
      completed: false,
      mode: null,
      extractionMode: null,
      current: 0,
      total: 0,
      status: "idle",
      warnings: [],
      startedAt: null,
      updatedAt: null,
      usedFallback: false
    };
  }

  function updateExtractionProgress(patch) {
    extractionProgress = {
      ...extractionProgress,
      ...patch,
      updatedAt: new Date().toISOString()
    };
  }

  // ---- Listen for Messages from Background ----
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "SET_DASHBOARD_STATE") {
      const shouldOpen = message.payload.open;
      if (shouldOpen !== isOpen) {
        toggleSidebar();
      }
      return false;
    }

    if (message.action === "ROLE_CHANGED") {
      iframe.contentWindow.postMessage({
        type: "PIAZZALENS_ROLE_CHANGED",
        role: message.payload.role
      }, "*");
      return false;
    }

    if (message.action === "PING_PIAZZALENS") {
      sendResponse({ ok: true });
      return false;
    }

    if (message.action === "GET_EXTRACTION_PROGRESS") {
      sendResponse({ ok: true, progress: extractionProgress });
      return false;
    }

    if (message.action === "EXTRACT_PIAZZA_DATA") {
      extractPiazzaDataWithFallback()
        .then((data) => sendResponse({ success: true, data }))
        .catch((error) => sendResponse({ success: false, error: error.message }));
      return true;
    }

    return false;
  });

  // ---- Listen for Messages from Dashboard Iframe ----
  window.addEventListener("message", (event) => {
    if (event.data?.type === "PIAZZALENS_CLOSE") {
      if (isOpen) toggleSidebar();
    }
    if (event.data?.type === "PIAZZALENS_API_REQUEST") {
      chrome.runtime.sendMessage({
        action: "API_REQUEST",
        payload: event.data.payload
      }, (response) => {
        iframe.contentWindow.postMessage({
          type: "PIAZZALENS_API_RESPONSE",
          requestId: event.data.requestId,
          response: response
        }, "*");
      });
    }
  });

  // ---- Inject Social Validation Banner ----
  // This watches for Piazza's post editor and injects encouragement
  function injectSocialValidation() {
    const observer = new MutationObserver((mutations) => {
      // Look for Piazza's editor elements
      const editors = document.querySelectorAll('[class*="editor"], [class*="new_post"], textarea[placeholder*="question"]');
      editors.forEach((editor) => {
        if (editor.dataset.piazzalensInjected) return;
        editor.dataset.piazzalensInjected = "true";

        const banner = document.createElement("div");
        banner.className = "piazzalens-social-banner";
        banner.innerHTML = `
          <div class="piazzalens-social-banner-icon">💡</div>
          <div class="piazzalens-social-banner-text">
            <strong>Check for similar threads</strong> before posting.
            <span class="piazzalens-social-subtitle">Sync Piazza data in the extension to compare your draft against existing questions.</span>
          </div>
        `;
        editor.parentNode.insertBefore(banner, editor);
      });
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  // Delay to let Piazza load
  setTimeout(injectSocialValidation, 3000);

  // ---- Auto-Sync: Navigation Detection ----
  let lastSyncedNetworkId = null;
  let lastAutoSyncTime = 0;
  const AUTO_SYNC_COOLDOWN_MS = 30000;
  const AUTO_SYNC_DELAY_MS = 5000;
  let autoSyncTimer = null;

  function triggerAutoSync(networkId) {
    if (!networkId) return;
    if (extractionProgress.active) {
      log.debug("Auto-sync skipped: extraction already in progress");
      return;
    }
    if (Date.now() - lastAutoSyncTime < AUTO_SYNC_COOLDOWN_MS) {
      log.debug("Auto-sync skipped: cooldown active");
      return;
    }

    lastAutoSyncTime = Date.now();
    lastSyncedNetworkId = networkId;
    setFabSyncing(true);

    chrome.runtime.sendMessage(
      { action: "AUTO_SYNC", payload: { tabId: null, networkId } },
      (response) => {
        if (chrome.runtime.lastError) {
          log.warn("Auto-sync message failed", { error: chrome.runtime.lastError.message });
          setFabSyncing(false);
          return;
        }

        if (response?.skipped) {
          log.info("Auto-sync skipped by background (fresh cache)", { networkId });
          setFabSyncing(false);
          return;
        }

        log.info("Auto-sync: background requested extraction", { networkId });
        extractPiazzaDataWithFallback()
          .then((data) => {
            chrome.runtime.sendMessage(
              { action: "AUTO_SYNC_RESULT", payload: { networkId, data } },
              () => {
                if (chrome.runtime.lastError) {
                  log.warn("Auto-sync result delivery failed", { error: chrome.runtime.lastError.message });
                }
                log.info("Auto-sync completed", { networkId, posts: data?.posts?.length || 0 });
                setFabSyncing(false);
              }
            );
          })
          .catch((err) => {
            log.warn("Auto-sync extraction failed", { networkId, error: err.message });
            setFabSyncing(false);
          });
      }
    );
  }

  function setFabSyncing(syncing) {
    if (syncing) {
      fab.classList.add("piazzalens-fab-syncing");
      fab.title = "PiazzaLens — Syncing...";
    } else {
      fab.classList.remove("piazzalens-fab-syncing");
      fab.title = "Toggle PiazzaLens Dashboard";
    }
  }

  function scheduleAutoSync(networkId) {
    if (autoSyncTimer) clearTimeout(autoSyncTimer);
    autoSyncTimer = setTimeout(() => {
      autoSyncTimer = null;
      triggerAutoSync(networkId);
    }, AUTO_SYNC_DELAY_MS);
  }

  function onUrlChange() {
    const networkId = extractNetworkId(window.location.href);
    if (!networkId) return;
    if (networkId === lastSyncedNetworkId) return;
    log.info("Detected class navigation", { networkId, previousNetworkId: lastSyncedNetworkId });
    scheduleAutoSync(networkId);
  }

  // Intercept SPA navigation (Piazza is a single-page app)
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;

  history.pushState = function (...args) {
    originalPushState.apply(this, args);
    onUrlChange();
  };

  history.replaceState = function (...args) {
    originalReplaceState.apply(this, args);
    onUrlChange();
  };

  window.addEventListener("popstate", onUrlChange);

  // Initial page load auto-sync
  setTimeout(() => {
    const networkId = extractNetworkId(window.location.href);
    if (networkId) {
      log.info("Initial page load auto-sync", { networkId });
      triggerAutoSync(networkId);
    }
  }, AUTO_SYNC_DELAY_MS);

  async function extractPiazzaDataWithFallback() {
    const startedAt = new Date().toISOString();
    const course = extractCourseContext();
    log.info("Starting Piazza extraction", { networkId: course.networkId || null, courseId: course.id });

    extractionProgress = createIdleExtractionProgress();
    updateExtractionProgress({
      active: true,
      completed: false,
      mode: "api",
      extractionMode: null,
      status: "Preparing Piazza sync...",
      startedAt,
      warnings: []
    });

    try {
      const apiPayload = await extractPiazzaDataViaApi(course);
      log.info("Piazza API extraction completed", {
        posts: apiPayload.posts.length,
        warnings: apiPayload.warnings?.length || 0,
        extractionMode: apiPayload.extractionMode
      });
      updateExtractionProgress({
        active: false,
        completed: true,
        current: apiPayload.posts.length,
        total: apiPayload.posts.length,
        extractionMode: apiPayload.extractionMode,
        status: `Fetched ${apiPayload.posts.length} posts from Piazza API.`,
        warnings: apiPayload.warnings || []
      });
      return apiPayload;
    } catch (error) {
      const fallbackWarnings = [`API extraction failed: ${error.message}`];
      log.warn("Piazza API extraction failed, switching to DOM fallback", { error: error.message });
      updateExtractionProgress({
        active: true,
        mode: "dom-fallback",
        extractionMode: "visible-dom-v1",
        usedFallback: true,
        status: "API unavailable, falling back to visible DOM posts...",
        warnings: fallbackWarnings
      });

      const domPayload = extractPiazzaData({
        course,
        baseWarnings: fallbackWarnings,
        extractionMode: "visible-dom-v1"
      });

      log.info("DOM fallback extraction completed", {
        posts: domPayload.posts.length,
        warnings: domPayload.warnings?.length || 0,
        extractionMode: domPayload.extractionMode
      });

      updateExtractionProgress({
        active: false,
        completed: true,
        current: domPayload.posts.length,
        total: domPayload.posts.length,
        extractionMode: domPayload.extractionMode,
        status: `Captured ${domPayload.posts.length} visible posts from the DOM fallback.`,
        warnings: domPayload.warnings || []
      });

      return domPayload;
    }
  }

  async function extractPiazzaDataViaApi(course) {
    if (!window.PiazzaAPI?.fetchAllPosts || !window.PiazzaAPI?.normalizePost) {
      throw new Error("Piazza API client is unavailable in this tab");
    }

    const networkId = course.networkId || extractNetworkId(window.location.href);
    if (!networkId) {
      throw new Error("Unable to derive the Piazza course network id from the current page");
    }

    log.debug("Attempting Piazza API extraction", { networkId, courseId: course.id });

    const apiResult = await window.PiazzaAPI.fetchAllPosts(networkId, (current, total, status) => {
      updateExtractionProgress({
        active: true,
        mode: "api",
        extractionMode: "api-v1",
        current,
        total,
        status
      });
    });

    const normalizedPosts = dedupePosts(
      apiResult.posts
        .map((post) => window.PiazzaAPI.normalizePost(post, { networkId, courseId: course.id }))
        .filter(Boolean)
    );

    log.info("Normalized Piazza API posts", {
      networkId,
      rawPosts: apiResult.posts.length,
      normalizedPosts: normalizedPosts.length
    });

    if (!normalizedPosts.length) {
      throw new Error("Piazza API returned no posts that could be normalized");
    }

    return {
      schemaVersion: "1.0.0",
      extractionMode: "api-v1",
      extractedAt: new Date().toISOString(),
      source: {
        platform: "piazza",
        url: window.location.href,
        title: document.title,
        host: window.location.host,
        transport: "internal-rpc"
      },
      course,
      page: {
        type: detectPageType(),
        title: document.title,
        url: window.location.href
      },
      posts: normalizedPosts,
      students: summarizeStudents(normalizedPosts, course.id),
      warnings: apiResult.warnings || []
    };
  }

  function extractPiazzaData(options = {}) {
    const warnings = [...(options.baseWarnings || [])];
    const course = options.course || extractCourseContext();
    const posts = extractVisiblePosts(warnings, course.id);

    if (posts.length === 0) {
      warnings.push("No visible Piazza posts matched the current DOM selectors.");
    }

    log.info("Collected Piazza posts from DOM fallback", {
      posts: posts.length,
      warnings: warnings.length,
      extractionMode: options.extractionMode || "visible-dom-v1"
    });

    return {
      schemaVersion: "1.0.0",
      extractionMode: options.extractionMode || "visible-dom-v1",
      extractedAt: new Date().toISOString(),
      source: {
        platform: "piazza",
        url: window.location.href,
        title: document.title,
        host: window.location.host
      },
      course,
      page: {
        type: detectPageType(),
        title: document.title,
        url: window.location.href
      },
      posts,
      students: summarizeStudents(posts, course.id),
      warnings
    };
  }

  function extractCourseContext() {
    const networkId = extractNetworkId(window.location.href);
    const title = resolveCourseTitle(networkId);

    return {
      id: deriveCourseId(window.location.href, title),
      networkId,
      name: title,
      url: window.location.href
    };
  }

  function extractVisiblePosts(warnings, courseId) {
    const selectors = [
      '[data-post-id]',
      '[data-question-id]',
      '[data-cid]',
      '[class*="feed_item"]',
      '[class*="feedItem"]',
      '[class*="question"]',
      '[class*="post"]',
      'article'
    ];
    const candidates = [];
    const seenNodes = new Set();

    selectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((node) => {
        if (node.closest("#piazzalens-root") || seenNodes.has(node)) {
          return;
        }

        seenNodes.add(node);
        candidates.push(node);
      });
    });

    const extracted = candidates
      .map((node, index) => extractPostFromNode(node, index, courseId))
      .filter((post) => post && (post.title || post.body));

    const deduped = dedupePosts(extracted);

    log.debug("Evaluated visible Piazza post candidates", {
      candidates: candidates.length,
      extracted: extracted.length,
      deduped: deduped.length
    });

    if (candidates.length > 0 && deduped.length === 0) {
      warnings.push("Candidate post containers were found, but none could be normalized into PiazzaLens post objects.");
    }

    return deduped;
  }

  function extractPostFromNode(node, index, courseId) {
    const title = sanitizeText(
      pickNodeText(node, [
        '[data-post-title]',
        '[class*="title"]',
        '[class*="subject"]',
        'h1',
        'h2',
        'h3',
        'a[href*="post"]'
      ])
    );

    const body = sanitizeText(
      pickNodeText(node, [
        '[data-post-body]',
        '[class*="content"]',
        '[class*="body"]',
        '[class*="snippet"]',
        'p',
        '.rendered_html'
      ]) || node.textContent
    );

    if ((!title && !body) || body.length < 20) {
      return null;
    }

    const author = sanitizeText(
      pickNodeText(node, [
        '[data-author-name]',
        '[class*="author"]',
        '[class*="user"]',
        '[class*="poster"]'
      ])
    ) || "Unknown";

    const tags = extractTags(node);
    const url = extractPostUrl(node);
    const timestamp = extractTimestamp(node);
    const upvotes = extractUpvotes(node);
    const resolved = detectResolved(node);
    const lecture = detectLectureNumber(`${title} ${body} ${tags.join(" ")}`);
    const answerCount = detectAnswerCount(node, resolved);
    const followupCount = detectFollowupCount(node);
    const hasInstructorAnswer = detectInstructorAnswer(node);
    const hasStudentAnswer = answerCount > 0 && !hasInstructorAnswer;

    return {
      id: derivePostId(node, url, title, index, courseId),
      sourceId: readFirstAttr(node, ["data-post-id", "data-question-id", "data-cid"]),
      title: title || inferTitleFromBody(body),
      body: trimText(body, 2500),
      author,
      timestamp,
      upvotes,
      resolved,
      tags,
      topic: tags[0] || inferTopicFromTitle(title || body),
      lecture,
      url,
      courseId,
      answerCount,
      followupCount,
      hasInstructorAnswer,
      hasStudentAnswer,
      viewCount: 0,
      type: "question"
    };
  }

  function summarizeStudents(posts, courseId) {
    const byAuthor = new Map();

    posts.forEach((post) => {
      if (!post.author || post.author === "Unknown") {
        return;
      }

      const existing = byAuthor.get(post.author) || {
        id: `${courseId}#${slugify(post.author)}`,
        name: post.author,
        postsCount: 0,
        confusionSignals: 0,
        riskScore: 0,
        riskLevel: "low",
        topics: []
      };

      existing.postsCount += 1;
      if (!post.resolved) {
        existing.confusionSignals += 1;
      }
      if (post.topic && !existing.topics.includes(post.topic)) {
        existing.topics.push(post.topic);
      }

      byAuthor.set(post.author, existing);
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

  function detectPageType() {
    if (/\/post\//i.test(window.location.pathname) || document.querySelector('[class*="thread"]')) {
      return "thread";
    }

    if (document.querySelector('[class*="feed"]') || document.querySelector('[class*="question"]')) {
      return "feed";
    }

    return "unknown";
  }

  function extractTags(node) {
    const tags = new Set();
    node.querySelectorAll('[class*="tag"], [class*="label"], [data-tag]').forEach((tagNode) => {
      const value = sanitizeText(tagNode.textContent);
      if (value && value.length < 40) {
        tags.add(value);
      }
    });
    return Array.from(tags).slice(0, 8);
  }

  function extractTimestamp(node) {
    const timeNode = node.querySelector('time, [datetime], [class*="time"], [class*="date"]');
    const rawValue = timeNode?.getAttribute("datetime") || timeNode?.textContent || "";
    return sanitizeText(rawValue) || null;
  }

  function extractUpvotes(node) {
    const voteNode = node.querySelector('[class*="vote"], [class*="endorse"], [aria-label*="vote"]');
    const rawText = sanitizeText(voteNode?.textContent || "");
    const match = rawText.match(/\d+/);
    return match ? Number.parseInt(match[0], 10) : 0;
  }

  function detectResolved(node) {
    const statusEl = node.querySelector(
      '[class*="resolved"], [class*="answered"], [aria-label*="resolved"], ' +
      '[data-resolved], [class*="status"]'
    );
    if (statusEl) {
      const statusText = sanitizeText(statusEl.textContent).toLowerCase();
      if (statusText.includes("unresolved")) return false;
      if (statusText.includes("resolved") || statusText.includes("answered")) return true;
    }

    const resolvedAttr = node.getAttribute("data-resolved") || node.getAttribute("data-status");
    if (resolvedAttr) {
      const val = resolvedAttr.toLowerCase();
      if (val === "true" || val === "resolved" || val === "answered") return true;
      if (val === "false" || val === "unresolved") return false;
    }

    if (node.querySelector('[class*="check-circle"], [class*="checkmark"], [class*="badge-resolved"]')) {
      return true;
    }

    return false;
  }

  function detectAnswerCount(node, resolved) {
    const answerEls = node.querySelectorAll(
      '[class*="answer"]:not([class*="no_answer"]):not([class*="unanswered"]), ' +
      '[class*="response"], [data-answer-count]'
    );
    if (answerEls.length > 0) return answerEls.length;
    return resolved ? 1 : 0;
  }

  function detectFollowupCount(node) {
    const followupEls = node.querySelectorAll(
      '[class*="followup"], [class*="follow-up"], [class*="reply"], [class*="comment"]'
    );
    return followupEls.length;
  }

  function detectInstructorAnswer(node) {
    return Boolean(node.querySelector(
      '[class*="instructor"][class*="answer"], [class*="i_answer"], ' +
      '[class*="instructor"][class*="response"]'
    ));
  }

  function extractPostUrl(node) {
    const anchor = node.querySelector('a[href*="/post/"], a[href*="post="], a[href*="cid="]');
    if (!anchor) {
      return window.location.href;
    }

    try {
      return new URL(anchor.getAttribute("href"), window.location.origin).toString();
    } catch (error) {
      return window.location.href;
    }
  }

  function derivePostId(node, url, title, index, courseId) {
    const explicitId = readFirstAttr(node, ["data-post-id", "data-question-id", "data-cid"]);
    if (explicitId) {
      return `${courseId}#${explicitId}`;
    }

    const urlMatch = (url || "").match(/(post|cid|question)[=\/-](\d+)/i);
    if (urlMatch) {
      return `${courseId}#${urlMatch[2]}`;
    }

    return `${courseId}#${slugify(title || "post")}-${index + 1}`;
  }

  function deriveCourseId(url, courseName) {
    const urlMatch = url.match(/class\/([^/?#]+)/i) || url.match(/cid=(\d+)/i);
    if (urlMatch) {
      return slugify(urlMatch[1]);
    }

    return slugify(courseName || "piazza-course");
  }

  function detectLectureNumber(text) {
    const match = text.match(/lecture\s*(\d+)|\bl\s*(\d+)\b/i);
    return match ? Number.parseInt(match[1] || match[2], 10) : null;
  }

  function extractNetworkId(url) {
    const urlMatch = String(url || "").match(/class\/([^/?#]+)/i);
    return urlMatch ? urlMatch[1] : null;
  }

  function resolveCourseTitle(networkId) {
    const candidates = [
      pickFirstText([
        '[data-course-name]',
        '[data-network-name]',
        '[aria-label*="course" i]',
        '[class*="course_name"]',
        '[class*="courseName"]',
        '[class*="network_name"]',
        '[class*="networkName"]',
        '[class*="navbar"] [class*="course"]',
        '[class*="navbar"] [class*="network"]',
        '[class*="topbar"] [class*="course"]',
        '[class*="topbar"] [class*="network"]',
        'a[href*="/class/"][class*="title"]',
        'a[href*="/class/"][class*="name"]',
        'h1'
      ]),
      extractCourseTitleFromDocumentTitle(document.title, networkId)
    ]
      .map((value) => sanitizeText(value))
      .filter(Boolean);

    const preferred = candidates.find(
      (value) => isLikelyCourseTitle(value, networkId) && !isOpaqueCourseLabel(value, networkId)
    );
    const fallback = candidates.find((value) => isLikelyCourseTitle(value, networkId));
    return preferred || fallback || "Piazza Course";
  }

  function extractCourseTitleFromDocumentTitle(title, networkId) {
    const cleanTitle = sanitizeText(title);
    if (!cleanTitle) {
      return "";
    }

    const parts = cleanTitle
      .split(/\s+[\-|\u00b7|:]\s+|\s+[-|:]\s+|\|/)
      .map((part) => sanitizeText(part))
      .filter(Boolean)
      .filter((part) => !/^piazza$/i.test(part));

    const preferred = parts.find((part) => !isOpaqueCourseLabel(part, networkId));
    return preferred || parts[0] || cleanTitle;
  }

  function isOpaqueCourseLabel(value, networkId) {
    const text = sanitizeText(value);
    if (!text) {
      return true;
    }

    const lower = text.toLowerCase();
    const normalizedNetworkId = sanitizeText(networkId).toLowerCase();

    if (normalizedNetworkId && lower === normalizedNetworkId) {
      return true;
    }

    if (/^[a-z0-9]{10,}$/i.test(text) && !/[\s_-]/.test(text)) {
      return true;
    }

    return /^class\s+[a-z0-9]{8,}$/i.test(text);
  }

  function isLikelyCourseTitle(value, networkId) {
    const text = sanitizeText(value);
    if (!text) {
      return false;
    }

    if (isOpaqueCourseLabel(text, networkId)) {
      return false;
    }

    if (text.length > 80) {
      return false;
    }

    const words = text.split(/\s+/).filter(Boolean);
    if (words.length > 10) {
      return false;
    }

    if (/[!?]{2,}|\b(on behalf of|welcome to|teaching team|q&a|question answer|instructor note)\b/i.test(text)) {
      return false;
    }

    if (/\b(post|thread|reply|followup|follow-up|week\s*\d+)\b/i.test(text) && words.length > 4) {
      return false;
    }

    return true;
  }

  function dedupePosts(posts) {
    const deduped = [];
    const seenKeys = new Set();

    posts.forEach((post) => {
      const key = post?.id || post?.sourceId || post?.url || `${post?.title}|${post?.timestamp}`;
      if (!key || seenKeys.has(key)) {
        return;
      }

      seenKeys.add(key);
      deduped.push(post);
    });

    return deduped;
  }

  function inferTitleFromBody(body) {
    return trimText((body || "").split(/[.!?\n]/)[0] || "Untitled Piazza Post", 120);
  }

  function inferTopicFromTitle(text) {
    return trimText(sanitizeText(text).split(/[|:\-]/)[0] || "general", 60).toLowerCase();
  }

  function pickFirstText(selectors) {
    for (const selector of selectors) {
      const node = document.querySelector(selector);
      const value = sanitizeText(node?.textContent);
      if (value) {
        return value;
      }
    }

    return "";
  }

  function pickNodeText(rootNode, selectors) {
    for (const selector of selectors) {
      const node = rootNode.querySelector(selector);
      const value = sanitizeText(node?.textContent);
      if (value) {
        return value;
      }
    }

    return "";
  }

  function readFirstAttr(node, attributeNames) {
    for (const attributeName of attributeNames) {
      const value = node.getAttribute(attributeName);
      if (value) {
        return value;
      }
    }

    return null;
  }

  function sanitizeText(value) {
    return (value || "").replace(/\s+/g, " ").trim();
  }

  function trimText(value, maxLength) {
    const text = sanitizeText(value);
    if (text.length <= maxLength) {
      return text;
    }

    return `${text.slice(0, maxLength - 1)}…`;
  }

  function slugify(value) {
    return sanitizeText(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "unknown";
  }

  log.info("Content script injected");
})();
