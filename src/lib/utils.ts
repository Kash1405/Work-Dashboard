import { useEffect, useState, type KeyboardEvent } from "react";

export const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);

export const pad = (n: number) => String(n).padStart(2, "0");

export const dateKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function parseDateKey(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function atTime(key: string, time?: string) {
  const date = parseDateKey(key);
  if (time) {
    const [h, m] = time.split(":").map(Number);
    date.setHours(h, m, 0, 0);
  }
  return date;
}

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function relativeDay(date: Date) {
  const key = dateKey(date);
  const today = new Date();
  if (key === dateKey(today)) return "Today";
  if (key === dateKey(addDays(today, 1))) return "Tomorrow";
  if (key === dateKey(addDays(today, -1))) return "Yesterday";
  return date.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

export const timeLabel = (date: Date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`;

export function formatDuration(totalSeconds: number) {
  if (totalSeconds <= 0) return "—";
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}h ${pad(m)}m`;
  return `${m}m ${pad(s)}s`;
}

export function downloadFile(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function playChime() {
  try {
    const ctx = new AudioContext();
    [0, 0.18, 0.36].forEach((offset, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = [660, 880, 1100][i];
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + offset);
      gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + offset + 0.3);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + offset);
      osc.stop(ctx.currentTime + offset + 0.32);
    });
  } catch {
    // Audio unavailable.
  }
}

// Time pickers swallow Enter, so submit the surrounding form ourselves.
export function submitOnEnter(event: KeyboardEvent<HTMLFormElement>) {
  if (event.key === "Enter" && (event.target as HTMLElement).tagName === "INPUT") {
    event.preventDefault();
    event.currentTarget.requestSubmit();
  }
}
