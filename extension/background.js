// ==========================
// Supabase Config for Extension
// ==========================
// Replace these with your actual Supabase project values.
// The extension uses the REST API directly (no npm dependency needed).

const SUPABASE_URL = "https://lphcllxmzvyklvulcswc.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxwaGNsbHhtenZ5a2x2dWxjc3djIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxMTEwMTAsImV4cCI6MjA4ODY4NzAxMH0.xwgjb5bgrNKQzbKRDI-hQua0Ro-QXr1NUoDoDynCCJk";

/**
 * Makes a request to the Supabase REST API.
 */
async function supabaseRequest(table, { method = "GET", body, filters = "", select = "*" } = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${table}?select=${select}${filters}`;
  const headers = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json",
    Prefer: method === "POST" ? "return=representation" : "return=minimal",
  };

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase ${method} ${table} failed: ${text}`);
  }

  if (method === "GET" || method === "POST") {
    return res.json();
  }
}

// ==========================
// Session Management
// ==========================

// Listen for messages from popup and content scripts
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "CREATE_SESSION") {
    createSession(msg.topicName).then(sendResponse).catch((e) =>
      sendResponse({ error: e.message })
    );
    return true; // async
  }

  if (msg.type === "END_SESSION") {
    endSession().then(sendResponse).catch((e) =>
      sendResponse({ error: e.message })
    );
    return true;
  }

  if (msg.type === "GET_SESSION") {
    getActiveSession().then(sendResponse).catch((e) =>
      sendResponse({ error: e.message })
    );
    return true;
  }

  if (msg.type === "SAVE_CLIP") {
    saveClip(msg.clip).then(sendResponse).catch((e) =>
      sendResponse({ error: e.message })
    );
    return true;
  }

  if (msg.type === "DELETE_CLIP") {
    deleteClip(msg.clipId).then(sendResponse).catch((e) =>
      sendResponse({ error: e.message })
    );
    return true;
  }

  if (msg.type === "GET_RECENT_CLIPS") {
    getRecentClips().then(sendResponse).catch((e) =>
      sendResponse({ error: e.message })
    );
    return true;
  }

  if (msg.type === "LINK_ACCOUNT") {
    linkAccount(msg.syncKey).then(sendResponse).catch((e) =>
      sendResponse({ error: e.message })
    );
    return true;
  }
});

async function linkAccount(syncKey) {
  // Update the settings table to mark the extension as synced
  await supabaseRequest("settings", {
    method: "PATCH",
    filters: `&id=eq.${syncKey}`,
    body: { extension_synced: true },
  });
  return { success: true };
}

async function createSession(topicName) {
  const { syncKey } = await chrome.storage.local.get("syncKey");
  if (!syncKey) {
    throw new Error("Please add your Sync Key in the extension settings.");
  }

  const data = await supabaseRequest("sessions", {
    method: "POST",
    body: {
      topic_name: topicName,
      user_id: syncKey,
      status: "active",
      created_at: new Date().toISOString(),
    },
  });

  const session = data[0];
  await chrome.storage.local.set({
    activeSession: {
      id: session.id,
      topic_name: session.topic_name,
      created_at: session.created_at,
    },
  });

  // Notify all content scripts that a session is now active
  notifyContentScripts({ type: "SESSION_STARTED", session });
  return session;
}

async function endSession() {
  const { activeSession } = await chrome.storage.local.get("activeSession");
  if (!activeSession) return { error: "No active session" };

  await supabaseRequest("sessions", {
    method: "PATCH",
    filters: `&id=eq.${activeSession.id}`,
    body: { status: "ended" },
  });

  await chrome.storage.local.remove("activeSession");
  notifyContentScripts({ type: "SESSION_ENDED" });
  return { success: true };
}

async function getActiveSession() {
  const { activeSession } = await chrome.storage.local.get("activeSession");
  return activeSession || null;
}

async function saveClip(clip) {
  const { activeSession } = await chrome.storage.local.get("activeSession");
  if (!activeSession) throw new Error("No active session");

  const data = await supabaseRequest("clips", {
    method: "POST",
    body: {
      session_id: activeSession.id,
      video_url: clip.url,
      thumbnail_url: clip.thumbnailUrl || null,
      title: clip.title,
      platform: clip.platform,
      view_count: clip.viewCount || 0,
      created_at: new Date().toISOString(),
    },
  });

  return data[0];
}

async function deleteClip(clipId) {
  const { activeSession } = await chrome.storage.local.get("activeSession");
  if (!activeSession) throw new Error("No active session");

  await supabaseRequest("clips", {
    method: "DELETE",
    filters: `&id=eq.${clipId}`
  });

  return { success: true };
}

async function getRecentClips() {
  const { activeSession } = await chrome.storage.local.get("activeSession");
  if (!activeSession) return [];

  const data = await supabaseRequest("clips", {
    filters: `&session_id=eq.${activeSession.id}&order=created_at.desc&limit=5`
  });

  return data || [];
}

function notifyContentScripts(message) {
  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs) {
      if (
        tab.url &&
        (tab.url.includes("tiktok.com") ||
          tab.url.includes("youtube.com") ||
          tab.url.includes("instagram.com"))
      ) {
        chrome.tabs.sendMessage(tab.id, message).catch(() => { });
      }
    }
  });
}
