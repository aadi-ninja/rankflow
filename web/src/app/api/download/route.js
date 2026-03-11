import { NextResponse } from "next/server";
import { execSync } from "child_process";

/**
 * API proxy to download videos from social media URLs.
 * - TikTok:    Uses TikWM API (fast, no watermark)
 * - Instagram: Uses system yt-dlp (installed via pip)
 * - YouTube:   Uses system yt-dlp (installed via pip)
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
        console.log(`[Download] TikTok via TikWM OK`);
      } else {
        throw new Error("TikWM API failed to extract TikTok video.");
      }
    }
    // --- Instagram & YouTube: System yt-dlp ---
    else if (videoUrl.includes("instagram.com") || videoUrl.includes("youtube.com") || videoUrl.includes("youtu.be")) {
      try {
        // Use system yt-dlp to get the direct video URL
        const stdout = execSync(
          `yt-dlp --get-url -f "best[ext=mp4]/best" "${videoUrl}"`,
          { encoding: "utf-8", timeout: 30000 }
        ).trim();

        // yt-dlp may return multiple lines (video + audio); take the first
        directUrl = stdout.split("\n")[0].trim();
        console.log(`[Download] yt-dlp extracted: ${directUrl.substring(0, 60)}...`);
      } catch (ytErr) {
        console.error("[Download] yt-dlp failed:", ytErr.stderr || ytErr.message);
        throw new Error(`yt-dlp extraction failed: ${ytErr.stderr || ytErr.message}`);
      }
    }

    // --- Proxy the direct video stream back to the client ---
    const response = await fetch(directUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": videoUrl.includes("tiktok.com") ? "https://www.tiktok.com/" : videoUrl,
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
