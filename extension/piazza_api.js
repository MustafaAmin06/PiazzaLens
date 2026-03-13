// ============================================================
// PiazzaLens — Piazza Internal API Client
// Fetches complete course data through Piazza's internal RPC API
// ============================================================

(function () {
  "use strict";

  const API_ENDPOINT = "/logic/api";
  const FEED_PAGE_SIZE = 200;
  const CONTENT_CONCURRENCY = 3;
  const REQUEST_STAGGER_MS = 200;
  const MAX_RETRIES = 3;
  const BACKOFF_BASE_MS = 1000;

  let discoveredAuth = null;

  window.PiazzaAPI = {
    extractNetworkId,
    discoverAuth,
    callApi,
    getFeed,
    getPost,
    fetchAllPosts,
    normalizePost
  };

  function extractNetworkId(url = window.location.href) {
    const match = String(url).match(/\/class\/([^/?#]+)/i);
    return match ? match[1] : null;
  }

  async function discoverAuth(nid) {
    if (discoveredAuth) {
      return discoveredAuth;
    }

    const baseHeaders = { "Content-Type": "application/json" };
    const cookieProbe = await rawApiCall("network.get_my_feed", { nid, limit: 1, offset: 0 }, baseHeaders);

    if (cookieProbe.ok) {
      discoveredAuth = { headers: baseHeaders, mode: "cookies" };
      console.log("[PiazzaLens API] Using session cookies for auth.");
      return discoveredAuth;
    }

    if (cookieProbe.status !== 403) {
      throw await buildApiError("network.get_my_feed", cookieProbe);
    }

    const csrfToken = findCsrfToken();
    if (!csrfToken) {
      throw new Error("Piazza rejected cookie auth and no CSRF token was found on the page");
    }

    const csrfHeaders = {
      ...baseHeaders,
      "csrf-token": csrfToken,
      "x-csrf-token": csrfToken,
      "x-csrftoken": csrfToken
    };
    const csrfProbe = await rawApiCall("network.get_my_feed", { nid, limit: 1, offset: 0 }, csrfHeaders);

    if (!csrfProbe.ok) {
      throw await buildApiError("network.get_my_feed", csrfProbe);
    }

    discoveredAuth = { headers: csrfHeaders, mode: "csrf", csrfToken };
    console.log("[PiazzaLens API] Using discovered CSRF token for auth.");
    return discoveredAuth;
  }

  async function callApi(method, params) {
    const nid = params?.nid || extractNetworkId();
    let auth = await discoverAuth(nid);

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      const response = await rawApiCall(method, params, auth.headers);
      const payload = await safeReadJson(response);

      if (response.status === 429 && attempt < MAX_RETRIES) {
        await delay(getBackoffMs(attempt, response.headers.get("retry-after")));
        continue;
      }

      if (response.status === 403 && attempt < MAX_RETRIES) {
        discoveredAuth = null;
        auth = await discoverAuth(nid);
        await delay(getBackoffMs(attempt));
        continue;
      }

      if (!response.ok || payload?.error) {
        const error = createApiError(method, response.status, payload);
        if (isRetryableStatus(response.status) && attempt < MAX_RETRIES) {
          await delay(getBackoffMs(attempt, response.headers.get("retry-after")));
          continue;
        }
        throw error;
      }

      return payload?.result ?? payload;
    }

    throw new Error(`Piazza API ${method} failed after ${MAX_RETRIES + 1} attempts`);
  }

  async function getFeed(nid) {
    const feedItems = [];
    let offset = 0;
    let total = null;

    while (true) {
      const result = await callApi("network.get_my_feed", {
        nid,
        limit: FEED_PAGE_SIZE,
        offset,
        sort: "updated"
      });

      const pageItems = extractFeedItems(result);
      if (!pageItems.length) {
        break;
      }

      feedItems.push(...pageItems);
      total = total ?? extractFeedTotal(result);
      offset += pageItems.length;

      if (pageItems.length < FEED_PAGE_SIZE) {
        break;
      }

      if (Number.isFinite(total) && feedItems.length >= total) {
        break;
      }
    }

    return dedupeFeedItems(feedItems);
  }

  function getPost(nid, cid) {
    return callApi("content.get", {
      nid,
      cid: String(cid),
      student_view: null
    });
  }

  async function fetchAllPosts(nid, onProgress) {
    const progress = typeof onProgress === "function" ? onProgress : () => {};
    const warnings = [];

    progress(0, 0, "Discovering Piazza session...");
    await discoverAuth(nid);

    progress(0, 0, "Fetching Piazza feed...");
    const feedItems = await getFeed(nid);
    const cids = feedItems
      .map((item) => item?.nr || item?.id || item?.cid)
      .filter(Boolean)
      .map((cid) => String(cid));

    const uniqueCids = Array.from(new Set(cids));
    if (!uniqueCids.length) {
      return {
        posts: [],
        feedItems,
        warnings: ["Piazza feed returned no valid content ids."]
      };
    }

    progress(0, uniqueCids.length, `Fetching 0/${uniqueCids.length} posts...`);

    const posts = new Array(uniqueCids.length);
    let completed = 0;
    let nextIndex = 0;

    async function worker(workerIndex) {
      while (nextIndex < uniqueCids.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        const cid = uniqueCids[currentIndex];

        if (currentIndex > 0) {
          await delay(REQUEST_STAGGER_MS * Math.min(workerIndex + 1, CONTENT_CONCURRENCY));
        }

        try {
          posts[currentIndex] = await getPost(nid, cid);
        } catch (error) {
          warnings.push(`Skipped post ${cid}: ${error.message}`);
          console.warn(`[PiazzaLens API] Skipping post ${cid}:`, error.message);
        }

        completed += 1;
        progress(completed, uniqueCids.length, `Fetching ${completed}/${uniqueCids.length} posts...`);
      }
    }

    await Promise.all(
      Array.from({ length: Math.min(CONTENT_CONCURRENCY, uniqueCids.length) }, (_, index) => worker(index))
    );

    return {
      posts: posts.filter(Boolean),
      feedItems,
      warnings
    };
  }

  function normalizePost(raw, options = {}) {
    if (!raw || typeof raw !== "object") {
      return null;
    }

    const history = Array.isArray(raw.history) && raw.history.length
      ? raw.history[raw.history.length - 1]
      : {};
    const networkId = options.networkId || extractNetworkId() || raw.nid || null;
    const courseId = options.courseId || sanitizeIdentifier(networkId) || "unknown-course";
    const sourceId = firstDefined([raw.nr, raw.id, raw.cid, history.nr, history.cid]);

    if (!sourceId) {
      return null;
    }

    const title = cleanText(firstDefined([raw.subject, history.subject, history.s, raw.title]));
    const body = stripHtml(firstDefined([raw.content, history.content, raw.body, history.body, history.text]));
    const children = flattenChildren(raw.children);
    const instructorAnswers = children.filter(isInstructorAnswer);
    const studentAnswers = children.filter(isStudentAnswer);
    const followups = children.filter(isFollowup);
    const tags = unique(
      [
        ...(Array.isArray(raw.folders) ? raw.folders : []),
        ...(Array.isArray(raw.tags) ? raw.tags : [])
      ]
        .map((value) => cleanText(value))
        .filter((value) => value && value.length <= 60)
    ).slice(0, 8);
    const lecture = detectLecture(`${title} ${body} ${tags.join(" ")}`);
    const resolved = Boolean(raw.is_answered || raw.no_answer === 0 || instructorAnswers.length || studentAnswers.length);

    return {
      id: `${courseId}#${sourceId}`,
      sourceId: String(sourceId),
      title: title || inferTitle(body),
      body: trimText(body, 2500),
      author: resolveAuthor(raw, history),
      timestamp: firstDefined([raw.created, history.created, raw.updated, history.updated]) || null,
      upvotes: toNumber(firstDefined([raw.num_favorites, raw.good, raw.num_good])),
      resolved,
      tags,
      topic: tags[0] || inferTopic(title || body),
      lecture,
      url: networkId ? `https://piazza.com/class/${networkId}/post/${sourceId}` : window.location.href,
      courseId,
      viewCount: toNumber(firstDefined([raw.unique_views, raw.num_unique_views, raw.views])),
      answerCount: instructorAnswers.length + studentAnswers.length,
      followupCount: followups.length,
      hasInstructorAnswer: instructorAnswers.length > 0,
      hasStudentAnswer: studentAnswers.length > 0,
      type: cleanText(raw.type || raw.status || "question").toLowerCase()
    };
  }

  function findCsrfToken() {
    const metaSelectors = [
      'meta[name="csrf-token"]',
      'meta[name="csrf_token"]',
      'meta[name="_csrf"]',
      'meta[name="csrfToken"]'
    ];
    for (const selector of metaSelectors) {
      const node = document.querySelector(selector);
      const value = node?.getAttribute("content");
      if (value) {
        return value;
      }
    }

    const cookieNames = ["csrf_token", "csrftoken", "XSRF-TOKEN"];
    for (const cookieName of cookieNames) {
      const match = document.cookie.match(new RegExp(`${escapeRegExp(cookieName)}=([^;]+)`));
      if (match?.[1]) {
        return decodeURIComponent(match[1]);
      }
    }

    const globalCandidates = [
      window.__csrf_token,
      window.csrfToken,
      window._csrf,
      window?.app?.csrfToken,
      window?.piazza?.csrfToken
    ];
    for (const candidate of globalCandidates) {
      if (typeof candidate === "string" && candidate.trim()) {
        return candidate.trim();
      }
    }

    return null;
  }

  function rawApiCall(method, params, headers) {
    return fetch(API_ENDPOINT, {
      method: "POST",
      credentials: "include",
      headers,
      body: JSON.stringify({ method, params })
    });
  }

  function extractFeedItems(result) {
    if (Array.isArray(result)) {
      return result;
    }
    if (Array.isArray(result?.feed)) {
      return result.feed;
    }
    if (Array.isArray(result?.items)) {
      return result.items;
    }
    if (Array.isArray(result?.docs)) {
      return result.docs;
    }
    return [];
  }

  function extractFeedTotal(result) {
    const total = firstDefined([
      result?.total,
      result?.feed_total,
      result?.count,
      result?.num_results,
      result?.total_results
    ]);
    return Number.isFinite(Number(total)) ? Number(total) : null;
  }

  function dedupeFeedItems(feedItems) {
    const seen = new Set();
    return feedItems.filter((item) => {
      const key = item?.nr || item?.id || item?.cid;
      if (!key || seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  async function safeReadJson(response) {
    try {
      return await response.json();
    } catch (error) {
      return null;
    }
  }

  async function buildApiError(method, response) {
    const payload = await safeReadJson(response);
    return createApiError(method, response.status, payload);
  }

  function createApiError(method, status, payload) {
    const detail = cleanText(
      firstDefined([
        payload?.error,
        payload?.message,
        payload?.reason,
        payload?.status,
        status ? `status ${status}` : null
      ])
    );
    return new Error(`Piazza API ${method} failed: ${detail || "unknown error"}`);
  }

  function isRetryableStatus(status) {
    return status === 408 || status === 425 || status === 429 || status >= 500;
  }

  function getBackoffMs(attempt, retryAfterHeader) {
    const retryAfterSeconds = Number.parseInt(retryAfterHeader || "", 10);
    if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
      return retryAfterSeconds * 1000;
    }
    return BACKOFF_BASE_MS * Math.pow(2, attempt);
  }

  function flattenChildren(children) {
    const queue = Array.isArray(children)
      ? [...children]
      : children && typeof children === "object"
        ? Object.values(children)
        : [];
    const flat = [];

    while (queue.length) {
      const current = queue.shift();
      if (!current || typeof current !== "object") {
        continue;
      }

      flat.push(current);
      if (Array.isArray(current.children)) {
        queue.push(...current.children);
      }
    }

    return flat;
  }

  function isInstructorAnswer(node) {
    const type = cleanText(node?.type).toLowerCase();
    const role = cleanText(node?.role || node?.user_role || node?.tag).toLowerCase();
    return type.includes("i_answer") || role.includes("instructor") || role.includes("ta");
  }

  function isStudentAnswer(node) {
    const type = cleanText(node?.type).toLowerCase();
    return type.includes("s_answer") || type === "answer";
  }

  function isFollowup(node) {
    const type = cleanText(node?.type).toLowerCase();
    return type.includes("followup") || type.includes("follow_up") || type.includes("comment");
  }

  function resolveAuthor(raw, history) {
    if (String(raw?.anonymous || history?.anonymous || "").toLowerCase() !== "no" && (raw?.anonymous || history?.anonymous)) {
      return "Anonymous";
    }

    const candidates = [
      raw?.name,
      raw?.author_name,
      raw?.display_name,
      history?.name,
      history?.author,
      history?.display_name
    ];
    const author = candidates
      .map((value) => cleanText(value))
      .find((value) => value && /[a-z]/i.test(value) && value.length <= 80);
    return author || "Unknown";
  }

  function detectLecture(text) {
    const match = String(text || "").match(/lecture\s*(\d+)|\bl\s*(\d+)\b/i);
    return match ? Number.parseInt(match[1] || match[2], 10) : null;
  }

  function sanitizeIdentifier(value) {
    return cleanText(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function stripHtml(value) {
    const container = document.createElement("div");
    container.innerHTML = value || "";
    return cleanText(container.textContent || container.innerText || "");
  }

  function inferTitle(body) {
    return trimText((body || "").split(/[.!?\n]/)[0] || "Untitled Piazza Post", 120);
  }

  function inferTopic(text) {
    return trimText(cleanText(text).split(/[|:\-]/)[0] || "general", 60).toLowerCase();
  }

  function trimText(value, maxLength) {
    const text = cleanText(value);
    if (text.length <= maxLength) {
      return text;
    }
    return `${text.slice(0, maxLength - 1)}…`;
  }

  function firstDefined(values) {
    return values.find((value) => value !== undefined && value !== null && value !== "");
  }

  function toNumber(value) {
    const parsed = Number.parseInt(value ?? 0, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function unique(values) {
    return Array.from(new Set(values));
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  console.log("[PiazzaLens API] Client loaded.");
})();
