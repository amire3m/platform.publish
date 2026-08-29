"use client";
import { useEffect, useRef, useState } from "react";
import { Play, Pause, Volume2, VolumeX, Maximize, Minimize, Settings, PictureInPicture } from "lucide-react";

interface Props {
  src: string;
  poster?: string;
  title?: string;
  className?: string;
  onError?: () => void;
}

function formatTime(s: number) {
  if (!isFinite(s) || isNaN(s)) return "۰:۰۰";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export function DedicatedPlayer({ src, poster, title, className, onError }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showSettings, setShowSettings] = useState(false);
  const hideTimer = useRef<number | null>(null);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => setCurrent(v.currentTime);
    const onLoaded = () => setDuration(v.duration || 0);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onVolume = () => {
      setMuted(v.muted);
      setVolume(v.volume);
    };
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("loadedmetadata", onLoaded);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("volumechange", onVolume);
    return () => {
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("loadedmetadata", onLoaded);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("volumechange", onVolume);
    };
  }, []);

  useEffect(() => {
    function onFs() {
      setIsFullscreen(!!document.fullscreenElement);
    }
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  function togglePlay() {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play();
    else v.pause();
  }

  function toggleMute() {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
  }

  function handleSeek(e: React.ChangeEvent<HTMLInputElement>) {
    const v = videoRef.current;
    if (!v) return;
    const val = Number(e.target.value);
    v.currentTime = val;
    setCurrent(val);
  }

  function handleVolume(e: React.ChangeEvent<HTMLInputElement>) {
    const v = videoRef.current;
    if (!v) return;
    const val = Number(e.target.value);
    v.volume = val;
    v.muted = val === 0;
  }

  function toggleFullscreen() {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) el.requestFullscreen();
    else document.exitFullscreen();
  }

  function handlePip() {
    const v = videoRef.current as unknown as { requestPictureInPicture?: () => Promise<void> } & HTMLVideoElement;
    if (v && v.requestPictureInPicture && document.pictureInPictureEnabled) {
      v.requestPictureInPicture().catch(() => {});
    }
  }

  function handleRate(rate: number) {
    const v = videoRef.current;
    if (!v) return;
    v.playbackRate = rate;
    setPlaybackRate(rate);
    setShowSettings(false);
  }

  function resetHideTimer() {
    setShowControls(true);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    if (playing && !showSettings) {
      hideTimer.current = window.setTimeout(() => setShowControls(false), 2500) as unknown as number;
    }
  }

  return (
    <div
      ref={containerRef}
      dir="ltr"
      className={`group relative overflow-hidden rounded-xl border border-tg-border bg-black ${className ?? "aspect-video w-full"}`}
      onMouseMove={resetHideTimer}
      onMouseLeave={() => playing && !showSettings && setShowControls(false)}
      onClick={(e) => {
        // click on video toggles play, but not on controls
        const target = e.target as HTMLElement;
        if (target.closest("button") || target.closest("input")) return;
        togglePlay();
      }}
    >
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        preload="metadata"
        playsInline
        className="h-full w-full object-contain"
        onClick={togglePlay}
        onError={onError}
      />
      {title && (
        <div className={`absolute left-0 right-0 top-0 bg-gradient-to-b from-black/70 to-transparent p-3 text-right text-xs font-medium text-white transition-opacity ${showControls ? "opacity-100" : "opacity-0"}`} dir="rtl">
          {title}
        </div>
      )}

      {/* center play */}
      {!playing && (
        <button
          onClick={togglePlay}
          className="absolute left-1/2 top-1/2 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-black shadow-lg transition hover:scale-105"
          aria-label="پخش"
        >
          <Play className="h-6 w-6 translate-x-0.5" />
        </button>
      )}

      {/* controls */}
      <div className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-3 transition-opacity ${showControls ? "opacity-100" : "opacity-0"}`}>
        {/* progress */}
        <div className="mb-2 flex items-center gap-2">
          <span className="w-10 text-right text-[11px] tabular-nums text-white/80">{formatTime(current)}</span>
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={current}
            onChange={handleSeek}
            className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-white/30 accent-white"
          />
          <span className="w-10 text-left text-[11px] tabular-nums text-white/80">{formatTime(duration)}</span>
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <button onClick={togglePlay} className="rounded-full bg-white/15 p-2 text-white hover:bg-white/25" aria-label={playing ? "توقف" : "پخش"}>
              {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </button>
            <button onClick={toggleMute} className="rounded-full p-2 text-white hover:bg-white/15" aria-label="صدا">
              {muted || volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
            <input type="range" min={0} max={1} step={0.05} value={muted ? 0 : volume} onChange={handleVolume} className="hidden h-1 w-20 accent-white sm:block" />
            <span className="hidden text-[11px] text-white/70 sm:inline">{Math.round((muted ? 0 : volume) * 100)}%</span>
          </div>

          <div className="flex items-center gap-1">
            <div className="relative">
              <button onClick={() => setShowSettings((v) => !v)} className="rounded-full p-2 text-white hover:bg-white/15" aria-label="تنظیمات">
                <Settings className="h-4 w-4" />
              </button>
              {showSettings && (
                <div className="absolute bottom-10 right-0 w-32 rounded-lg border border-white/10 bg-zinc-900 p-2 shadow-xl">
                  <p className="mb-1 text-[11px] text-white/60">سرعت</p>
                  {[0.5, 1, 1.25, 1.5, 2].map((r) => (
                    <button
                      key={r}
                      onClick={() => handleRate(r)}
                      className={`flex w-full justify-between rounded px-2 py-1 text-xs ${playbackRate === r ? "bg-white text-black" : "text-white hover:bg-white/10"}`}
                    >
                      <span>{r}×</span>
                      {playbackRate === r && <span>✓</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button onClick={handlePip} className="rounded-full p-2 text-white hover:bg-white/15" aria-label="تصویر در تصویر">
              <PictureInPicture className="h-4 w-4" />
            </button>
            <button onClick={toggleFullscreen} className="rounded-full p-2 text-white hover:bg-white/15" aria-label="تمام صفحه">
              {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
