"use client";

import { useEffect, useRef } from "react";
import SignaturePad from "signature_pad";
import { Button } from "@/components/ui/button";

/** Drawn signature. The pad is signature_pad; the parent reads a PNG data URL. */
export function SignatureCanvas({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePad | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const pad = new SignaturePad(canvas, { backgroundColor: "rgba(255,255,255,0)", penColor: "#182b55" });
    padRef.current = pad;
    const resize = () => {
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const rect = canvas.getBoundingClientRect();
      const data = pad.toData();
      canvas.width = rect.width * ratio;
      canvas.height = rect.height * ratio;
      const context = canvas.getContext("2d");
      context?.scale(ratio, ratio);
      pad.clear();
      if (data.length) pad.fromData(data);
    };
    resize();
    const end = () => onChange(pad.isEmpty() ? null : pad.toDataURL("image/png"));
    pad.addEventListener("endStroke", end);
    window.addEventListener("resize", resize);
    return () => {
      pad.removeEventListener("endStroke", end);
      window.removeEventListener("resize", resize);
      pad.off();
    };
  }, [onChange]);

  return (
    <div>
      <canvas ref={canvasRef} className="h-36 w-full rounded-lg border border-line bg-surface" aria-label="Dibuja tu firma" />
      <Button
        type="button"
        variant="ghost"
        className="mt-1"
        onClick={() => {
          padRef.current?.clear();
          onChange(null);
        }}
      >
        Borrar dibujo
      </Button>
    </div>
  );
}
