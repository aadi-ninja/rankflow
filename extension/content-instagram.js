// ==========================
// RankFlow Content Script — Instagram
// ==========================
// Shows a floating "Save Clip" button when viewing a Reel on Instagram DMs or direct Reel page.

(function () {
  "use strict";

  console.log("RankFlow: Instagram content script loaded.");

  let sessionActive = false;
  let sorted = false;
  const savedUrls = new Map(); // url -> clipId

  function parseCount(text) {
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

      // Extract title/author
      const dialog = document.querySelector('[role="dialog"]');
      const container = dialog || document;
      
      let author = "Instagram Video";
      const authorSelectors = [
        'header a[href*="/"] span',
        'header a',
        'article header a',
        '[role="dialog"] header a',
        'h2 a',
        '[data-testid="post-comment-root"] a'
      ];
      
      for (const sel of authorSelectors) {
        const el = container.querySelector(sel);
        if (el && el.textContent.trim() && el.textContent.trim().length > 1) {
          author = el.textContent.trim();
          break;
        }
      }
      
      if (author === "Instagram Video") {
        const metaTitle = document.querySelector('meta[property="og:title"]')?.content;
        if (metaTitle && metaTitle.includes("on Instagram")) {
          author = metaTitle.split(" on Instagram")[0].replace("•", "").trim();
        }
      }
      
      let title = `Post by ${author}`;
      
      // Extract Views/Likes (Instagram often shows likes instead of views for reels)
      let viewCount = 0;
      const bodyText = document.body.innerText;
      
      // 1. Try to find likes in the DOM (based on user snippet)
      const allButtons = Array.from(document.querySelectorAll('[role="button"], span, div'));
      const metricsBtn = allButtons.find(b => {
        const txt = b.innerText.toLowerCase();
        return (txt.includes("likes") || txt.includes("views")) && /[\d.,KMB]+/.test(txt);
      });
      
      if (metricsBtn) {
        const match = metricsBtn.innerText.match(/([\d.,KMB]+)\s*(likes|views)/i);
        if (match && match[1]) {
          viewCount = parseCount(match[1]);
        }
      }
      
      // 2. Fallback to general text search if button not found or failed
      if (!viewCount) {
        // Handle non-breaking spaces (\u00A0) and regular spaces
        const viewMatch = bodyText.match(/([\d.,KMB]+)[\s\u00A0]*(views|likes)/i);
        if (viewMatch) viewCount = parseCount(viewMatch[1]);
      }

      console.log(`RankFlow: Extracted Stats - Author: ${author}, Engagement: ${viewCount}`);

      // Extract thumbnail (Instagram is tricky)
      let thumbnailUrl = "";
      
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
      
      if (videoEl) {
        // 1. Direct poster attribute
        thumbnailUrl = videoEl.getAttribute("poster") || "";
        
        // 2. Search for the poster image in the most likely containers
        if (!thumbnailUrl) {
          const container = videoEl.closest('article, [role="dialog"], [class*="Carousel"], [class*="MediaContainer"]') || videoEl.parentElement?.parentElement?.parentElement || document.body;
          
          // Find all images in this container
          const imgs = Array.from(container.querySelectorAll("img")).filter(img => {
             if (!img.src || img.src.includes("data:image") || img.src.includes("logo")) return false;
             const src = img.src.toLowerCase();
             if (src.includes(".gif") || src.includes("giphy") || src.includes("external")) return false;
             // Ignore small avatars but be more permissive if nothing else exists
             if (src.includes("150x150") || src.includes("s32x32") || src.includes("invites")) return false;
             if (img.closest('ul') || img.closest('form')) return false;
             return true;
          });

          const sortedImgs = imgs.map(img => {
             const rect = img.getBoundingClientRect();
             const area = (img.naturalWidth || rect.width || 1) * (img.naturalHeight || rect.height || 1);
             let distance = 0;
             let parent = img.parentElement;
             while (parent && !parent.contains(videoEl)) { distance++; parent = parent.parentElement; }
             return { img, area, distance };
          }).sort((a, b) => (Math.abs(a.area - b.area) > 10000) ? (b.area - a.area) : (a.distance - b.distance));

          if (sortedImgs.length > 0) thumbnailUrl = sortedImgs[0].img.src;
        }
        
        // 3. Deep Style Search (background-images)
        if (!thumbnailUrl) {
           let searchEl = videoEl;
           for (let i = 0; i < 4; i++) {
              if (!searchEl) break;
              const sibs = Array.from(searchEl.parentElement?.children || []);
              for (const sib of sibs) {
                 const bg = window.getComputedStyle(sib).backgroundImage;
                 if (bg && bg.includes("url(") && bg.includes("cdninstagram.com")) {
                    const match = bg.match(/url\(["']?(.+?)["']?\)/);
                    if (match && match[1]) { thumbnailUrl = match[1]; break; }
                 }
              }
              if (thumbnailUrl) break;
              searchEl = searchEl.parentElement;
           }
        }

        // 4. ULTIMATE FALLBACK: Canvas Frame Capture (as requested by user)
        if (!thumbnailUrl) {
           try {
              const canvas = document.createElement("canvas");
              canvas.width = videoEl.videoWidth || videoEl.clientWidth || 300;
              canvas.height = videoEl.videoHeight || videoEl.clientHeight || 500;
              const ctx = canvas.getContext("2d");
              ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
              const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
              if (dataUrl && dataUrl.length > 1000) {
                 thumbnailUrl = dataUrl;
              }
           } catch (e) {
              console.log("RankFlow: Video capture blocked by security (CORS), trying meta tags.");
           }
        }
      }
      
      // 5. Global Fallback: Page meta tags
      if (!thumbnailUrl) {
        thumbnailUrl = document.querySelector('meta[property="og:image"]')?.content || "";
        if (thumbnailUrl.includes("logo")) thumbnailUrl = "";
      }

      console.log("RankFlow: Extracted Thumbnail URL:", thumbnailUrl ? (thumbnailUrl.startsWith("data") ? "Base64 Image" : thumbnailUrl) : "NONE");

      btn.textContent = "⏳ Saving...";
      btn.disabled = true;

      chrome.runtime.sendMessage(
        {
          type: "SAVE_CLIP",
          clip: {
            url: url,
            title: title.substring(0, 200),
            platform: "Instagram",
            viewCount: viewCount,
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
