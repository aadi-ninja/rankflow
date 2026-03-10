"use client";

import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/AuthProvider";

const SEARCH_KEYWORDS = [
  "Ranking Best",
  "Ranking worst",
  "Ranking Most",
  "Ranking the",
  "ranking",
  "Ranking Funniest",
  "Ranking Funny",
  "Ranking Hilarious",
  "Ranking top 5",
  "Top 5",
  "DONT CHECK THE SOUND",
  "DONT CLICK THE SOUND",
  "DON'T CHECK THE SOUND",
  "DON'T CLICK THE SOUND",
];

const TIME_FILTERS = [
  { label: "Today", value: "today", hours: 24, minHours: 0, viewThreshold: 500000 },
  { label: "3 Days", value: "3days", hours: 72, minHours: 24, viewThreshold: 3000000 },
  { label: "Week", value: "week", hours: 168, minHours: 72, viewThreshold: 10000000 },
  { label: "Month", value: "month", hours: 720, minHours: 168, viewThreshold: 20000000 },
  { label: "2 Months", value: "2months", hours: 1440, minHours: 720, viewThreshold: 50000000 },
];

// Filler words to strip when extracting the core topic
const FILLER_WORDS = [
  "top 10", "top 5", "top 20", "top 50", "top 100",
  "ranked", "ranking", "rankings",
  "strongest", "fastest", "smartest", "best", "most",
  "powerful", "greatest", "worst", "biggest", "smallest",
  "ever", "in the world", "of all time",
  "#shorts", "#short", "shorts", "short",
  "vs", "versus",
];

