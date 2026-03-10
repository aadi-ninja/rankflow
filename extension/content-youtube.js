// ==========================
// RankFlow Content Script — YouTube
// ==========================
// Injects "Save Clip" buttons and a "Sort by Views" toolbar on YouTube search/results pages.

(function () {
  "use strict";

  let sessionActive = false;
  let sorted = false;
  const savedUrls = new Map(); // url -> clipId

  // Check initial session state
  chrome.runtime.sendMessage({ type: "GET_SESSION" }, (session) => {
    sessionActive = !!(session && session.id);
    init();
  });

  // Listen for session changes from background
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "SESSION_STARTED") {
      sessionActive = true;
      injectSaveButtons();
    }
    if (msg.type === "SESSION_ENDED") {
      sessionActive = false;
      removeSaveButtons();
    }
  });

  function init() {
    if (isSearchOrResultsPage()) {
      injectToolbar();
      if (sessionActive) injectSaveButtons();
      observeNewVideos();
    }

    // Re-check on navigation (YouTube uses SPA)
    const observer = new MutationObserver(() => {
      if (isSearchOrResultsPage()) {
        if (!document.querySelector(".rf-toolbar")) {
          injectToolbar();
        }
        if (sessionActive) injectSaveButtons();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function isSearchOrResultsPage() {
    const path = window.location.pathname;
    const search = window.location.search;
    return (
      path === "/results" ||
      search.includes("search_query") ||
      path === "/" ||
      path.startsWith("/@") ||
      path.startsWith("/hashtag") ||
      path.startsWith("/shorts") // <-- Now supports the Shorts feed natively!
    );
  }

  // ---- Toolbar ----

  function injectToolbar() {
    if (document.querySelector(".rf-toolbar")) return;

    const toolbar = document.createElement("div");
    toolbar.className = "rf-toolbar";

    toolbar.innerHTML = `
      <div class="rf-toolbar-logo">R</div>
      <div class="rf-toolbar-divider"></div>
      <button class="rf-sort-btn" id="rf-sort-views">📊 Sort by Views</button>
    `;

    document.body.appendChild(toolbar);

    document.getElementById("rf-sort-views").addEventListener("click", () => {
      sortByViews();
    });
  }

  function sortByViews() {
    const btn = document.getElementById("rf-sort-views");
    const container = document.querySelector(
      "ytd-section-list-renderer #contents, ytd-rich-grid-renderer #contents"
    );
    if (!container) return;

    const videoElements = Array.from(
      container.querySelectorAll("ytd-video-renderer, ytd-rich-item-renderer")
    );

    const videos = videoElements.map((el) => {
      const viewText =
        el.querySelector("#metadata-line span.inline-metadata-item")
          ?.textContent || el.querySelector(".inline-metadata-item")?.textContent || "";
      const views = parseViewCount(viewText);
      return { el, views };
    });

    videos.sort((a, b) => b.views - a.views);

    for (const v of videos) {
      container.appendChild(v.el);
      addViewLabel(v.el, v.views);
    }

    sorted = true;
    if (btn) {
      btn.classList.add("rf-active");
      btn.textContent = "✅ Sorted by Views";
    }
  }

  function parseViewCount(text) {
    if (!text) return 0;
    const clean = text.toLowerCase().replace(/,/g, "").trim();
    const match = clean.match(/([\d.]+)\s*(b|m|k)?/);
    if (!match) return 0;
    let num = parseFloat(match[1]);
    const suffix = match[2];
    if (suffix === "b") num *= 1e9;
    else if (suffix === "m") num *= 1e6;
    else if (suffix === "k") num *= 1e3;
    return Math.floor(num);
  }

  function formatViews(n) {
    if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
    if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
    if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
    return n.toString();
  }

  function addViewLabel(el, views) {
    if (el.querySelector(".rf-view-label")) return;
    const thumb = el.querySelector("ytd-thumbnail, #thumbnail");
    if (!thumb) return;
    thumb.style.position = "relative";

    const label = document.createElement("div");
    label.className = "rf-view-label";
    label.textContent = "👁 " + formatViews(views);
    thumb.appendChild(label);
  }

  // ---- Save Clip Buttons ----

  function injectSaveButtons() {
    // Both standard videos in lists/grids, and Shorts in the scrolling feed
    const videos = document.querySelectorAll(
      "ytd-video-renderer, ytd-rich-item-renderer, ytd-reel-video-renderer"
    );
    for (const el of videos) {
      addSaveButton(el);
    }
  }

  function removeSaveButtons() {
    document.querySelectorAll(".rf-save-btn").forEach((btn) => btn.remove());
  }

  function addSaveButton(videoEl) {
    if (videoEl.querySelector(".rf-save-btn")) return;

    const link =
      videoEl.querySelector("a#video-title") ||
      videoEl.querySelector("a#video-title-link") ||
      videoEl.querySelector("a[href*='/shorts/']") ||
      videoEl.querySelector("a[href*='/watch']");
      
    // If it's the active Shorts player, the URL is just in the browser window
    let url = link?.href;
    if (!url && window.location.pathname.startsWith("/shorts/")) {
      url = window.location.href;
    }
    
    if (!url) return;

    const btn = document.createElement("button");
    btn.className = "rf-save-btn";

    if (savedUrls.has(url)) {
      btn.textContent = "✅ Saved";
      btn.classList.add("rf-saved");
    } else {
      btn.textContent = "💾 Save Clip";
    }

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      if (savedUrls.has(url)) {
        // DELETE CLIP
        btn.textContent = "⏳ Removing...";
        btn.disabled = true;
        
        chrome.runtime.sendMessage(
          { type: "DELETE_CLIP", clipId: savedUrls.get(url) },
          (response) => {
            btn.disabled = false;
            if (response?.error) {
              btn.textContent = "❌ Error";
              setTimeout(() => {
                btn.textContent = "✅ Saved";
                btn.classList.add("rf-saved");
              }, 2000);
            } else {
              savedUrls.delete(url);
              btn.textContent = "💾 Save Clip";
              btn.classList.remove("rf-saved");
              decrementClipCount();
            }
          }
        );
        return;
      }

      const title =
        videoEl.querySelector("#video-title")?.textContent?.trim() ||
        videoEl.querySelector("h2.title")?.textContent?.trim() || // For Shorts player title
        link?.textContent?.trim() ||
        "Untitled Short";

      const viewText =
        videoEl.querySelector("#metadata-line span.inline-metadata-item")
          ?.textContent || "";
      const viewCount = parseViewCount(viewText);

      // Extract thumbnail
      const thumbImg = videoEl.querySelector("yt-image img, yt-img-shadow img");
      const thumbnailUrl = thumbImg?.src || 
                           document.querySelector('meta[property="og:image"]')?.content || 
                           "";

      btn.textContent = "⏳ Saving...";
      btn.disabled = true;

      chrome.runtime.sendMessage(
        {
          type: "SAVE_CLIP",
          clip: {
            url,
            title,
            platform: "YouTube",
            viewCount,
            thumbnailUrl,
          },
        },
        (response) => {
          if (response?.error) {
            btn.textContent = "❌ Error";
            setTimeout(() => {
              btn.textContent = "💾 Save Clip";
              btn.disabled = false;
            }, 2000);
          } else {
            savedUrls.set(url, response.id);
            btn.textContent = "✅ Saved";
            btn.classList.add("rf-saved");
            incrementClipCount();
          }
        }
      );
    });

    // Where to place the button
    let meta = videoEl.querySelector("#meta, #details, .details");
    
    // For Shorts feed, place inside the right-side actions bar
    if (!meta && videoEl.tagName === "YTD-REEL-VIDEO-RENDERER") {
      meta = videoEl.querySelector("#actions.ytd-reel-video-renderer");
    }
    
    if (!meta) meta = videoEl;
    
    // Check if we haven't already added one to this element
    if (!meta.querySelector(".rf-save-btn")) {
       btn.style.marginTop = "8px"; // Spacing for Shorts feed
       meta.appendChild(btn);
    }
  }

  // ---- Observe new videos loading ----

  function observeNewVideos() {
    const observer = new MutationObserver(() => {
      if (sessionActive) injectSaveButtons();
    });
    const target = document.querySelector(
      "ytd-section-list-renderer, ytd-rich-grid-renderer, ytd-browse, ytd-shorts"
    );
    if (target) {
      observer.observe(target, { childList: true, subtree: true });
    }
  }

  function incrementClipCount() {
    chrome.storage.local.get("clipCount", (data) => {
      chrome.storage.local.set({ clipCount: (data.clipCount || 0) + 1 });
    });
  }

  function decrementClipCount() {
    chrome.storage.local.get("clipCount", (data) => {
      const current = data.clipCount || 0;
      chrome.storage.local.set({ clipCount: Math.max(0, current - 1) });
    });
  }
})();
