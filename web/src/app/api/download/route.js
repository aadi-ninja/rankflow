import { NextResponse } from "next/server";
import { execSync } from "child_process";

/**
 * API proxy to download videos from social media URLs.
 * - TikTok:    Uses TikWM API (fast, no watermark)
 * - Instagram: Uses instagram-url-direct npm package
 * - YouTube:   Uses system yt-dlp (installed via pip in Docker)
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const videoUrl = searchParams.get("url");

  if (!videoUrl) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
  }

  try {
    let directUrl = videoUrl;

    // --- TikTok: TikWM API ---
    if (videoUrl.includes("tiktok.com")) {
      const apiRes = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(videoUrl)}`);
      const json = await apiRes.json();
      if (json.data && json.data.play) {
        directUrl = json.data.play;
        console.log("[Download] TikTok via TikWM OK");
      } else {
        throw new Error("TikWM API failed to extract TikTok video.");
      }
    }
    // --- Instagram: instagram-url-direct package ---
    else if (videoUrl.includes("instagram.com")) {
      try {
        // Extract shortcode from the Instagram URL
        const shortcodeMatch = videoUrl.match(/\/(p|reel|tv)\/([A-Za-z0-9_-]+)/);
        if (!shortcodeMatch) {
          throw new Error("Could not extract Instagram shortcode from URL.");
        }
        const shortcode = shortcodeMatch[2];

        // Fetch the embed page — this works from datacenter IPs unlike the main page
        const embedUrl = `https://www.instagram.com/p/${shortcode}/embed/`;
        const embedRes = await fetch(embedUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          },
        });
        const html = await embedRes.text();

        // Search for .mp4 URLs in the embed HTML
        const mp4Match = html.match(/(https?:\\\\\/\\\\\/[^"']+\.mp4[^"']*)/);
        if (mp4Match) {
          // Unescape the URL (embed page uses escaped slashes)
          directUrl = mp4Match[1]
            .replace(/\\\\\//g, "/")
            .replace(/\\u0026/g, "&")
            .replace(/&amp;/g, "&");
          console.log("[Download] Instagram via embed page OK");
        } else {
          throw new Error("Could not find video URL in Instagram embed page. Post may be an image or private.");
        }
      } catch (igErr) {
        console.error("[Download] Instagram embed failed:", igErr.message);
        // Fallback: try yt-dlp (works if running locally)
        try {
          const stdout = execSync(
            `yt-dlp --get-url -f "best[ext=mp4]/best" "${videoUrl}"`,
            { encoding: "utf-8", timeout: 30000 }
          ).trim();
          directUrl = stdout.split("\n")[0].trim();
          console.log("[Download] Instagram via yt-dlp fallback OK");
        } catch (ytErr) {
          throw new Error(`Instagram download failed: ${igErr.message}`);
        }
      }
    }
    // --- YouTube: System yt-dlp ---
    else if (videoUrl.includes("youtube.com") || videoUrl.includes("youtu.be")) {
      try {
        const stdout = execSync(
          `yt-dlp --get-url -f "best[ext=mp4]/best" "${videoUrl}"`,
          { encoding: "utf-8", timeout: 30000 }
        ).trim();
        directUrl = stdout.split("\n")[0].trim();
        console.log(`[Download] YouTube via yt-dlp OK`);
      } catch (ytErr) {
        console.error("[Download] yt-dlp failed:", ytErr.stderr || ytErr.message);
        throw new Error(`YouTube download failed: ${ytErr.stderr || ytErr.message}`);
      }
    }

    // --- Proxy the direct video stream back to the client ---
    const response = await fetch(directUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": videoUrl.includes("tiktok.com")
          ? "https://www.tiktok.com/"
          : videoUrl.includes("instagram.com")
          ? "https://www.instagram.com/"
          : videoUrl,
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch video stream: ${response.status}` },
        { status: response.status }
      );
    }

    const contentType = response.headers.get("content-type") || "video/mp4";

    // Guard: don't serve HTML/JSON as a video file
    if (contentType.includes("text/html") || contentType.includes("application/json")) {
      return NextResponse.json(
        { error: "Received HTML/JSON instead of video stream." },
        { status: 500 }
      );
    }

    const blob = await response.arrayBuffer();

    return new NextResponse(blob, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": 'attachment; filename="clip.mp4"',
      },
    });
  } catch (err) {
    console.error("[Download API] Error:", err.message);
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}
