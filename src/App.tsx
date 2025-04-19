// App.tsx

import "./App.css";

import React, { useEffect, useRef, useState } from "react";
import axios from "axios";
// import html2canvas from "html2canvas";
import html2canvas from "html2canvas-pro";

const YOUTUBE_API_KEY = import.meta.env.VITE_YOUTUBE_API_KEY;

const SAMPLE_PLAYLISTS = [
  "PL9bw4S5ePsEHfkR5aLXTU4Yf_1Rtw98lH",
  "PL9bw4S5ePsEGj_qcEj7SQcGFgDViWSZUF",
  "PLFs4vir_WsTxontcYm5ctqp89cNBJKNrs",
  "PLFs4vir_WsTySi9F8v5pvCi6zQj7Cwneu",
  "PLFs4vir_WsTwEd-nJgVJCZPNL3HALHHpF",
  "PLINj2JJM1jxOxE-4mVaEJCEzO1CiR0Cwm",
  "PLINj2JJM1jxObDqF8VXonjQhrBnnMrtGH",
];

interface PlaylistItem {
  contentDetails: {
    videoId: string;
  };
}

interface VideoItem {
  contentDetails: {
    duration: string;
  };
}

const parseDuration = (iso: string): number => {
  const regex = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/;
  const match = iso.match(regex);
  const hours = parseInt(match?.[1] || "0");
  const minutes = parseInt(match?.[2] || "0");
  const seconds = parseInt(match?.[3] || "0");
  return hours * 3600 + minutes * 60 + seconds;
};

const formatDuration = (totalSeconds: number): string => {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const parts = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds >= 0 || parts.length === 0) parts.push(`${seconds}s`);
  return parts.join(" ");
};

const extractPlaylistId = (input: string): string | null => {
  try {
    if (/^[a-zA-Z0-9_-]+$/.test(input)) return input;

    const url = new URL(input.includes("http") ? input : "https://" + input);
    const params = new URLSearchParams(url.search);
    if (params.has("list")) return params.get("list");

    const match = input.match(/[?&]list=([a-zA-Z0-9_-]+)/);
    return match?.[1] ?? null;
  } catch {
    return /^[a-zA-Z0-9_-]+$/.test(input) ? input : null;
  }
};

