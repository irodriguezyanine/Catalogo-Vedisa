"use client";

import { useEffect, useRef } from "react";
import { CATALOG_HERO_VIDEO_SRC } from "@/lib/catalog-hero-media";

function resumeHeroVideo(video: HTMLVideoElement) {
  if (document.visibilityState !== "visible") return;
  if (video.ended) {
    video.currentTime = 0;
  }
  if (video.paused) {
    void video.play().catch(() => {
      // Some browsers block autoplay until the first user gesture.
    });
  }
}

export function CatalogHeroBackgroundVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.loop = true;
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");

    const handleResume = () => resumeHeroVideo(video);

    handleResume();

    video.addEventListener("ended", handleResume);
    video.addEventListener("pause", handleResume);
    video.addEventListener("stalled", handleResume);
    video.addEventListener("suspend", handleResume);
    video.addEventListener("waiting", handleResume);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        handleResume();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    const keepAliveId = window.setInterval(handleResume, 2500);

    const unlockAutoplay = () => {
      handleResume();
    };
    window.addEventListener("pointerdown", unlockAutoplay, { passive: true });
    window.addEventListener("keydown", unlockAutoplay, { passive: true });
    window.addEventListener("touchstart", unlockAutoplay, { passive: true });

    return () => {
      video.removeEventListener("ended", handleResume);
      video.removeEventListener("pause", handleResume);
      video.removeEventListener("stalled", handleResume);
      video.removeEventListener("suspend", handleResume);
      video.removeEventListener("waiting", handleResume);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.clearInterval(keepAliveId);
      window.removeEventListener("pointerdown", unlockAutoplay);
      window.removeEventListener("keydown", unlockAutoplay);
      window.removeEventListener("touchstart", unlockAutoplay);
    };
  }, []);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div className="absolute inset-0 bg-slate-900" />
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full object-cover"
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        tabIndex={-1}
        disablePictureInPicture
        disableRemotePlayback
      >
        <source src={CATALOG_HERO_VIDEO_SRC} type="video/mp4" />
      </video>
      <div className="hero-video-overlay absolute inset-0" />
    </div>
  );
}
