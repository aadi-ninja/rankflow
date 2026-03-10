// ==========================
// RankFlow Content Script — Instagram
// ==========================
// Shows a floating "Save Clip" button when viewing a Reel on Instagram DMs or direct Reel page.

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
      checkAndInject();
    }
    if (msg.type === "SESSION_ENDED") {
      sessionActive = false;
      removeFloatingButton();
    }
  });

  function init() {
    checkAndInject();
    // Instagram is an SPA, watch for navigation
    const observer = new MutationObserver(() => {
      checkAndInject();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function isReelPage() {
    const path = window.location.pathname;
    return (
      path.includes("/reel/") ||
      path.includes("/reels/") ||
      path.includes("/p/") ||
      // Check if a video is playing (DM view)
      !!document.querySelector("video")
    );
  }

  function checkAndInject() {
    if (!sessionActive) {
      removeFloatingButton();
      return;
    }

    if (isReelPage() && document.querySelector("video")) {
      injectFloatingButton();
    } else {
      removeFloatingButton();
    }
  }

  function getCleanUrl() {
    // 1. If we are on a dedicated post/reel page, just use the canonical URL or window.href
    if (window.location.pathname.includes("/reel/") || window.location.pathname.includes("/p/")) {
      return window.location.href.split('?')[0];
    }
    
    // 2. If we are in DMs or a popup modal, the window URL is wrong (e.g. /direct/t/...)
    // Try to find the time link inside the modal which points to the actual post
    const timeLink = document.querySelector('article a[href*="/p/"], article a[href*="/reel/"], [role="dialog"] a[href*="/p/"], [role="dialog"] a[href*="/reel/"]');
    if (timeLink && timeLink.href) {
      return timeLink.href.split('?')[0];
    }
    
    // Fallback exactly to what the browser says
    return window.location.href.split('?')[0];
  }

  function injectFloatingButton() {
    const url = getCleanUrl();

    let btn = document.querySelector(".rf-ig-save");
    if (btn) {
      if (btn.dataset.url === url) return; // Already injected for this URL
      btn.remove(); // URL changed (e.g. swiped to next reel), remove and recreate
    }

    btn = document.createElement("button");
    btn.className = "rf-ig-save";
    btn.dataset.url = url;

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

      // Extract a better title (avoid SPA stale titles like "Messages")
      let title = "Instagram Video";
      const dialog = document.querySelector('[role="dialog"]');
      const container = dialog || document;
      
      // Try to find the username
      const userEl = container.querySelector('header a, h2, [data-testid="post-comment-root"] a');
      if (userEl && userEl.textContent) {
        title = `Post by ${userEl.textContent.trim()}`;
      } else {
        const docTitle = document.title || "";
        if (!docTitle.includes("Messages") && docTitle !== "Instagram") {
          title = docTitle;
        }
      }

      // Extract thumbnail (Instagram is tricky)
      let thumbnailUrl = "";
      const videoEl = document.querySelector("video");
      
      if (videoEl) {
        thumbnailUrl = videoEl.getAttribute("poster") || "";
        
        // 1. Check parent container for siblings (like the blurred background or the initial cover img)
        if (!thumbnailUrl) {
          const container = videoEl.closest('div[style*="padding-bottom"], div[style*="height"]');
          if (container) {
            const imgs = Array.from(container.querySelectorAll("img"));
            // Find the highest resolution image
            const bestImg = imgs.sort((a, b) => (b.width * b.height) - (a.width * a.height))[0];
            if (bestImg) thumbnailUrl = bestImg.src;
          }
        }
        
        // 2. Check for background-image style directly on nearby divs
        if (!thumbnailUrl) {
           const bgs = Array.from(document.querySelectorAll('div[style*="background-image"]'));
           if (bgs.length > 0) {
              const style = bgs[0].style.backgroundImage;
              const match = style.match(/url\(['"]?(.*?)['"]?\)/);
              if (match) thumbnailUrl = match[1];
           }
        }
      }
      
      // 3. Last fallback: global page meta tags
      if (!thumbnailUrl) {
        thumbnailUrl = document.querySelector('meta[property="og:image"]')?.content || "";
      }

      btn.textContent = "⏳ Saving...";
      btn.disabled = true;

      chrome.runtime.sendMessage(
        {
          type: "SAVE_CLIP",
          clip: {
            url: url,
            title: title.substring(0, 200),
            platform: "Instagram",
            viewCount: 0,
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

    document.body.appendChild(btn);
  }

  function removeFloatingButton() {
    document.querySelectorAll(".rf-ig-save").forEach((b) => b.remove());
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
