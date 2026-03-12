"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/AuthProvider";

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatNumber(num) {
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + "M";
  if (num >= 1_000) return (num / 1_000).toFixed(1) + "K";
  return num?.toString() || "—";
}

function platformTag(platform) {
  const p = platform?.toLowerCase() || "";
  if (p.includes("tiktok"))
    return <span className="tag tag-tiktok">TikTok</span>;
  if (p.includes("youtube"))
    return <span className="tag tag-youtube">YouTube</span>;
  if (p.includes("instagram"))
    return <span className="tag tag-instagram">Instagram</span>;
  return <span className="tag">{platform}</span>;
}

function sanitizeName(str) {
  return (str || "clip")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, "_")
    .substring(0, 40);
}

function Thumbnail({ url, platform }) {
  const [error, setError] = useState(false);

  if (!url || error) {
    return (
      <div className="w-16 h-24 rounded flex-shrink-0 bg-[var(--color-surface-lighter)] flex items-center justify-center shadow-inner">
        <span className="text-xl opacity-30">{platform?.toLowerCase().includes("youtube") ? "▶️" : "🎬"}</span>
      </div>
    );
  }

  return (
    <div className="w-16 h-24 rounded overflow-hidden flex-shrink-0 bg-black flex items-center justify-center relative shadow-md">
      <img
        src={url}
        alt="thumb"
        referrerPolicy="no-referrer"
        className="w-full h-full object-cover opacity-90 transition-opacity duration-300"
        onError={() => setError(true)}
      />
    </div>
  );
}

