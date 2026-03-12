// ==========================
// RankFlow Content Script — TikTok
// ==========================
// Injects "Save Clip" buttons and a "Sort by Views" toolbar on TikTok search pages.

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

  // Listen for session changes
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
    injectToolbar();
    if (sessionActive) injectSaveButtons();
    observeNewVideos();
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

    // TikTok search results container
    const container = document.querySelector(
      '[data-e2e="search_top-item-list"], [data-e2e="search-common-link"]'
    )?.parentElement;

    if (!container) {
      // Try alternative selectors for different TikTok layouts
      const altContainer = document.querySelector(
        ".tiktok-x6y88p-DivItemContainerV2, .DivItemContainerForSearch"
      )?.parentElement;
      if (!altContainer) return;
    }

    const cards = Array.from(
      document.querySelectorAll(
        '[data-e2e="search-card-desc"], [data-e2e="search_top-item"], .tiktok-1s72ajr-DivWrapper'
      )
    ).map((el) => el.closest('[class*="DivItemContainer"], [class*="Wrapper"]') || el.parentElement);

    const unique = [...new Set(cards)].filter(Boolean);

    const videos = unique.map((el) => {
      const viewText = el.querySelector(
        '[data-e2e="search-card-like-container"] strong, [data-e2e="video-views"] strong, strong'
      )?.textContent || "";
      const views = parseViewCount(viewText);
      return { el, views };
    });

    videos.sort((a, b) => b.views - a.views);

    const parent = videos[0]?.el?.parentElement;
    if (!parent) return;

    for (const v of videos) {
      parent.appendChild(v.el);
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
    const thumb =
      el.querySelector("a img, video, canvas")?.parentElement || el;
    thumb.style.position = "relative";

    const label = document.createElement("div");
    label.className = "rf-view-label";
    label.textContent = "👁 " + formatViews(views);
    thumb.appendChild(label);
  }

  // ---- Save Clip Buttons ----

  function injectSaveButtons() {
    // Disable save buttons entirely on the Search Results page
    if (window.location.pathname.startsWith("/search")) return;

    // 1. Select search cards and standard feed
    const cards = document.querySelectorAll(
      '[data-e2e="search_top-item"], [data-e2e="search-card-desc"], [class*="DivItemContainer"], [class*="DivVideoCardContainer"], [data-e2e="recommend-list-item-container"], .tiktok-ws4x78-DivVideoContainer, [data-e2e="feed-video"]'
    );
    for (const el of cards) {
      addSaveButton(el);
    }
    
    // 2. Fullscreen Video Player natively
    if (window.location.pathname.includes("/video/")) {
      injectFullscreenButton();
    }
  }

  function injectFullscreenButton() {
    if (document.querySelector(".rf-save-btn-fullscreen")) return;
    
    // Find the right sidebar container (usually holds the copy link box or author info)
    const copyLinkBox = document.querySelector('[data-e2e="browse-copy"]')?.parentElement || document.querySelector('[class*="CopyLinkContainer"]');
    const authorBox = document.querySelector('[data-e2e="browse-user-avatar"]')?.parentElement?.parentElement;
    
    const container = copyLinkBox || authorBox;
    if (!container) return;

    const url = window.location.href.split('?')[0];
    
    const btn = document.createElement("button");
    btn.className = "rf-save-btn-fullscreen";
    btn.style.width = "100%";
    btn.style.padding = "12px";
    btn.style.marginTop = "12px";
    btn.style.marginBottom = "12px";
    btn.style.borderRadius = "8px";
    btn.style.backgroundColor = "rgba(255, 255, 255, 0.08)";
    btn.style.color = "white";
    btn.style.border = "1px solid rgba(255, 255, 255, 0.12)";
    btn.style.fontWeight = "bold";
    btn.style.cursor = "pointer";
    btn.style.transition = "background-color 0.2s";
    
    btn.onmouseover = () => btn.style.backgroundColor = "rgba(255, 255, 255, 0.12)";
    btn.onmouseout = () => btn.style.backgroundColor = "rgba(255, 255, 255, 0.08)";

    if (savedUrls.has(url)) {
      btn.textContent = "✅ Saved to RankFlow";
      btn.style.backgroundColor = "rgba(32, 215, 96, 0.2)";
      btn.style.borderColor = "rgba(32, 215, 96, 0.4)";
    } else {
      btn.textContent = "💾 Save Clip to RankFlow";
    }

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      
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
                btn.textContent = "✅ Saved to RankFlow";
              }, 2000);
            } else {
              savedUrls.delete(url);
              btn.textContent = "💾 Save Clip to RankFlow";
              btn.style.backgroundColor = "rgba(255, 255, 255, 0.08)";
              btn.style.borderColor = "rgba(255, 255, 255, 0.12)";
              decrementClipCount();
            }
          }
        );
        return;
      }

      const title = document.querySelector('[data-e2e="browse-video-desc"]')?.textContent?.trim() || document.title || "Untitled TikTok";
      
      // Extract thumbnail from the fullscreen video player by finding the active video
      let videoEl = null;
      const videos = Array.from(document.querySelectorAll("video"));
      if (videos.length === 1) {
        videoEl = videos[0];
      } else if (videos.length > 1) {
        let maxArea = 0;
        const vh = window.innerHeight || document.documentElement.clientHeight;
        const vw = window.innerWidth || document.documentElement.clientWidth;
        for (const v of videos) {
          const rect = v.getBoundingClientRect();
          const visW = Math.max(0, Math.min(rect.right, vw) - Math.max(rect.left, 0));
          const visH = Math.max(0, Math.min(rect.bottom, vh) - Math.max(rect.top, 0));
          const area = visW * visH;
          if (area > maxArea) { maxArea = area; videoEl = v; }
        }
        if (!videoEl) videoEl = videos[0];
      }
      
      let thumbnailUrl = "";
      
      // 1. Check the video poster attribute (rarely set by TikTok but best if exists)
      if (videoEl) {
        thumbnailUrl = videoEl.getAttribute("poster") || "";
      }
      
      // 2. Find the actual <img> poster inside the video player container
      //    TikTok uses <img> tags with tiktokcdn URLs as video posters, not the video[poster] attr
      if (!thumbnailUrl && videoEl) {
        const playerContainer = videoEl.closest('[class*="DivPlayerContainer"], [class*="PlayerContainer"], [class*="VideoContainer"]') || videoEl.parentElement?.parentElement;
        if (playerContainer) {
          const posterImgs = Array.from(playerContainer.querySelectorAll("img")).filter(img =>
            img.src && (img.src.includes("tiktokcdn") || img.src.includes("-sign")) && !img.src.includes("avt-") && img.width > 50
          );
          if (posterImgs.length > 0) thumbnailUrl = posterImgs[0].src;
        }
      }
      
      // 3. Check for TikTok's custom .ttplayer-poster div with background-image
      if (!thumbnailUrl) {
        const ttPoster = document.querySelector(".ttplayer-poster");
        if (ttPoster) {
          const bgStyle = ttPoster.style.backgroundImage || window.getComputedStyle(ttPoster).backgroundImage;
          const bgMatch = bgStyle?.match(/url\(["']?(.+?)["']?\)/);
          if (bgMatch && bgMatch[1]) thumbnailUrl = bgMatch[1];
        }
      }
      
      // 4. Fallback: any large img on the page with a tiktokcdn URL
      if (!thumbnailUrl) {
        const allImgs = Array.from(document.querySelectorAll("img")).filter(img =>
          img.src && (img.src.includes("tiktokcdn") || img.src.includes("-sign")) && !img.src.includes("avt-") && !img.src.includes("100:100")
        );
        if (allImgs.length > 0) thumbnailUrl = allImgs[0].src;
      }
      
      // 5. Last resort: og:image meta tag
      if (!thumbnailUrl) {
        const ogImage = document.querySelector('meta[property="og:image"]')?.content || "";
        if (ogImage && !ogImage.includes("logo")) {
          thumbnailUrl = ogImage;
        }
      }
      
      // Try to find views in the sidebar, or default to 0
      const viewText = document.querySelector('[data-e2e="browse-like-count"]')?.textContent || "0";
      // Note: TikTok fullscreen doesn't easily expose view count, so we use like count as a proxy or just save it.
      const viewCount = parseViewCount(viewText) * 10; // Rough estimate since TikTok hides views here

      btn.textContent = "⏳ Saving...";
      btn.disabled = true;

      chrome.runtime.sendMessage(
        {
          type: "SAVE_CLIP",
          clip: { url, title: title.substring(0, 200), platform: "TikTok", viewCount, thumbnailUrl },
        },
        (response) => {
          if (response?.error) {
            btn.textContent = "❌ Error";
            setTimeout(() => {
              btn.textContent = "💾 Save Clip to RankFlow";
              btn.disabled = false;
            }, 2000);
          } else {
            savedUrls.set(url, response.id);
            btn.textContent = "✅ Saved to RankFlow";
            btn.style.backgroundColor = "rgba(32, 215, 96, 0.2)";
            btn.style.borderColor = "rgba(32, 215, 96, 0.4)";
            incrementClipCount();
          }
        }
      );
    });

    if (copyLinkBox) {
       copyLinkBox.parentNode.insertBefore(btn, copyLinkBox);
    } else {
       container.appendChild(btn);
    }
  }

  function removeSaveButtons() {
    document.querySelectorAll(".rf-save-btn, .rf-save-btn-fullscreen").forEach((btn) => btn.remove());
  }

  function addSaveButton(cardEl) {
    if (cardEl.querySelector(".rf-save-btn")) return;

    let link =
      cardEl.querySelector("a[href*='/video/']") ||
      cardEl.querySelector("a[href*='/@']") ||
      cardEl.querySelector("a");
      
    // If it's a fullscreen TikTok player or feed, grab URL from the window
    let url = link?.href;
    if (!url && window.location.pathname.includes("/video/")) {
      url = window.location.href;
    }
    
    if (!url || !url.includes("tiktok.com")) return;

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
        cardEl.querySelector('[data-e2e="search-card-video-caption"], [data-e2e="search-card-desc"]')?.textContent?.trim() ||
        cardEl.querySelector('[data-e2e="video-desc"]')?.textContent?.trim() ||
        cardEl.querySelector("h1[data-e2e='browse-video-desc']")?.textContent?.trim() ||
        link?.textContent?.trim() ||
        "Untitled TikTok";

      const viewText =
        cardEl.querySelector(
          '[data-e2e="search-card-like-container"] strong, strong'
        )?.textContent || "";
      const viewCount = parseViewCount(viewText);
      
      // Extract thumbnail from card image or video poster
      const tempVideo = cardEl.querySelector("video");
      const possibleImgs = Array.from(cardEl.querySelectorAll("img")).filter(img =>
        img.src && !img.src.includes("avt-") && !img.src.includes("100:100")
      );
      // Prioritize large poster images with tiktokcdn URLs (the actual video cover)
      const posterImg = possibleImgs.find(img => img.src && (img.src.includes("-sign") || img.src.includes("tiktokcdn")) && img.width > 50);
      const thumbnailUrl = tempVideo?.getAttribute("poster") || posterImg?.src || possibleImgs[0]?.src || "";

      btn.textContent = "⏳ Saving...";
      btn.disabled = true;

      chrome.runtime.sendMessage(
        {
          type: "SAVE_CLIP",
          clip: {
            url,
            title: title.substring(0, 200),
            platform: "TikTok",
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
    let actionsContainer = cardEl.querySelector(
      '[data-e2e="search-card-like-container"], [data-e2e="video-author-avatar"]' // Common elements in standard feeds
    )?.parentElement;
    
    // For the fullscreen view specifically (from the screenshot)
    if (!actionsContainer) {
       // Look for the container that holds the like/comment buttons
       const likeBtn = cardEl.querySelector('[data-e2e="like-icon"], button[aria-label="Like"]');
       if (likeBtn) actionsContainer = likeBtn.closest('div[class*="ActionItemContainer"]')?.parentElement || likeBtn.parentElement?.parentElement;
    }
    
    if (!actionsContainer) actionsContainer = cardEl;
    
    // Safety check so we don't inject multiple buttons
    if (!actionsContainer.querySelector(".rf-save-btn")) {
       actionsContainer.style.position = "relative";
       actionsContainer.appendChild(btn);
       // Add some spacing if it's in the vertical sidebar
       if (actionsContainer.style.display === "flex" && actionsContainer.style.flexDirection === "column") {
           btn.style.marginTop = "16px";
           btn.style.alignSelf = "center";
       }
    }
  }

  // ---- Observe new videos ----

  function observeNewVideos() {
    const observer = new MutationObserver(() => {
      if (!document.querySelector(".rf-toolbar")) injectToolbar();
      if (sessionActive) injectSaveButtons();
    });
    observer.observe(document.body, { childList: true, subtree: true });
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
