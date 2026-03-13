// ============================================================
// PiazzaLens — Popup Script
// Controls the extension popup UI
// ============================================================

document.addEventListener("DOMContentLoaded", () => {
  // ---- Role Toggle ----
  const btnProfessor = document.getElementById("btn-professor");
  const btnStudent = document.getElementById("btn-student");

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
            files: ["mock_data.js", "content.js"]
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

  // ---- Refresh ----
  document.getElementById("btn-refresh").addEventListener("click", () => {
    const btn = document.getElementById("btn-refresh");
    btn.textContent = "✅ Data Refreshed!";
    btn.style.borderColor = "rgba(34, 197, 94, 0.3)";
    btn.style.color = "#22c55e";
    setTimeout(() => {
      btn.textContent = "🔄 Refresh Data";
      btn.style.borderColor = "";
      btn.style.color = "";
    }, 1500);
  });
});
