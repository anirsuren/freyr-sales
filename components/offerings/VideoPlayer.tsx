"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Maximize,
  Pause,
  Play,
  PictureInPicture2,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
} from "lucide-react";

/**
 * OUR OWN VIDEO CONTROLS, NOT THE BROWSER'S.
 *
 * The default <video controls> chrome is the one part of the material viewer
 * the app cannot style — a grey bar that looks nothing like the rest of the
 * product, with a kebab menu hiding speed and PiP (Anir, Jul 30: "design a
 * custom video player… instead of this clunky old thing, so you can easily do
 * playback speed, etc."). This draws the controls ourselves on top of a bare
 * <video>: scrubber with buffered shading, time, ±10s, volume, speed as
 * one-tap chips (not a submenu), PiP and fullscreen.
 *
 * Behaviour follows what fingers already know from every player: click the
 * picture to play/pause, double-click for fullscreen, controls fade out while
 * playing and return on mouse move; space/K toggle, arrows jump 5s, M mutes,
 * F fullscreens.
 */
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

function clock(t: number): string {
  if (!Number.isFinite(t)) return "0:00";
  const s = Math.floor(t % 60);
  const m = Math.floor(t / 60) % 60;
  const h = Math.floor(t / 3600);
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

export function VideoPlayer({
  src,
  label,
  showTitle = true,
  onTime,
  seekRef,
}: {
  src: string;
  label: string;
  /** Off in the hover peek — the row right under the card already names it. */
  showTitle?: boolean;
  /** Ticks as the recording plays, so a transcript beside it can follow along. */
  onTime?: (seconds: number) => void;
  /** Filled with a seek function, so clicking a transcript line jumps here.
   *  A ref rather than a prop callback: the transcript needs to CALL the
   *  player, and lifting playback state up would re-render the video on every
   *  tick. */
  seekRef?: { current: ((seconds: number) => void) | null };
}) {
  const stage = useRef<HTMLDivElement>(null);
  const vid = useRef<HTMLVideoElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [speed, setSpeed] = useState(1);
  const [speedOpen, setSpeedOpen] = useState(false);
  const speedRef = useRef<HTMLDivElement>(null);
  const [waiting, setWaiting] = useState(true);
  const [showControls, setShowControls] = useState(true);
  const [scrubbing, setScrubbing] = useState(false);

  // Controls stay while paused or scrubbing; while playing they fade 2.4s
  // after the last mouse movement.
  const poke = useCallback(() => {
    setShowControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      const v = vid.current;
      if (v && !v.paused) setShowControls(false);
    }, 2400);
  }, []);
  useEffect(() => () => { if (hideTimer.current) clearTimeout(hideTimer.current); }, []);

  /* Hand the caller a way in. Clicking a transcript line should behave like
     clicking the scrubber: jump there and keep playing if it already was. */
  useEffect(() => {
    if (!seekRef) return;
    seekRef.current = (seconds: number) => {
      const v = vid.current;
      if (!v) return;
      v.currentTime = Math.max(0, seconds);
      setTime(v.currentTime);
      void v.play().catch(() => undefined);
    };
    return () => {
      seekRef.current = null;
    };
  }, [seekRef]);

  // Opening or reloading a material is a read action, never an instruction to
  // start playback. Some browsers restore media state during reload, so pause
  // explicitly as well as omitting the autoplay attribute.
  useEffect(() => {
    const v = vid.current;
    if (!v) return;
    v.autoplay = false;
    v.pause();
    setPlaying(false);
    setShowControls(true);
  }, [src]);

  const toggle = useCallback(() => {
    const v = vid.current;
    if (!v) return;
    if (v.paused) void v.play();
    else v.pause();
  }, []);

  const seekBy = useCallback((delta: number) => {
    const v = vid.current;
    if (!v) return;
    v.currentTime = Math.min(Math.max(0, v.currentTime + delta), v.duration || Infinity);
  }, []);

  const seekTo = useCallback((clientX: number, el: HTMLElement) => {
    const v = vid.current;
    if (!v || !v.duration) return;
    const r = el.getBoundingClientRect();
    const frac = Math.min(Math.max((clientX - r.left) / r.width, 0), 1);
    v.currentTime = frac * v.duration;
    setTime(v.currentTime);
  }, []);

  const fullscreen = useCallback(() => {
    const box = stage.current;
    if (!box) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void box.requestFullscreen();
  }, []);

  // Keyboard, scoped to the stage being on screen (the viewer modal).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === " " || e.key.toLowerCase() === "k") { e.preventDefault(); toggle(); }
      else if (e.key === "ArrowRight") { e.preventDefault(); seekBy(5); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); seekBy(-5); }
      else if (e.key.toLowerCase() === "m") { const v = vid.current; if (v) { v.muted = !v.muted; } }
      else if (e.key.toLowerCase() === "f") { e.preventDefault(); fullscreen(); }
      poke();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle, seekBy, fullscreen, poke]);

  useEffect(() => {
    if (!speedOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!speedRef.current?.contains(e.target as Node)) setSpeedOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSpeedOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [speedOpen]);

  const pct = duration ? (time / duration) * 100 : 0;
  const bufPct = duration ? (buffered / duration) * 100 : 0;

  return (
    <div
      ref={stage}
      className="group relative flex h-full w-full items-center justify-center bg-black"
      onMouseMove={poke}
      onMouseLeave={() => { const v = vid.current; if (v && !v.paused) setShowControls(false); }}
    >
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        aria-label={label}
        ref={vid}
        src={src}
        preload="metadata"
        playsInline
        className="h-full w-full object-contain"
        onClick={toggle}
        onDoubleClick={fullscreen}
        onPlay={() => { setPlaying(true); poke(); }}
        onPause={() => { setPlaying(false); setShowControls(true); }}
        onTimeUpdate={(e) => {
          if (!scrubbing) setTime(e.currentTarget.currentTime);
          onTime?.(e.currentTarget.currentTime);
        }}
        onDurationChange={(e) => setDuration(e.currentTarget.duration)}
        onProgress={(e) => {
          const b = e.currentTarget.buffered;
          if (b.length) setBuffered(b.end(b.length - 1));
        }}
        onVolumeChange={(e) => { setMuted(e.currentTarget.muted); setVolume(e.currentTarget.volume); }}
        onWaiting={() => setWaiting(true)}
        onCanPlay={() => setWaiting(false)}
        onEnded={() => setShowControls(true)}
      />

      {/* Buffering ring — only while the pipe is actually dry. */}
      {waiting && (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="h-12 w-12 animate-spin rounded-full border-[3px] border-white/20 border-t-white" />
        </span>
      )}

      {/* Big centre affordance while paused. */}
      {!playing && !waiting && (
        <button
          onClick={toggle}
          aria-label="Play"
          className="absolute inset-0 m-auto flex h-16 w-16 items-center justify-center rounded-full bg-white/95 text-black shadow-[0_8px_28px_rgba(0,0,0,0.35)] transition-transform hover:scale-105"
        >
          <Play size={26} strokeWidth={2.2} className="ml-1" fill="currentColor" />
        </button>
      )}

      {/* Control deck. */}
      <div
        className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent px-4 pb-3 pt-10 transition-opacity duration-200 ${
          showControls ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        {/* Scrubber: buffered shading under the played fill, a thumb that
            grows on hover, click-or-drag anywhere to jump. */}
        <div
          role="slider"
          aria-label={`Seek within ${label}`}
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(time)}
          tabIndex={0}
          className="group/bar relative mb-2.5 h-4 cursor-pointer"
          onPointerDown={(e) => {
            (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
            setScrubbing(true);
            seekTo(e.clientX, e.currentTarget);
          }}
          onPointerMove={(e) => { if (scrubbing) seekTo(e.clientX, e.currentTarget); }}
          onPointerUp={() => setScrubbing(false)}
        >
          <div className="absolute inset-x-0 top-1/2 h-[4px] -translate-y-1/2 overflow-hidden rounded-full bg-white/25 transition-[height] group-hover/bar:h-[6px]">
            <div className="absolute inset-y-0 left-0 bg-white/35" style={{ width: `${bufPct}%` }} />
            <div className="absolute inset-y-0 left-0 bg-blue-primary" style={{ width: `${pct}%` }} />
          </div>
          <div
            className={`absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-primary shadow transition-transform ${
              scrubbing ? "scale-125" : "scale-0 group-hover/bar:scale-100"
            }`}
            style={{ left: `${pct}%` }}
          />
        </div>

        <div className="flex items-center gap-1.5 text-white">
          <button onClick={toggle} aria-label={playing ? "Pause" : "Play"} className="flex h-9 w-9 items-center justify-center rounded-lg transition-colors hover:bg-white/15">
            {playing ? <Pause size={19} strokeWidth={2.1} fill="currentColor" /> : <Play size={19} strokeWidth={2.1} fill="currentColor" className="ml-0.5" />}
          </button>
          <button onClick={() => seekBy(-10)} aria-label="Back 10 seconds" className="flex h-9 w-9 items-center justify-center rounded-lg transition-colors hover:bg-white/15">
            <RotateCcw size={17} strokeWidth={2} />
          </button>
          <button onClick={() => seekBy(10)} aria-label="Forward 10 seconds" className="flex h-9 w-9 items-center justify-center rounded-lg transition-colors hover:bg-white/15">
            <RotateCw size={17} strokeWidth={2} />
          </button>

          {/* Volume: icon mutes, slider appears on hover of the cluster. */}
          <div className="group/vol flex items-center">
            <button
              onClick={() => { const v = vid.current; if (v) v.muted = !v.muted; }}
              aria-label={muted ? "Unmute" : "Mute"}
              className="flex h-9 w-9 items-center justify-center rounded-lg transition-colors hover:bg-white/15"
            >
              {muted || volume === 0 ? <VolumeX size={19} strokeWidth={2} /> : <Volume2 size={19} strokeWidth={2} />}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              aria-label="Volume"
              onChange={(e) => {
                const v = vid.current;
                if (!v) return;
                v.volume = Number(e.target.value);
                v.muted = v.volume === 0;
              }}
              className="w-0 accent-[color:var(--blue-primary,#0071E3)] opacity-0 transition-all duration-200 group-hover/vol:ml-1 group-hover/vol:w-20 group-hover/vol:opacity-100"
            />
          </div>

          {/* One line, always. In the narrow hover peek the control bar has
              no spare width, and the clock wrapped into "0:00 /" over "3:32"
              (Anir, Aug 8: "the time should always show up on one line"). */}
          <span className="ml-1.5 shrink-0 whitespace-nowrap text-[12.5px] font-medium tnum text-white/90">
            {clock(time)} <span className="text-white/50">/ {clock(duration)}</span>
          </span>

          {/* The name centres on the BAR, not on the leftover space — the
              left control cluster is wider than the right, so flex centering
              drifted it off-middle (Anir, Aug 8: "it's not centered"). In the
              hover peek it is off entirely: the row right below names it. */}
          <span className="min-w-0 flex-1" />
          {showTitle && (
            <span className="pointer-events-none absolute inset-x-0 bottom-[18px] mx-auto w-fit max-w-[34%] truncate text-[12px] text-white/45">
              {label}
            </span>
          )}

          {/* SPEED IS ONE BUTTON. Six always-visible chips ate half the
              control bar — hopeless in the narrow hover peek (Anir, Aug 8:
              "the speed thing should just be a dropdown... click the current
              speed and it'll show me all the other ones"). The bar sits at
              the bottom of the player, so the menu opens UPWARD. */}
          <div ref={speedRef} className="relative mr-1">
            <button
              onClick={() => setSpeedOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={speedOpen}
              aria-label="Playback speed"
              className={`min-w-[44px] rounded-lg px-2 py-1 text-[12px] font-semibold tnum transition-colors ${
                speedOpen ? "bg-white text-black" : "bg-white/10 text-white/90 hover:bg-white/20"
              }`}
            >
              {speed === 1 ? "1×" : `${speed}×`}
            </button>
            {speedOpen && (
              <div
                role="menu"
                className="menu-in absolute bottom-full right-0 z-20 mb-1.5 w-[76px] rounded-lg bg-[#1D1D1F]/95 p-1 shadow-[0_8px_24px_rgba(0,0,0,0.4)] backdrop-blur-md"
                style={{
                  ["--menu-origin" as string]: "bottom right",
                  ["--menu-dir" as string]: -1,
                }}
              >
                {/* Fastest at the top: the list grows upward, so the order
                    reads as a continuation of the closed button below it. */}
                {[...SPEEDS].reverse().map((s) => (
                  <button
                    key={s}
                    role="menuitemradio"
                    aria-checked={speed === s}
                    onClick={() => {
                      const v = vid.current;
                      if (v) { v.playbackRate = s; setSpeed(s); }
                      setSpeedOpen(false);
                    }}
                    className={`block w-full rounded-md px-2 py-1 text-left text-[12px] font-semibold tnum transition-colors ${
                      speed === s ? "bg-white text-black" : "text-white/80 hover:bg-white/15"
                    }`}
                  >
                    {s === 1 ? "1×" : `${s}×`}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={() => { const v = vid.current; if (v && document.pictureInPictureEnabled) void v.requestPictureInPicture(); }}
            aria-label="Picture in picture"
            className="flex h-9 w-9 items-center justify-center rounded-lg transition-colors hover:bg-white/15"
          >
            <PictureInPicture2 size={17} strokeWidth={2} />
          </button>
          <button onClick={fullscreen} aria-label="Fullscreen" className="flex h-9 w-9 items-center justify-center rounded-lg transition-colors hover:bg-white/15">
            <Maximize size={17} strokeWidth={2} />
          </button>
        </div>
      </div>
    </div>
  );
}
