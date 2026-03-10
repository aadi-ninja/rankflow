// ==========================
// RankFlow Extension Popup Script
// ==========================

const createView = document.getElementById("create-view");
const activeView = document.getElementById("active-view");
const topicInput = document.getElementById("topic-input");
const createBtn = document.getElementById("create-btn");
const endBtn = document.getElementById("end-btn");
const sessionTopic = document.getElementById("session-topic");
const sessionDate = document.getElementById("session-date");
const clipCount = document.getElementById("clip-count");
const errorBox = document.getElementById("error-box");
const recentClipsList = document.getElementById("recent-clips-list");

function showError(msg) {
  errorBox.textContent = "⚠️ " + msg;
  errorBox.style.display = "block";
  setTimeout(() => {
    errorBox.style.display = "none";
  }, 4000);
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function showCreateView() {
  createView.style.display = "block";
  activeView.style.display = "none";
}

function showActiveView(session) {
  createView.style.display = "none";
  activeView.style.display = "block";
  sessionTopic.textContent = session.topic_name;
  sessionDate.textContent = formatDate(session.created_at);
}

// Load current state on popup open
chrome.runtime.sendMessage({ type: "GET_SESSION" }, (session) => {
  if (session && session.id) {
    showActiveView(session);
    updateClipCount(session.id);
    loadRecentClips();
  } else {
    showCreateView();
  }
});

function loadRecentClips() {
  recentClipsList.innerHTML = '<div style="text-align:center; color:#9999B3; padding:10px;">Loading clips...</div>';
  chrome.runtime.sendMessage({ type: "GET_RECENT_CLIPS" }, (clips) => {
    if (!clips || clips.length === 0) {
      recentClipsList.innerHTML = '<div style="text-align:center; color:#9999B3; padding:10px; font-size:12px;">No clips saved yet.</div>';
      return;
    }

    recentClipsList.innerHTML = "";
    clips.forEach(clip => {
      const div = document.createElement("div");
      div.className = "clip-item";
      
      const titleSpan = document.createElement("span");
      titleSpan.className = "clip-title";
      titleSpan.textContent = clip.title || "Untitled";
      titleSpan.title = clip.title || "Untitled";
      
      const delBtn = document.createElement("button");
      delBtn.className = "delete-clip-btn";
      delBtn.innerHTML = "🗑️";
      delBtn.title = "Delete Clip";
      
      delBtn.addEventListener("click", () => {
        delBtn.disabled = true;
        delBtn.innerHTML = "⏳";
        chrome.runtime.sendMessage({ type: "DELETE_CLIP", clipId: clip.id }, (res) => {
          if (res?.error) {
            showError(res.error);
            delBtn.disabled = false;
            delBtn.innerHTML = "🗑️";
          } else {
            div.remove();
            // Update counter
            chrome.storage.local.get("clipCount", (data) => {
               const newCount = Math.max(0, (data.clipCount || 0) - 1);
               chrome.storage.local.set({ clipCount: newCount });
               clipCount.textContent = newCount;
               if (newCount === 0) loadRecentClips(); // refresh to show empty state
            });
          }
        });
      });

      div.appendChild(titleSpan);
      div.appendChild(delBtn);
      recentClipsList.appendChild(div);
    });
  });
}

// Update clip count from storage
function updateClipCount() {
  chrome.storage.local.get("clipCount", (data) => {
    clipCount.textContent = data.clipCount || 0;
  });
}

// Create session
createBtn.addEventListener("click", () => {
  const topic = topicInput.value.trim();
  if (!topic) {
    showError("Please enter a topic name.");
    return;
  }

  createBtn.disabled = true;
  createBtn.textContent = "Creating...";

  chrome.runtime.sendMessage(
    { type: "CREATE_SESSION", topicName: topic },
    (response) => {
      createBtn.disabled = false;
      createBtn.innerHTML = "🎬 Create Session";

      if (response?.error) {
        showError(response.error);
        return;
      }

      chrome.storage.local.set({ clipCount: 0 });
      showActiveView(response);
      topicInput.value = "";
    }
  );
});

// End session
endBtn.addEventListener("click", () => {
  endBtn.disabled = true;
  endBtn.textContent = "Ending...";

  chrome.runtime.sendMessage({ type: "END_SESSION" }, (response) => {
    endBtn.disabled = false;
    endBtn.innerHTML = "⏹ End Session";

    if (response?.error) {
      showError(response.error);
      return;
    }

    chrome.storage.local.set({ clipCount: 0 });
    showCreateView();
  });
});

// Sync Key logic
const syncKeyInput = document.getElementById("sync-key");
const saveSyncBtn = document.getElementById("save-sync-btn");

chrome.storage.local.get("syncKey", (data) => {
  if (data.syncKey) {
    syncKeyInput.value = data.syncKey;
  }
});

saveSyncBtn.addEventListener("click", () => {
  const key = syncKeyInput.value.trim();
  
  saveSyncBtn.textContent = "Saving...";
  saveSyncBtn.disabled = true;

  chrome.storage.local.set({ syncKey: key }, () => {
    // Notify the backend that this account is now synced
    chrome.runtime.sendMessage({ type: "LINK_ACCOUNT", syncKey: key }, (response) => {
      saveSyncBtn.disabled = false;
      
      if (response && response.error) {
        showError(response.error);
        saveSyncBtn.textContent = "Save";
        return;
      }

      saveSyncBtn.textContent = "Saved ✓";
      setTimeout(() => {
        saveSyncBtn.textContent = "Save";
      }, 2000);
    });
  });
});
