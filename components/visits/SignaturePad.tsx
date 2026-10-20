"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";

/** Finger signature. Stored as a small JPEG data URL, the same format the phone app used. */
export function SignaturePad({ label, value, onChange }: { label: string; value: string; onChange: (next: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, rect.width) * ratio;
    canvas.height = Math.max(1, rect.height) * ratio;
    context.scale(ratio, ratio);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, rect.width, rect.height);
    context.lineWidth = 2.2;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = "#182B55";
    if (value) {
      const image = new Image();
      image.onload = () => context.drawImage(image, 0, 0, rect.width, rect.height);
      image.src = value;
    }
    let drawing = false;
    let last = { x: 0, y: 0 };
    const point = (event: PointerEvent) => {
      const box = canvas.getBoundingClientRect();
      return { x: event.clientX - box.left, y: event.clientY - box.top };
    };
    const down = (event: PointerEvent) => {
      drawing = true;
      last = point(event);
      canvas.setPointerCapture(event.pointerId);
    };
    const move = (event: PointerEvent) => {
      if (!drawing) return;
      const next = point(event);
      context.beginPath();
      context.moveTo(last.x, last.y);
      context.lineTo(next.x, next.y);
      context.stroke();
      last = next;
    };
    const up = () => {
      if (!drawing) return;
      drawing = false;
      onChangeRef.current(canvas.toDataURL("image/jpeg", 0.7));
    };
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    return () => {
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
    };
  }, [value]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-ink-2">{label}</p>
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange("")}>
          Borrar
        </Button>
      </div>
      <canvas ref={canvasRef} className="h-36 w-full touch-none rounded-md border border-line bg-white" aria-label={label} />
    </div>
  );
}
