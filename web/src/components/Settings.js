"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/AuthProvider";

export default function Settings() {
  const { user } = useAuth();
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [isSynced, setIsSynced] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (user) loadSettings();
    else setLoading(false);
  }, [user]);

  async function loadSettings() {
    if (!supabase) {
      setLoading(false);
      return;
    }
    try {
      const { data, error: fetchError } = await supabase
        .from("settings")
        .select("youtube_api_key, extension_synced")
        .eq("id", user.id)
        .single();

      if (fetchError && fetchError.code !== "PGRST116") throw fetchError;
      
      if (data?.youtube_api_key) {
        setApiKey(data.youtube_api_key);
        setSaved(true);
      }
      if (data?.extension_synced) {
        setIsSynced(true);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!apiKey.trim()) {
      setError("Please enter your API key.");
      return;
    }
    if (!supabase) {
      setError("Supabase not configured.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const { error: upsertError } = await supabase
        .from("settings")
        .upsert({
          id: user.id,
          user_id: user.id,
          youtube_api_key: apiKey.trim(),
          updated_at: new Date().toISOString(),
        });

      if (upsertError) throw upsertError;
      setSaved(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-xl mx-auto space-y-6 animate-fade-in">
        <div className="glass rounded-2xl p-6">
          <div className="shimmer h-8 w-48 rounded-lg mb-4" />
          <div className="shimmer h-12 rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto space-y-6 animate-fade-in">
      <div className="glass rounded-2xl p-6 space-y-5">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-accent)] flex items-center justify-center text-sm">
            ⚙️
          </div>
          <h2 className="text-lg font-bold">Settings</h2>
        </div>

        {/* YouTube API Key */}
        <div>
          <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1.5 uppercase tracking-wider">
            YouTube Data API Key
          </label>
          <p className="text-xs text-[var(--color-text-muted)] mb-3">
            Get one free from{" "}
            <a
              href="https://console.cloud.google.com/apis/credentials"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--color-primary-light)] hover:underline"
            >
              Google Cloud Console
            </a>
            {" "}→ Enable YouTube Data API v3 → Create Credentials → API Key
          </p>
          <div className="flex gap-3">
            <input
              type="password"
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                setSaved(false);
              }}
              placeholder="AIzaSy..."
              className="input flex-1"
            />
            <button
              onClick={handleSave}
              disabled={saving || (saved && true)}
              className={`${saved ? "btn-secondary" : "btn-primary"} whitespace-nowrap flex items-center gap-2`}
            >
              {saving ? (
                <>
                  <span className="spinner" /> Saving...
                </>
              ) : saved ? (
                "✅ Saved"
              ) : (
                "💾 Save"
              )}
            </button>
          </div>
        </div>

        {/* Extension Sync Key */}
        <div className="pt-4 border-t border-[var(--color-border)]">
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">
              Extension Sync Key
            </label>
            {isSynced && (
              <span className="text-xs font-bold text-[var(--color-accent)] bg-[rgba(85,239,196,0.1)] px-2 py-0.5 rounded-md border border-[var(--color-accent)]">
                ✅ Synced
              </span>
            )}
          </div>
          <p className="text-xs text-[var(--color-text-muted)] mb-3">
            Paste this key into the RankFlow Chrome Extension settings to link your account.
          </p>
          <div className="flex gap-3">
            <input
              type="text"
              readOnly
              value={user?.id || ""}
              className="input flex-1 bg-[var(--color-surface-lighter)] font-mono text-xs text-[var(--color-text-muted)]"
              onClick={(e) => e.target.select()}
            />
            <button
              onClick={() => {
                navigator.clipboard.writeText(user?.id || "");
                const btn = document.getElementById("copy-btn");
                btn.textContent = "✅ Copied";
                setTimeout(() => (btn.textContent = "📋 Copy"), 2000);
              }}
              id="copy-btn"
              className="btn-secondary whitespace-nowrap"
            >
              📋 Copy
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-[rgba(255,107,107,0.1)] border border-[var(--color-danger)] rounded-xl p-4 text-sm text-[var(--color-danger)]">
            ⚠️ {error}
          </div>
        )}

        {saved && (
          <div className="bg-[rgba(85,239,196,0.1)] border border-[var(--color-accent)] rounded-xl p-4 text-sm text-[var(--color-accent)]">
            ✅ Your API key is saved. The Idea Finder will use it automatically.
          </div>
        )}
      </div>

      {/* Info Card */}
      <div className="glass rounded-2xl p-6 space-y-3">
        <h3 className="text-sm font-bold flex items-center gap-2">
          <span>💡</span> About YouTube API Quota
        </h3>
        <ul className="text-xs text-[var(--color-text-muted)] space-y-1.5 list-disc list-inside">
          <li>Free tier: 10,000 units/day</li>
          <li>Each "Find Ideas" run uses ~500 units</li>
          <li>You can search ~18 times per day for free</li>
          <li>If you exceed the limit, the API stops until midnight PT — no charges</li>
        </ul>
      </div>
    </div>
  );
}
