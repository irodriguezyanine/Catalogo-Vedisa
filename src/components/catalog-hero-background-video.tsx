"use client";

import { useEffect, useRef } from "react";
import { CATALOG_HERO_VIDEO_SRC } from "@/lib/catalog-hero-media";

export function CatalogHeroBackgroundVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    void video.play().catch(() => {
      // Autoplay can be blocked until user interaction; poster/fallback still visible.
    });
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
        preload="metadata"
        tabIndex={-1}
      >
        <source src={CATALOG_HERO_VIDEO_SRC} type="video/mp4" />
      </video>
      <div className="hero-video-overlay absolute inset-0" />
    </div>
  );
}