const App: React.FC = () => {
  const [input, setInput] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [totalDuration1x, setTotalDuration1x] = useState<number>(0);
  const [playlistInfo, setPlaylistInfo] = useState<{
    title: string;
    description: string;
    thumbnail: string;
    id: string;
  } | null>(null);
  const [darkMode, setDarkMode] = useState<boolean>(
    () =>
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches,
  );

  const shareRef = useRef<HTMLDivElement>(null);

  const handleDownloadImage = async () => {
    if (!shareRef.current) return;

    try {
      const canvas = await html2canvas(shareRef.current, {
        backgroundColor: darkMode ? "#1f2937" : "#ffffff", // force a safe background
        useCORS: true, // allows cross-origin images like thumbnails
        removeContainer: true, // removes generated temp DOM nodes
        // ignoreElements: (el) => {
        //   // optionally ignore dynamic elements
        //   return false;
        // },
        // Prevent html2canvas from applying browser CSS (like oklch)
        // Instead, only take inline styles or basic layout
        windowWidth: document.documentElement.offsetWidth,
        windowHeight: document.documentElement.offsetHeight,
      });

      const dataURL = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.href = dataURL;
      // link.download = `youtube_playlist_summary.png`;
      const safeTitle =
        playlistInfo?.title.replace(/[^a-z0-9]/gi, "_").toLowerCase() ||
        "youtube_playlist";
      link.download = `${safeTitle}_summary.png`;
      link.click();
    } catch (err) {
      console.error("Image download failed:", err);
    }
  };

  useEffect(() => {
    const listener = (e: MediaQueryListEvent) => setDarkMode(e.matches);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", listener);
    return () => mq.removeEventListener("change", listener);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);

  const getVideoIds = async (playlistId: string): Promise<string[]> => {
    let videoIds: string[] = [];
    let nextPageToken = "";

    do {
      const res = await axios.get(
        "https://www.googleapis.com/youtube/v3/playlistItems",
        {
          params: {
            part: "contentDetails",
            maxResults: 50,
            playlistId,
            pageToken: nextPageToken,
            key: YOUTUBE_API_KEY,
          },
        },
      );
      videoIds = res.data.items.map(
        (item: PlaylistItem) => item.contentDetails.videoId,
      );
      nextPageToken = res.data.nextPageToken;
    } while (nextPageToken);

    return videoIds;
  };

  const fetchPlaylistDetails = async (playlistId: string) => {
    const res = await axios.get(
      "https://www.googleapis.com/youtube/v3/playlists",
      {
        params: {
          part: "snippet",
          id: playlistId,
          key: YOUTUBE_API_KEY,
        },
      },
    );

    const info = res.data.items?.[0]?.snippet;
    const playlistIdFromResponse = res.data.items?.[0]?.id;
    if (info && playlistIdFromResponse) {
      setPlaylistInfo({
        title: info.title,
        description: info.description,
        thumbnail: info.thumbnails?.medium?.url || "",
        id: playlistIdFromResponse,
      });
    }
  };

  const calculateTotalDuration = async (playlistId: string) => {
    const videoIds = await getVideoIds(playlistId);
    let totalSeconds = 0;

    for (let i = 0; i < videoIds.length; i += 50) {
      const batch = videoIds.slice(i, i + 50);
      const res = await axios.get(
        "https://www.googleapis.com/youtube/v3/videos",
        {
          params: {
            part: "contentDetails",
            id: batch.join(","),
            key: YOUTUBE_API_KEY,
          },
        },
      );

      totalSeconds += res.data.items.reduce((sum: number, item: VideoItem) => {
        return sum + parseDuration(item.contentDetails.duration);
      }, 0);
    }

    setTotalDuration1x(totalSeconds);
  };

  const handleSearch = async (customInput?: string) => {
    setLoading(true);
    setError("");
    setPlaylistInfo(null);
    setTotalDuration1x(0);

    const id = extractPlaylistId(customInput ?? input);
    if (!id) {
      setError("Could not extract playlist ID. Please check the URL or ID.");
      setLoading(false);
      return;
    }

    try {
      await fetchPlaylistDetails(id);
      await calculateTotalDuration(id);

      // Update URL to ?list=[playlistId]
      const newURL = `${window.location.origin}${window.location.pathname}?list=${id}`;
      window.history.replaceState({}, "", newURL);
    } catch (err) {
      console.error(err);
      setError(
        "Failed to fetch playlist data. Make sure the playlist is public.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleRandom = () => {
    const randomId =
      SAMPLE_PLAYLISTS[Math.floor(Math.random() * SAMPLE_PLAYLISTS.length)];
    setInput(randomId);
    handleSearch(randomId);
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const listId = params.get("list") || params.get("id");
    if (listId) {
      setInput(listId);
      handleSearch(listId);
    }
  }, []);

  const openPlaylist = () => {
    if (playlistInfo?.id) {
      window.open(
        `https://www.youtube.com/playlist?list=${playlistInfo.id}`,
        "_blank",
      );
    }
  };

  return (
    <>
      <div
        className={`flex min-h-screen flex-col items-center justify-center px-6 py-10 ${
          darkMode ? "bg-gray-900 text-gray-100" : "bg-gray-100 text-gray-800"
        }`}
      >
        <h1 className="mb-4 text-center text-3xl font-bold">
          🎵 YouTube Playlist Duration Calculator
        </h1>
        <input
          type="text"
          placeholder="Enter Playlist URL or ID"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="mb-4 w-full max-w-md rounded border p-2"
        />
        <div className="flex gap-4">
          <button
            onClick={() => handleSearch()}
            className="cursor-pointer rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
            disabled={loading || !input}
          >
            {loading ? "Loading..." : "Analyze Playlist"}
          </button>
          <button
            onClick={handleRandom}
            className="cursor-pointer rounded bg-purple-500 px-4 py-2 text-white hover:bg-purple-600"
          >
            Random Playlist
          </button>
          <button
            onClick={() => setDarkMode((prev) => !prev)}
            className={`absolute top-4 right-4 rounded px-2 py-1 dark:bg-gray-700 ${
              darkMode ? "bg-bray-700" : "bg-gray-300"
            }`}
          >
            {darkMode ? "☀️ Light" : "🌙 Dark"}
          </button>
        </div>

        {error && <p className="mt-4 text-red-600">{error}</p>}

        <div ref={shareRef} id="shareable-section" className="mt-6">
          {playlistInfo && (
            <div className="w-full max-w-lg rounded bg-white p-4 text-center shadow">
              <button
                onClick={openPlaylist}
                className="mb-4 block w-full overflow-hidden rounded"
              >
                <img
                  src={playlistInfo.thumbnail}
                  alt="Playlist Thumbnail"
                  className="mx-auto h-auto w-full cursor-pointer"
                />
              </button>
              <h2 className="mb-2 text-xl font-bold text-gray-900">
                {playlistInfo.title}
              </h2>
              <p className="mb-2 text-sm whitespace-pre-wrap text-gray-600">
                {playlistInfo.description || "No description available."}
              </p>
              {totalDuration1x > 0 && (
                <div className="mt-4 text-lg font-semibold text-green-700">
                  <p>Total Duration:</p>
                  <p>1x: {formatDuration(totalDuration1x)}</p>
                  <p>1.5x: {formatDuration(totalDuration1x / 1.5)}</p>
                  <p>2x: {formatDuration(totalDuration1x / 2)}</p>
                </div>
              )}
            </div>
          )}
        </div>
        {playlistInfo && (
          // <div className="align-center flex justify-center">
          <>
            {playlistInfo.id && (
              <button
                onClick={openPlaylist}
                className="mt-4 cursor-pointer rounded bg-green-500 px-4 py-2 text-white hover:bg-green-600"
              >
                Open Playlist
              </button>
            )}
            <div className="max-w-lg">
              <button
                onClick={handleDownloadImage}
                className="mt-4 w-full cursor-pointer rounded bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700"
              >
                📸 Download Image
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
};

export default App;
