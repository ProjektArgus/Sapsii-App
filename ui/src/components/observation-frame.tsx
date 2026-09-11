"use client";

import type { Observation } from "@/lib/api";
import { Box, ImageOff } from "lucide-react";
import Image from "next/image";
import { type ReactNode, useEffect, useState } from "react";

export function ObservationFrame({
  observation,
  compact = false,
  missingFallback,
}: {
  observation: Observation;
  compact?: boolean;
  missingFallback?: ReactNode;
}) {
  const evidenceId = observation.evidenceIds[0];
  const [showBoundingBox, setShowBoundingBox] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [aspectRatio, setAspectRatio] = useState(16 / 9);
  const [compactMaximumHeight, setCompactMaximumHeight] = useState(256);

  useEffect(() => {
    if (!compact) return;
    const updateMaximumHeight = () => setCompactMaximumHeight(Math.min(window.innerHeight * 0.36, 256));
    updateMaximumHeight();
    window.addEventListener("resize", updateMaximumHeight);
    return () => window.removeEventListener("resize", updateMaximumHeight);
  }, [compact]);

  if (!evidenceId) {
    return (
      <div className="flex h-24 items-center justify-center border-b border-base-700 bg-black/60 font-mono text-[9px] text-base-500">
        {missingFallback ?? <><ImageOff className="mr-2 h-3 w-3" /> FRAME_NOT_UPLOADED</>}
      </div>
    );
  }

  const box = observation.boundingBox;
  return (
    <div className="border-t border-base-700 bg-base-950/70 p-2" onClick={(event) => event.stopPropagation()}>
      <div
        className="relative mx-auto overflow-hidden border border-base-700 bg-black"
        style={compact
          ? { aspectRatio, width: `min(100%, ${compactMaximumHeight * aspectRatio}px)` }
          : { aspectRatio, width: "100%" }}
      >
        {!imageFailed ? (
          <Image
            src={`/bff/evidence/${evidenceId}`}
            alt={`Captured frame for ${observation.className.replaceAll("_", " ")}`}
            fill
            sizes="20rem"
            unoptimized
            className="object-contain"
            onLoad={(event) => {
              if (event.currentTarget.naturalWidth > 0 && event.currentTarget.naturalHeight > 0) {
                setAspectRatio(event.currentTarget.naturalWidth / event.currentTarget.naturalHeight);
              }
            }}
            onError={() => setImageFailed(true)}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center gap-2 font-mono text-[9px] text-severity-warning">
            {missingFallback ?? <><ImageOff className="h-3.5 w-3.5" /> FRAME_UNAVAILABLE</>}
          </div>
        )}
        {showBoundingBox && !imageFailed && (
          <div
            className="pointer-events-none absolute border-2 border-accent shadow-[0_0_0_1px_rgba(0,0,0,0.8),0_0_12px_rgba(0,255,204,0.45)]"
            style={{
              left: `${box.left * 100}%`,
              top: `${box.top * 100}%`,
              width: `${(box.right - box.left) * 100}%`,
              height: `${(box.bottom - box.top) * 100}%`,
            }}
          >
            <span className="absolute -top-5 left-[-2px] bg-accent px-1 py-0.5 font-mono text-[8px] font-bold uppercase text-base-900">
              {observation.className.replaceAll("_", " ")} {(observation.confidence * 100).toFixed(0)}%
            </span>
          </div>
        )}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="truncate font-mono text-[8px] text-base-600">FRAME {observation.evidenceIds.length > 1 ? `1/${observation.evidenceIds.length}` : "1"}</span>
        <button
          type="button"
          disabled={imageFailed}
          aria-pressed={showBoundingBox}
          onClick={() => setShowBoundingBox((shown) => !shown)}
          className="flex items-center gap-1 border border-base-600 px-2 py-1 font-mono text-[9px] text-base-300 transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Box className="h-3 w-3" /> {showBoundingBox ? "HIDE BOX" : "SHOW BOX"}
        </button>
      </div>
    </div>
  );
}
