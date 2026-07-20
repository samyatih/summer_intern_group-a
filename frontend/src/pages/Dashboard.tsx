import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trophy, Flame, PlayCircle, Loader2, Plus, X } from "lucide-react";
import API from "@/services/auth";
import { useAuth } from "@/context/AuthContext";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AnimatedBackground } from "@/components/AnimatedBackground";

export default function Dashboard() {
  const { token, logout } = useAuth();
  const [user, setUser] = useState<any>(null);
  const [playlists, setPlaylists] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState("");

  const fetchData = async () => {
    try {
      const [userRes, playlistsRes] = await Promise.all([
        API.get("/api/users/me", { headers: { Authorization: `Bearer ${token}` } }),
        API.get("/api/playlists", { headers: { Authorization: `Bearer ${token}` } })
      ]);
      setUser(userRes.data);
      setPlaylists(playlistsRes.data);
    } catch (err: any) {
      console.error("Failed to fetch dashboard data", err);
      if (err.response?.status === 401) {
        logout();
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [token]);

  const handleImport = async () => {
    setImportError("");
    if (!importUrl) {
      setImportError("Please enter a URL");
      return;
    }

    let playlistId = "";
    try {
      const urlObj = new URL(importUrl);
      playlistId = urlObj.searchParams.get("list") || "";
    } catch (e) {
      setImportError("Invalid URL format. Please paste a valid YouTube link.");
      return;
    }

    if (!playlistId) {
      setImportError("Could not find a 'list' parameter in the URL. Ensure it's a playlist link.");
      return;
    }

    setImportLoading(true);
    try {
      await API.post("/api/ingest/playlist", { playlist_id: playlistId }, { headers: { Authorization: `Bearer ${token}` } });
      setShowModal(false);
      setImportUrl("");
      // Refresh dashboard data so the new playlist appears instantly
      await fetchData();
    } catch (err: any) {
      setImportError(err.response?.data?.detail || "Failed to import playlist. Check the backend logs or API key.");
    } finally {
      setImportLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground space-y-4">
        <p className="text-xl text-muted-foreground font-semibold">Failed to load user data. Your session may have expired.</p>
        <Button onClick={logout} variant="default">Back to Login</Button>
      </div>
    );
  }

  const xpForNextLevel = user.current_level * 500;
  const progressPercent = (user.total_xp / xpForNextLevel) * 100;

  return (
    <div className="min-h-screen text-foreground transition-colors duration-300 relative">
      <AnimatedBackground />
      <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6 relative z-10">
        {/* Header */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pt-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">
              Welcome back
            </h1>
            <p className="text-muted-foreground mt-1">Select a course to continue.</p>
          </div>
          <ThemeToggle />
        </header>

        {/* Stat Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Total XP */}
          <Card className="glass-card">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total XP</CardTitle>
              <Trophy className="h-5 w-5 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-semibold tracking-tight">{user.total_xp}</div>
            </CardContent>
          </Card>

          {/* Current Level */}
          <Card className="glass-card">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Current Level</CardTitle>
              <div className="h-3 w-3 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-semibold tracking-tight">Level {user.current_level}</div>
              <Progress value={progressPercent} className="h-2.5 mt-4 rounded-full bg-muted overflow-hidden [&>div]:bg-blue-500" />
              <p className="text-xs text-muted-foreground mt-3 font-medium">
                {xpForNextLevel - user.total_xp} XP to Level {user.current_level + 1}
              </p>
            </CardContent>
          </Card>

          {/* Learning Streak */}
          <Card className="glass-card">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Learning Streak</CardTitle>
              <Flame className="h-5 w-5 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-semibold tracking-tight">
                {user.current_streak} <span className="text-lg text-muted-foreground font-medium">Days</span>
              </div>
            </CardContent>
          </Card>
        </div>

          {/* Courses Section */}
          <div className="pt-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
              <h2 className="text-2xl font-semibold">Your Courses</h2>

              <Button
                onClick={() => setShowModal(true)}
                variant="default"
                className="active:scale-95 transition-transform"
              >
                <Plus className="mr-2 h-4 w-4" />
                Import Playlist
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {playlists.length === 0 ? (
                <div className="col-span-2 text-center py-16 px-6 rounded-lg border border-dashed border-border">
                  <p className="text-muted-foreground mb-4">
                    No courses yet. Import a playlist to get started.
                  </p>

                  <Button
                    onClick={() => setShowModal(true)}
                    variant="outline"
                  >
                    Import your first playlist
                  </Button>
                </div>
              ) : (
                playlists.map((playlist) => {
                  const progress =
                    playlist.video_count === 0
                      ? 0
                      : (playlist.completed_videos / playlist.video_count) * 100;

                  return (
                    <Card
                      key={playlist.id}
                      className="glass-card flex flex-col hover:-translate-y-1 hover:border-primary/30 overflow-hidden"
                    >
                      <div className="h-40 w-full overflow-hidden bg-muted">
                        <img
                          src={
                            playlist.thumbnail_url ||
                            "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=800&q=80"
                          }
                          alt="Course Thumbnail"
                          className="w-full h-full object-cover transition-transform duration-500 hover:scale-105"
                        />
                      </div>

                      <CardHeader className="pt-5">
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex gap-2">
                            <Badge variant="secondary">
                              {playlist.video_count} Videos
                            </Badge>

                            {playlist.is_completed && (
                              <Badge className="bg-green-600 hover:bg-green-700 text-white">
                                Completed
                              </Badge>
                            )}
                          </div>
                        </div>

                        <CardTitle className="text-lg line-clamp-1">
                          {playlist.title}
                        </CardTitle>

                        <CardDescription className="mt-1 line-clamp-2">
                          {playlist.description}
                        </CardDescription>
                      </CardHeader>

                      <CardContent className="mt-auto pt-2 pb-6">
                        <div className="flex justify-between items-center text-sm mb-2">
                          <span className="text-muted-foreground">
                            {playlist.completed_videos} / {playlist.video_count} completed
                          </span>

                          <span className="font-semibold">
                            {Math.round(progress)}%
                          </span>
                        </div>

                        <Progress
                          value={progress}
                          className="h-2 mb-4"
                        />

                        <Link
                          to={`/playlist/${playlist.id}`}
                          className="block w-full"
                        >
                          <Button
                            className="w-full active:scale-95 transition-transform"
                            variant="default"
                          >
                            <PlayCircle className="mr-2 h-4 w-4" />
                            Continue
                          </Button>
                        </Link>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>
          </div>

      {/* Import Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <Card className="w-full max-w-md relative glass-card">
            <button
              onClick={() => setShowModal(false)}
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-5 w-5" />
            </button>

            <CardHeader>
              <CardTitle className="text-xl">Import Playlist</CardTitle>
              <CardDescription>
                Paste a YouTube playlist link to import a new course.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">
                  YouTube Link
                </label>
                <input
                  type="text"
                  placeholder="https://youtube.com/playlist?list=..."
                  value={importUrl}
                  onChange={(e) => setImportUrl(e.target.value)}
                  className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
                />
              </div>

              {importError && (
                <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 p-3 rounded-md">
                  {importError}
                </div>
              )}

              <Button
                onClick={handleImport}
                disabled={importLoading}
                className="w-full"
                variant="default"
              >
                {importLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Importing...
                  </>
                ) : (
                  "Import Course"
                )}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
    </div>
  );
}