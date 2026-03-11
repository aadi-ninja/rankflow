import { NextResponse } from "next/server";
import { execSync } from "child_process";
import { instagramGetUrl } from "instagram-url-direct";

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
        // Convert /p/ URLs to /reel/ if needed (the package prefers /reel/)
        let igUrl = videoUrl;
        const shortcodeMatch = videoUrl.match(/\/(p|reel)\/([A-Za-z0-9_-]+)/);
        if (shortcodeMatch) {
          igUrl = `https://www.instagram.com/reel/${shortcodeMatch[2]}/`;
        }

        const result = await instagramGetUrl(igUrl);

        if (result && result.media_details && result.media_details.length > 0) {
          // Find the first video entry
          const video = result.media_details.find(m => m.type === "video");
          if (video && video.url) {
            directUrl = video.url;
            console.log("[Download] Instagram via instagram-url-direct OK");
          } else {
            // Maybe it's an image post, use the first URL anyway
            directUrl = result.media_details[0].url;
            console.log("[Download] Instagram media (non-video) extracted");
          }
        } else if (result && result.url_list && result.url_list.length > 0) {
          directUrl = result.url_list[0];
          console.log("[Download] Instagram via url_list OK");
        } else {
          throw new Error("Could not extract Instagram video URL.");
        }
      } catch (igErr) {
        console.error("[Download] Instagram package failed:", igErr.message);
        // Fallback: try yt-dlp
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