export default function ClipDownloader() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [clips, setClips] = useState({});
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(null);
  const [downloadProgress, setDownloadProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState(null);
  const [notification, setNotification] = useState(null);

  const fetchSessions = useCallback(async () => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (!user) return;
      const { data, error: fetchError } = await supabase
        .from("sessions")
        .select("*, clips(count)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (fetchError) throw fetchError;
      setSessions(data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  async function toggleExpand(sessionId) {
    if (expandedId === sessionId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(sessionId);

    if (!clips[sessionId]) {
      try {
        const { data, error: fetchError } = await supabase
          .from("clips")
          .select("*")
          .eq("session_id", sessionId)
          .order("created_at", { ascending: true });

        if (fetchError) throw fetchError;
        setClips((prev) => ({ ...prev, [sessionId]: data || [] }));
      } catch (err) {
        setError(err.message);
      }
    }
  }

  async function downloadAll(session) {
    const sessionClips = clips[session.id];
    if (!sessionClips?.length) return;

    setDownloading(session.id);
    setNotification(null);
    const topicSlug = sanitizeName(session.topic_name);
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < sessionClips.length; i++) {
      const clip = sessionClips[i];
      const num = String(i + 1).padStart(2, "0");
      setDownloadProgress({ current: i + 1, total: sessionClips.length });

      try {
        // Attempt direct download via the API proxy route
        const res = await fetch(
          `/api/download?url=${encodeURIComponent(clip.video_url)}`
        );
        if (res.ok) {
          const contentType = res.headers.get("content-type") || "";
          if (contentType.includes("application/json")) {
            // Server returned an error as JSON
            const err = await res.json();
            console.error(`[Clip ${num}] Server error:`, err.error);
            window.open(clip.video_url, "_blank");
            failCount++;
          } else {
            const blob = await res.blob();
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = `clip_${num}_${topicSlug}.mp4`;
            document.body.appendChild(a);
            a.click();
            URL.revokeObjectURL(a.href);
            a.remove();
            successCount++;
          }
        } else {
          // Log the actual error from the server
          try {
            const errData = await res.json();
            console.error(`[Clip ${num}] Download failed:`, errData.error);
          } catch {
            console.error(`[Clip ${num}] Download failed: HTTP ${res.status}`);
          }
          window.open(clip.video_url, "_blank");
          failCount++;
        }
      } catch (fetchErr) {
        console.error(`[Clip ${num}] Fetch error:`, fetchErr.message);
        window.open(clip.video_url, "_blank");
        failCount++;
      }

      // Delay between downloads to avoid browser blocking
      if (i < sessionClips.length - 1) {
        await new Promise((r) => setTimeout(r, 1500));
      }
    }

    setDownloading(null);
    setDownloadProgress({ current: 0, total: 0 });

    // Show completion notification
    if (failCount === 0) {
      setNotification({ type: "success", message: `✅ All ${successCount} clips downloaded successfully!` });
    } else {
      setNotification({ type: "partial", message: `📥 ${successCount} clips downloaded, ${failCount} opened in browser (login-required or unavailable).` });
    }

    // Auto-dismiss after 8 seconds
    setTimeout(() => setNotification(null), 8000);
  }

  if (loading) {
    return (
      <div className="space-y-4 animate-fade-in">
        <div className="glass rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-accent)] flex items-center justify-center text-sm">
              📥
            </div>
            <h2 className="text-lg font-bold">Clip Downloader</h2>
          </div>
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="shimmer h-16 rounded-xl mb-3"
              style={{ animationDelay: `${i * 0.2}s` }}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="glass rounded-2xl p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-accent)] flex items-center justify-center text-sm">
              📥
            </div>
            <div>
              <h2 className="text-lg font-bold">Clip Downloader</h2>
              <p className="text-xs text-[var(--color-text-muted)]">
                Sessions pushed from the RankFlow Extension
              </p>
            </div>
          </div>
          <button onClick={fetchSessions} className="btn-secondary text-xs">
            ↻ Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-[rgba(255,107,107,0.1)] border border-[var(--color-danger)] rounded-xl p-4 text-sm text-[var(--color-danger)]">
          ⚠️ {error}
        </div>
      )}

      {notification && (
        <div
          className={`rounded-xl p-4 text-sm flex items-center justify-between ${
            notification.type === "success"
              ? "bg-[rgba(85,239,196,0.1)] border border-[#55EFC4] text-[#55EFC4]"
              : "bg-[rgba(253,203,110,0.1)] border border-[#FDCB6E] text-[#FDCB6E]"
          }`}
        >
          <span>{notification.message}</span>
          <button
            onClick={() => setNotification(null)}
            className="ml-4 opacity-60 hover:opacity-100 cursor-pointer transition-opacity"
          >
            ✕
          </button>
        </div>
      )}

      {/* Sessions */}
      {sessions.length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center">
          <div className="text-5xl mb-4">📭</div>
          <h3 className="text-lg font-bold mb-2">No sessions yet</h3>
          <p className="text-[var(--color-text-muted)] text-sm max-w-md mx-auto">
            Use the RankFlow Chrome Extension to create a session, save clips
            while browsing, and end the session. Completed sessions will appear
            here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((session, i) => {
            const isExpanded = expandedId === session.id;
            const sessionClips = clips[session.id] || [];
            const clipCount =
              session.clips?.[0]?.count || sessionClips.length || 0;
            const isDownloading = downloading === session.id;

            return (
              <div
                key={session.id}
                className="glass rounded-xl overflow-hidden card-hover stagger-item"
                style={{ animationDelay: `${i * 0.06}s` }}
              >
                {/* Session Row */}
                <button
                  onClick={() => toggleExpand(session.id)}
                  className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-[var(--color-surface-lighter)] transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-4">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${
                        isExpanded
                          ? "bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-accent)] text-white"
                          : "bg-[var(--color-surface-lighter)] text-[var(--color-text-muted)]"
                      }`}
                    >
                      {isExpanded ? "▼" : "▶"}
                    </div>
                    <div>
                      <h3 className="font-semibold">{session.topic_name}</h3>
                      <p className="text-xs text-[var(--color-text-muted)]">
                        {formatDate(session.created_at)} • {clipCount} clip
                        {clipCount !== 1 ? "s" : ""} •{" "}
                        <span className={session.status === "active" ? "text-[var(--color-accent)]" : "text-[var(--color-text-muted)]"}>
                          {session.status === "active" ? "● Active" : "Ended"}
                        </span>
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {isDownloading && (
                      <span className="text-xs text-[var(--color-accent)] font-medium">
                        {downloadProgress.current}/{downloadProgress.total}
                      </span>
                    )}
                  </div>
                </button>

                {/* Expanded Clips */}
                {isExpanded && (
                  <div className="border-t border-[var(--color-border)] px-5 py-4 space-y-3 bg-[var(--color-surface)] bg-opacity-30">
                    {/* Download All Button */}
                    <div className="flex justify-end">
                      <button
                        onClick={() => downloadAll(session)}
                        disabled={
                          isDownloading || !sessionClips.length
                        }
                        className="btn-primary text-sm flex items-center gap-2"
                      >
                        {isDownloading ? (
                          <>
                            <span className="spinner" />
                            Downloading {downloadProgress.current}/
                            {downloadProgress.total}...
                          </>
                        ) : (
                          <>📥 Download All</>
                        )}
                      </button>
                    </div>

                    {/* Download Progress Bar */}
                    {isDownloading && (
                      <div className="progress-bar">
                        <div
                          className="progress-bar-fill"
                          style={{
                            width: `${
                              (downloadProgress.current /
                                downloadProgress.total) *
                              100
                            }%`,
                          }}
                        />
                      </div>
                    )}

                    {/* Clip List */}
                    {sessionClips.length > 0 ? (
                      <div className="space-y-2">
                        {sessionClips.map((clip, j) => (
                          <div
                            key={clip.id}
                            className="flex items-center gap-4 bg-[var(--color-surface)] rounded-lg px-4 py-3 stagger-item relative overflow-hidden"
                            style={{ animationDelay: `${j * 0.04}s` }}
                          >
                            <span className="text-xs text-[var(--color-text-muted)] font-mono w-6">
                              {String(j + 1).padStart(2, "0")}
                            </span>
                            
                            <Thumbnail url={clip.thumbnail_url} platform={clip.platform} />

                            {platformTag(clip.platform)}
                            
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">
                                {clip.title || "Untitled"}
                              </p>
                              <a
                                href={clip.video_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-[var(--color-primary-light)] hover:text-[var(--color-primary)] transition-colors whitespace-nowrap mt-1 inline-block"
                              >
                                View original ↗
                              </a>
                            </div>
                            
                            <span className="text-xs text-[var(--color-text-muted)] tabular-nums whitespace-nowrap bg-[var(--color-surface-lighter)] px-2 py-1 rounded-md">
                              {formatNumber(clip.view_count)} {clip.platform?.toLowerCase().includes("instagram") ? "likes" : "views"}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-[var(--color-text-muted)] text-center py-4">
                        Loading clips...
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
