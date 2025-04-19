// App.tsx

import "./App.css";

import React, { useEffect, useRef, useState } from "react";
import axios from "axios";

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
    const seconds = totalSeconds % 60;
    return `${hours}h ${minutes}m ${seconds}s`;
};

const extractPlaylistId = (input: string): string | null => {
    try {
        if (/^[a-zA-Z0-9_-]+$/.test(input)) return input;

        const url = new URL(
            input.includes("http") ? input : "https://" + input
        );
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
    const [totalDuration, setTotalDuration] = useState<string | null>(null);
    const [playlistInfo, setPlaylistInfo] = useState<{
        title: string;
        description: string;
        thumbnail: string;
    } | null>(null);
    const [darkMode, setDarkMode] = useState<boolean>(
        () =>
            window.matchMedia &&
            window.matchMedia("(prefers-color-scheme: dark)").matches
    );

    const shareRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // let strIDs;
        // SAMPLE_PLAYLISTS.forEach((value) => {
        //     strIDs += `   "${extractPlaylistId(value)}", `;
        // });
        // console.log(strIDs);
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
                }
            );
            videoIds = res.data.items.map(
                (item: PlaylistItem) => item.contentDetails.videoId
            );

            // videoIds.push(
            //     ...res.data.items.map(
            //         (item: any) => item.contentDetails.videoId
            //     )
            // );
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
            }
        );

        const info = res.data.items?.[0]?.snippet;
        if (info) {
            setPlaylistInfo({
                title: info.title,
                description: info.description,
                thumbnail: info.thumbnails?.medium?.url || "",
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
                }
            );

            totalSeconds += res.data.items.reduce(
                (sum: number, item: VideoItem) => {
                    return sum + parseDuration(item.contentDetails.duration);
                },
                0
            );
        }

        setTotalDuration(formatDuration(totalSeconds));
    };

    const handleSearch = async (customInput?: string) => {
        setLoading(true);
        setError("");
        setPlaylistInfo(null);
        setTotalDuration(null);

        const id = extractPlaylistId(customInput ?? input);
        if (!id) {
            setError(
                "Could not extract playlist ID. Please check the URL or ID."
            );
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
                "Failed to fetch playlist data. Make sure the playlist is public."
            );
        } finally {
            setLoading(false);
        }
    };

    const handleRandom = () => {
        const randomId =
            SAMPLE_PLAYLISTS[
                Math.floor(Math.random() * SAMPLE_PLAYLISTS.length)
            ];
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

    return (
        <>
            <div
                className={`min-h-screen flex flex-col items-center justify-center px-6 py-10 ${
                    darkMode
                        ? "bg-gray-900 text-gray-100"
                        : "bg-gray-100 text-gray-800"
                }`}
            >
                {/* <div className="min-h-screen flex flex-col items-center justify-center px-6 py-10 bg-gray-100 text-gray-800"> */}
                <h1 className="text-3xl font-bold mb-4 text-center">
                    🎵 YouTube Playlist Duration Calculator
                </h1>
                <input
                    type="text"
                    placeholder="Enter Playlist URL or ID"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    className="border p-2 rounded w-full max-w-md mb-4"
                />
                <div className="flex gap-4">
                    <button
                        onClick={() => handleSearch()}
                        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                        disabled={loading || !input}
                    >
                        {loading ? "Loading..." : "Analyze Playlist"}
                    </button>
                    <button
                        onClick={handleRandom}
                        className="bg-purple-500 text-white px-4 py-2 rounded hover:bg-purple-600"
                    >
                        Random Playlist
                    </button>
                    <button
                        onClick={() => setDarkMode((prev) => !prev)}
                        className={`absolute top-4 right-4 dark:bg-gray-700 px-2 py-1 rounded ${
                            darkMode ? "bg-bray-700" : "bg-gray-300"
                        }`}
                    >
                        {darkMode ? "☀️ Light" : "🌙 Dark"}
                    </button>
                </div>

                {error && <p className="text-red-600 mt-4">{error}</p>}

                <div ref={shareRef} id="shareable-section" className="...">
                    {playlistInfo && (
                        <div className="mt-6 bg-white rounded shadow p-4 w-full max-w-lg text-center">
                            <img
                                src={playlistInfo.thumbnail}
                                alt="Playlist Thumbnail"
                                className="mx-auto mb-4 rounded"
                            />
                            <h2 className="text-xl font-bold mb-2 text-gray-900">
                                {playlistInfo.title}
                            </h2>
                            <p className="text-sm text-gray-600 whitespace-pre-wrap">
                                {playlistInfo.description ||
                                    "No description available."}
                            </p>
                            {totalDuration && (
                                <p className="mt-4 text-lg font-semibold text-green-700">
                                    Total Duration: {totalDuration}
                                </p>
                            )}
                        </div>
                    )}
                </div>
            </div>
            {/* </div> */}
        </>
    );
};

export default App;