function extractTopic(title) {
  let topic = title.toLowerCase();
  // Sort filler words by length (longest first) to avoid partial replacements
  const sorted = [...FILLER_WORDS].sort((a, b) => b.length - a.length);
  for (const filler of sorted) {
    topic = topic.replaceAll(filler, "");
  }
  // Clean up extra spaces/punctuation
  topic = topic.replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
  // Capitalize each word
  return topic
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function formatNumber(num) {
  if (num >= 1_000_000_000) return (num / 1_000_000_000).toFixed(1) + "B";
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + "M";
  if (num >= 1_000) return (num / 1_000).toFixed(1) + "K";
  return num.toString();
}

function timeAgo(dateStr) {
  const now = new Date();
  const date = new Date(dateStr);
  const hours = Math.floor((now - date) / (1000 * 60 * 60));
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  return `${weeks}w ago`;
}

function hoursSince(dateStr) {
  return Math.max(1, (new Date() - new Date(dateStr)) / (1000 * 60 * 60));
}

export default function IdeaFinder() {
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState("Search");
  const [apiKey, setApiKey] = useState("");
  const [timeFilter, setTimeFilter] = useState("week");
  const [searchedTimeFilter, setSearchedTimeFilter] = useState("week");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [rawResults, setRawResults] = useState([]);
  const [error, setError] = useState(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);

  // Load history on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem("rf_idea_history");
      if (saved) setHistory(JSON.parse(saved));
    } catch {}
  }, []);

  // Load API key from Supabase settings
  useEffect(() => {
    async function loadKey() {
      if (!supabase || !user) return;
      try {
        const { data } = await supabase
          .from("settings")
          .select("youtube_api_key")
          .eq("id", user.id)
          .single();
        if (data?.youtube_api_key) setApiKey(data.youtube_api_key);
      } catch { }
    }
    loadKey();
  }, [user]);

  function loadHistoryItem(item) {
    setSearchedTimeFilter(item.timeFilter);
    setTimeFilter(item.timeFilter);
    setRawResults(item.videos);
    setHasSearched(true);
    setShowHistory(false);
  }

  const dropdownFilter = TIME_FILTERS.find((f) => f.value === timeFilter);
  const activeFilter = TIME_FILTERS.find((f) => f.value === searchedTimeFilter);

  // Calculate outlier videos
  const outliers = useMemo(() => {
    if (!rawResults.length) return [];
    return rawResults
      .filter((v) => {
        const hrs = hoursSince(v.publishedAt);
        return hrs <= activeFilter.hours && hrs >= activeFilter.minHours && v.viewCount >= activeFilter.viewThreshold;
      })
      .map((v) => {
        const hrs = hoursSince(v.publishedAt);
        const vph = Math.round(v.viewCount / hrs);
        const topic = extractTopic(v.title);
        return { ...v, vph, topic, hrs };
      })
      .sort((a, b) => b.vph - a.vph);
  }, [rawResults, activeFilter]);

  // Detect trend waves
  const trendWaves = useMemo(() => {
    const topicMap = {};
    for (const v of outliers) {
      if (!v.topic) continue;
      if (!topicMap[v.topic]) {
        topicMap[v.topic] = { channels: new Set(), totalViews: 0, videos: [] };
      }
      topicMap[v.topic].channels.add(v.channelTitle);
      topicMap[v.topic].totalViews += v.viewCount;
      topicMap[v.topic].videos.push(v);
    }
    return Object.entries(topicMap)
      .filter(([, data]) => data.channels.size >= 2)
      .map(([topic, data]) => ({
        topic,
        channelCount: data.channels.size,
        totalViews: data.totalViews,
        videos: data.videos,
      }))
      .sort((a, b) => b.totalViews - a.totalViews);
  }, [outliers]);

  // Set of topics that are in a wave
  const waveTopic = useMemo(() => {
    const s = new Set();
    for (const w of trendWaves) s.add(w.topic);
    return s;
  }, [trendWaves]);

  async function handleSearch() {
    if (!apiKey.trim()) {
      setError("No API key found. Go to Settings to add your YouTube Data API key.");
      return;
    }
    setError(null);
    setLoading(true);
    setRawResults([]);
    setHasSearched(true);
    setSearchedTimeFilter(timeFilter);
    setProgress({ current: 0, total: SEARCH_KEYWORDS.length });

    const publishedAfter = new Date(
      Date.now() - dropdownFilter.hours * 60 * 60 * 1000
    ).toISOString();

    const publishedBefore = dropdownFilter.minHours > 0
      ? new Date(Date.now() - dropdownFilter.minHours * 60 * 60 * 1000).toISOString()
      : null;

    const allVideos = new Map();

    for (let i = 0; i < SEARCH_KEYWORDS.length; i++) {
      const keyword = SEARCH_KEYWORDS[i];
      setProgress({ current: i + 1, total: SEARCH_KEYWORDS.length });

      try {
        // Search for shorts using this keyword
        const searchUrl = new URL(
          "https://www.googleapis.com/youtube/v3/search"
        );
        searchUrl.searchParams.set("part", "snippet");
        searchUrl.searchParams.set("q", keyword);
        searchUrl.searchParams.set("type", "video");
        searchUrl.searchParams.set("videoDuration", "short");
        searchUrl.searchParams.set("order", "viewCount");
        searchUrl.searchParams.set("maxResults", "50");
        searchUrl.searchParams.set("publishedAfter", publishedAfter);
        if (publishedBefore) {
          searchUrl.searchParams.set("publishedBefore", publishedBefore);
        }
        searchUrl.searchParams.set("key", apiKey);

        const searchRes = await fetch(searchUrl.toString());
        if (!searchRes.ok) {
          const errData = await searchRes.json();
          throw new Error(
            errData?.error?.message || `API error: ${searchRes.status}`
          );
        }
        const searchData = await searchRes.json();
        const videoIds = searchData.items
          ?.map((item) => item.id?.videoId)
          .filter(Boolean);

        if (!videoIds?.length) continue;

        // Get statistics for each video
        const statsUrl = new URL(
          "https://www.googleapis.com/youtube/v3/videos"
        );
        statsUrl.searchParams.set("part", "snippet,statistics");
        statsUrl.searchParams.set("id", videoIds.join(","));
        statsUrl.searchParams.set("key", apiKey);

        const statsRes = await fetch(statsUrl.toString());
        if (!statsRes.ok) continue;
        const statsData = await statsRes.json();

        for (const item of statsData.items || []) {
          if (allVideos.has(item.id)) continue;
          allVideos.set(item.id, {
            id: item.id,
            title: item.snippet.title,
            channelTitle: item.snippet.channelTitle,
            publishedAt: item.snippet.publishedAt,
            thumbnail: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url || "",
            viewCount: parseInt(item.statistics.viewCount || "0", 10),
            likeCount: parseInt(item.statistics.likeCount || "0", 10),
            url: `https://www.youtube.com/shorts/${item.id}`,
          });
        }
      } catch (err) {
        setError(err.message);
        setLoading(false);
        return;
      }
    }

    const resultsArray = Array.from(allVideos.values());
    setRawResults(resultsArray);

    // Save to history
    try {
      setHistory((prev) => {
        const newHistory = [
          {
            id: Date.now(),
            date: new Date().toISOString(),
            timeFilter,
            videos: resultsArray,
          },
          ...prev,
        ].slice(0, 10); // Keep last 10 searches
        localStorage.setItem("rf_idea_history", JSON.stringify(newHistory));
        return newHistory;
      });
    } catch (e) {
      console.error("Failed to save history:", e);
    }

    setLoading(false);
  }

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Config Panel */}
      <div className="glass rounded-2xl p-6 space-y-5">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-accent)] flex items-center justify-center text-sm">
            🔍
          </div>
          <h2 className="text-lg font-bold">Idea Finder</h2>
          <span className="text-xs text-[var(--color-text-muted)] ml-auto">
            Searches YouTube Shorts for viral ranking topics
          </span>
        </div>

        <div className="flex items-end gap-4">
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1.5 uppercase tracking-wider">
              Time Filter
            </label>
            <select
              value={timeFilter}
              onChange={(e) => setTimeFilter(e.target.value)}
              className="select"
            >
              {TIME_FILTERS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={handleSearch}
            disabled={loading}
            className="btn-primary flex items-center gap-2 h-[42px]"
          >
            {loading ? (
              <>
                <span className="spinner" />
                Searching...
              </>
            ) : (
              <>🚀 Find Ideas</>
            )}
          </button>
          
          {history.length > 0 && (
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="h-[42px] px-4 rounded-xl font-semibold transition-colors flex items-center gap-2 border border-[var(--color-border)] hover:bg-[var(--color-surface-lighter)] text-sm"
              title="View past searches (saves API quota)"
            >
              📜 History
            </button>
          )}
        </div>

        {/* History Dropdown */}
        {showHistory && history.length > 0 && (
          <div className="bg-[var(--color-surface-lighter)] rounded-xl p-4 mt-4 space-y-2 border border-[var(--color-border)] animate-fade-in">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider">
                Recent Searches (Saved Locally)
              </h3>
              <button 
                onClick={() => {
                   if(confirm("Clear all history?")) {
                      localStorage.removeItem("rf_idea_history");
                      setHistory([]);
                      setShowHistory(false);
                   }
                }}
                className="text-xs text-[var(--color-danger)] hover:underline"
              >
                Clear
              </button>
            </div>
            <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {history.map((h) => {
                const filterObj = TIME_FILTERS.find((f) => f.value === h.timeFilter);
                return (
                  <button
                    key={h.id}
                    onClick={() => loadHistoryItem(h)}
                    className="text-left glass rounded-lg p-3 hover:border-[var(--color-accent)] transition-colors group"
                  >
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-bold text-sm">
                        {filterObj?.label || h.timeFilter}
                      </span>
                      <span className="text-xs text-[var(--color-text-muted)] group-hover:text-white transition-colors">
                        {new Date(h.date).toLocaleDateString()}{" "}
                        {new Date(h.date).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <div className="text-xs text-[var(--color-text-muted)]">
                      {h.videos.length} videos fetched
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Progress */}
        {loading && (
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-[var(--color-text-muted)]">
              <span>
                Searching keyword {progress.current} of {progress.total}
              </span>
              <span>
                {Math.round((progress.current / progress.total) * 100)}%
              </span>
            </div>
            <div className="progress-bar">
              <div
                className="progress-bar-fill"
                style={{
                  width: `${(progress.current / progress.total) * 100}%`,
                }}
              />
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-[rgba(255,107,107,0.1)] border border-[var(--color-danger)] rounded-xl p-4 text-sm text-[var(--color-danger)]">
            ⚠️ {error}
          </div>
        )}
      </div>

      {/* Results */}
      {hasSearched && !loading && (
        <>
          {/* Stats Bar */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              {
                label: "Videos Fetched",
                value: rawResults.length,
                icon: "📊",
              },
              { label: "Outliers Found", value: outliers.length, icon: "⚡" },
              {
                label: "Trend Waves",
                value: trendWaves.length,
                icon: "🌊",
              },
              {
                label: "Filter",
                value: `${activeFilter.label} / ${formatNumber(activeFilter.viewThreshold)}+`,
                icon: "🎯",
              },
            ].map((stat, i) => (
              <div
                key={i}
                className="glass rounded-xl p-4 text-center card-hover"
                style={{ animationDelay: `${i * 0.08}s` }}
              >
                <div className="text-2xl mb-1">{stat.icon}</div>
                <div className="text-xl font-bold count-animate">
                  {stat.value}
                </div>
                <div className="text-xs text-[var(--color-text-muted)]">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>

          {/* Trend Waves Section */}
          {trendWaves.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <span className="text-2xl">🌊</span> Trend Waves
                <span className="tag tag-wave">
                  {trendWaves.length} detected
                </span>
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {trendWaves.map((wave, i) => (
                  <div
                    key={i}
                    className="glass rounded-xl p-5 gradient-border card-hover stagger-item"
                    style={{ animationDelay: `${i * 0.1}s` }}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h4 className="font-bold text-[var(--color-accent)]">
                          {wave.topic}
                        </h4>
                        <p className="text-sm text-[var(--color-text-muted)] mt-0.5">
                          {wave.channelCount} channels •{" "}
                          {formatNumber(wave.totalViews)} combined views
                        </p>
                      </div>
                      <span className="tag tag-trend trend-wave-badge">
                        🔥 WAVE
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {wave.videos.slice(0, 4).map((v, j) => (
                        <a
                          key={j}
                          href={v.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs bg-[var(--color-surface)] px-2.5 py-1 rounded-lg hover:bg-[var(--color-surface-lighter)] transition-colors truncate max-w-[200px]"
                          title={v.title}
                        >
                          {v.channelTitle}
                        </a>
                      ))}
                      {wave.videos.length > 4 && (
                        <span className="text-xs text-[var(--color-text-muted)] px-2 py-1">
                          +{wave.videos.length - 4} more
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Outlier Video Cards */}
          {outliers.length > 0 ? (
            <div className="space-y-4">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <span className="text-2xl">⚡</span> Outlier Videos
                <span className="text-sm font-normal text-[var(--color-text-muted)]">
                  Sorted by View Velocity (VPH)
                </span>
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {outliers.map((video, i) => (
                  <a
                    key={video.id}
                    href={video.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="glass rounded-xl overflow-hidden card-hover stagger-item block group"
                    style={{ animationDelay: `${i * 0.05}s` }}
                  >
                    {/* Thumbnail */}
                    <div className="relative aspect-video overflow-hidden bg-[var(--color-surface)]">
                      {video.thumbnail ? (
                        <img
                          src={video.thumbnail}
                          alt={video.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-4xl">🎬</div>
                      )}
                      {/* VPH badge */}
                      <div className="absolute top-2 right-2 bg-[rgba(0,0,0,0.8)] backdrop-blur-sm px-2.5 py-1 rounded-lg">
                        <span className="text-xs font-bold text-[var(--color-accent)]">
                          ⚡ {formatNumber(video.vph)}/h
                        </span>
                      </div>
                      {/* Views badge */}
                      <div className="absolute bottom-2 left-2 bg-[rgba(0,0,0,0.8)] backdrop-blur-sm px-2.5 py-1 rounded-lg">
                        <span className="text-xs font-semibold text-white">
                          👁 {formatNumber(video.viewCount)}
                        </span>
                      </div>
                      {/* Trend wave badge */}
                      {waveTopic.has(video.topic) && (
                        <div className="absolute top-2 left-2">
                          <span className="tag tag-wave text-[10px]">
                            🌊 {video.topic}
                          </span>
                        </div>
                      )}
                    </div>
                    {/* Info */}
                    <div className="p-3">
                      <h4 className="text-sm font-semibold line-clamp-2 mb-1.5 group-hover:text-[var(--color-primary-light)] transition-colors">
                        {video.title}
                      </h4>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-[var(--color-text-muted)] truncate">
                          {video.channelTitle}
                        </span>
                        <span className="text-xs text-[var(--color-text-muted)] whitespace-nowrap ml-2">
                          {timeAgo(video.publishedAt)}
                        </span>
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          ) : (
            hasSearched && (
              <div className="glass rounded-2xl p-12 text-center">
                <div className="text-5xl mb-4">🔎</div>
                <h3 className="text-lg font-bold mb-2">No outliers found</h3>
                <p className="text-[var(--color-text-muted)] text-sm max-w-md mx-auto">
                  Try a different time filter or check back later. Outlier
                  thresholds are intentionally high to surface only truly viral
                  content.
                </p>
              </div>
            )
          )}
        </>
      )}
    </div>
  );
}
