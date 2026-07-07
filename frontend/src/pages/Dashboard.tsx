import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trophy, Flame, PlayCircle, Loader2, Plus, X } from "lucide-react";
import API from "@/services/auth";
import { useAuth } from "@/context/AuthContext";

export default function Dashboard() {
  const { token } = useAuth();
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
    } catch (err) {
      console.error("Failed to fetch dashboard data", err);
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

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  const xpForNextLevel = user.current_level * 500;
  const progressPercent = (user.total_xp / xpForNextLevel) * 100;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 py-10">
      <div className="max-w-5xl mx-auto p-6 space-y-8">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-blue-400 to-indigo-500 bg-clip-text text-transparent">
              Welcome back!
            </h1>
            <p className="text-zinc-400 text-lg mt-1">Select a course to continue leveling up.</p>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="bg-zinc-900/50 backdrop-blur-md border-zinc-800 shadow-xl hover:border-zinc-700 transition-colors">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-zinc-400">Total XP</CardTitle>
              <Trophy className="h-5 w-5 text-yellow-500 drop-shadow-md" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-black text-white">{user.total_xp}</div>
            </CardContent>
          </Card>
          
          <Card className="bg-zinc-900/50 backdrop-blur-md border-zinc-800 shadow-xl hover:border-zinc-700 transition-colors">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-zinc-400">Current Level</CardTitle>
              <div className="h-4 w-4 rounded-full bg-blue-500 animate-pulse shadow-[0_0_10px_rgba(59,130,246,0.8)]" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-black text-white">Lvl {user.current_level}</div>
              <Progress value={progressPercent} className="h-2 mt-4 bg-zinc-800" />
              <p className="text-xs text-zinc-500 mt-2 font-medium">{xpForNextLevel - user.total_xp} XP to Level {user.current_level + 1}</p>
            </CardContent>
          </Card>

          <Card className="bg-zinc-900/50 backdrop-blur-md border-zinc-800 shadow-xl hover:border-zinc-700 transition-colors">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-zinc-400">Learning Streak</CardTitle>
              <Flame className="h-5 w-5 text-orange-500 drop-shadow-md" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-black text-white">{user.current_streak} Days</div>
            </CardContent>
          </Card>
        </div>

        <div className="pt-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
            <h2 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
              Available Courses
            </h2>
            <Button onClick={() => setShowModal(true)} className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold shadow-[0_0_15px_rgba(59,130,246,0.4)] transition-all">
              <Plus className="mr-2 h-5 w-5" /> Import Playlist
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {playlists.length === 0 ? (
              <div className="col-span-2 text-center p-10 bg-zinc-900/30 rounded-2xl border border-zinc-800 border-dashed">
                <p className="text-zinc-400 mb-4">No playlists available.</p>
                <Button onClick={() => setShowModal(true)} variant="outline" className="border-zinc-700 text-zinc-300 hover:text-white">
                  Import your first playlist
                </Button>
              </div>
            ) : playlists.map((playlist) => (
              <Card key={playlist.id} className="bg-zinc-900/60 border-zinc-800 flex flex-col hover:border-blue-500/50 hover:shadow-[0_0_15px_rgba(59,130,246,0.15)] transition-all duration-300 group">
                <CardHeader>
                  <div className="flex justify-between items-start mb-3">
                    <Badge variant="secondary" className="bg-zinc-800/80 text-blue-400 font-semibold border-none">
                      {playlist.video_count} Videos
                    </Badge>
                  </div>
                  <CardTitle className="text-xl text-zinc-100 group-hover:text-blue-400 transition-colors">{playlist.title}</CardTitle>
                  <CardDescription className="text-zinc-400 mt-2 line-clamp-2">{playlist.description}</CardDescription>
                </CardHeader>
                <CardContent className="mt-auto pt-4">
                  <Link to={`/playlist/${playlist.id}`}>
                    <Button className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold transition-all">
                      <PlayCircle className="mr-2 h-5 w-5" /> Start Learning
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>

      {/* Import Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-zinc-900 border border-zinc-700 p-6 rounded-2xl w-full max-w-md shadow-2xl relative">
            <button 
              onClick={() => setShowModal(false)}
              className="absolute top-4 right-4 text-zinc-400 hover:text-white transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
            <h3 className="text-2xl font-bold text-white mb-2">Import Course</h3>
            <p className="text-sm text-zinc-400 mb-6">Paste a YouTube playlist link to dynamically generate a new learning roadmap.</p>
            
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-2 block">YouTube Link</label>
                <input
                  type="text"
                  placeholder="https://youtube.com/playlist?list=..."
                  value={importUrl}
                  onChange={(e) => setImportUrl(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                />
              </div>
              
              {importError && (
                <div className="text-sm text-red-400 bg-red-400/10 border border-red-400/20 p-3 rounded-lg">
                  {importError}
                </div>
              )}

              <Button 
                onClick={handleImport} 
                disabled={importLoading}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-6 rounded-xl text-lg transition-all"
              >
                {importLoading ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Generating Roadmap...
                  </>
                ) : (
                  "Import Course"
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}