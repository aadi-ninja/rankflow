"use client";

import { useState } from "react";
import AuthProvider, { useAuth } from "@/components/AuthProvider";
import LoginPage from "@/components/LoginPage";
import IdeaFinder from "@/components/IdeaFinder";
import ClipDownloader from "@/components/ClipDownloader";
import Settings from "@/components/Settings";

const TABS = [
  { id: "ideas", label: "Idea Finder", icon: "🔥" },
  { id: "clips", label: "Clip Downloader", icon: "📥" },
  { id: "settings", label: "Settings", icon: "⚙️" },
];

function AppContent() {
  const { user, loading, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState("ideas");

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 animate-fade-in">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-accent)] flex items-center justify-center text-white font-bold text-xl shadow-lg">
            R
          </div>
          <div className="spinner" />
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 glass border-b border-[var(--color-border)]">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-accent)] flex items-center justify-center text-white font-bold text-lg shadow-lg">
              R
            </div>
            <span className="text-xl font-bold bg-gradient-to-r from-[var(--color-primary-light)] to-[var(--color-accent)] bg-clip-text text-transparent">
              RankFlow
            </span>
          </div>

          <nav className="flex gap-1 bg-[var(--color-surface)] rounded-xl p-1">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-5 py-2 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer ${
                  activeTab === tab.id
                    ? "bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-primary-dark)] text-white shadow-md"
                    : "text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-lighter)]"
                }`}
              >
                <span className="mr-2">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </nav>

          {/* User Menu */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              {user.user_metadata?.avatar_url ? (
                <img
                  src={user.user_metadata.avatar_url}
                  alt="Avatar"
                  className="w-8 h-8 rounded-full border-2 border-[var(--color-primary)]"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-[var(--color-primary)] flex items-center justify-center text-white text-sm font-bold">
                  {(user.email || "U")[0].toUpperCase()}
                </div>
              )}
              <span className="text-sm text-[var(--color-text-muted)] hidden md:inline">
                {user.user_metadata?.full_name || user.email?.split("@")[0]}
              </span>
            </div>
            <button
              onClick={signOut}
              className="text-xs px-3 py-1.5 rounded-lg transition-all cursor-pointer"
              style={{
                background: "rgba(255,107,107,0.1)",
                border: "1px solid rgba(255,107,107,0.2)",
                color: "#FF6B6B",
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = "rgba(255,107,107,0.2)";
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = "rgba(255,107,107,0.1)";
              }}
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-8">
        {activeTab === "ideas" && <IdeaFinder />}
        {activeTab === "clips" && <ClipDownloader />}
        {activeTab === "settings" && <Settings />}
      </main>

      {/* Footer */}
      <footer className="border-t border-[var(--color-border)] py-4">
        <p className="text-center text-xs text-[var(--color-text-muted)]">
          RankFlow — Built for ranking-niche creators
        </p>
      </footer>
    </div>
  );
}

export default function Home() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
