// ============================================================
// PiazzaLens — Content Script
// Injects sidebar dashboard and UI elements into Piazza pages
// ============================================================

(function () {
  "use strict";

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

  // ---- Listen for Messages from Background ----
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "SET_DASHBOARD_STATE") {
      const shouldOpen = message.payload.open;
      if (shouldOpen !== isOpen) {
        toggleSidebar();
      }
    }
    if (message.action === "ROLE_CHANGED") {
      iframe.contentWindow.postMessage({
        type: "PIAZZALENS_ROLE_CHANGED",
        role: message.payload.role
      }, "*");
    }
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
            <strong>14 other students</strong> asked similar questions this week.
            <span class="piazzalens-social-subtitle">You're not alone! Go ahead and ask.</span>
          </div>
        `;
        editor.parentNode.insertBefore(banner, editor);
      });
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  // Delay to let Piazza load
  setTimeout(injectSocialValidation, 3000);

  console.log("[PiazzaLens] Content script injected successfully.");
})();
