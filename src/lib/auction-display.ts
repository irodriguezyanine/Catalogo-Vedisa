import type { UpcomingAuction } from "@/types/editor";

const CHILE_TIME_ZONE = "America/Santiago";

function parseAuctionStartDate(auction: UpcomingAuction): Date | null {
  if (auction.startAt) {
    const start = new Date(auction.startAt);
    if (!Number.isNaN(start.getTime())) return start;
  }
  const rawDate = (auction.date ?? "").trim();
  if (!rawDate) return null;

  if (rawDate.includes("T")) {
    const parsed = new Date(rawDate);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  const dateMatch = rawDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!dateMatch) {
    const fallback = new Date(rawDate);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }

  const timeMatch = auction.name.match(/(\d{1,2}):(\d{2})/);
  const hours = timeMatch ? Number(timeMatch[1]) : 10;
  const minutes = timeMatch ? Number(timeMatch[2]) : 0;
  const pad = (value: number) => String(value).padStart(2, "0");
  const localIso = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}T${pad(hours)}:${pad(minutes)}:00`;
  const parsed = new Date(localIso);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseAuctionEndDate(auction: UpcomingAuction): Date | null {
  if (auction.endAt) {
    const end = new Date(auction.endAt);
    if (!Number.isNaN(end.getTime())) return end;
  }
  return null;
}

function formatClock(date: Date): string {
  return date.toLocaleTimeString("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function formatAuctionHumanSchedule(auction: UpcomingAuction): string {
  const start = parseAuctionStartDate(auction);
  const end = parseAuctionEndDate(auction);
  if (!start) return "Fecha por confirmar";

  const dayLabel = start.toLocaleDateString("es-CL", {
    weekday: "long",
    day: "numeric",
    month: "short",
  });
  const capitalizedDay = dayLabel.charAt(0).toUpperCase() + dayLabel.slice(1);

  if (end && end.getTime() > start.getTime()) {
    const sameDay = start.toDateString() === end.toDateString();
    if (sameDay) {
      return `${capitalizedDay} · ${formatClock(start)}–${formatClock(end)}`;
    }
    const endDay = end.toLocaleDateString("es-CL", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
    return `${capitalizedDay} · ${formatClock(start)} → ${endDay} · ${formatClock(end)}`;
  }

  return `${capitalizedDay} · ${formatClock(start)}`;
}

export function formatHeroNextRemateLabel(auction: UpcomingAuction): string | null {
  const start = parseAuctionStartDate(auction);
  if (!start) return null;

  const weekday = start.toLocaleDateString("es-CL", {
    weekday: "long",
    timeZone: CHILE_TIME_ZONE,
  });
  const day = start.toLocaleDateString("es-CL", {
    day: "numeric",
    timeZone: CHILE_TIME_ZONE,
  });
  const month = start.toLocaleDateString("es-CL", {
    month: "long",
    timeZone: CHILE_TIME_ZONE,
  });
  const time = start.toLocaleTimeString("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: CHILE_TIME_ZONE,
  });

  return `Próximo remate el ${weekday} ${day} de ${month} a las ${time}`;
}

export function formatAuctionDaysUntilBadge(auction: UpcomingAuction, nowMs = Date.now()): string | null {
  const start = parseAuctionStartDate(auction);
  if (!start) return null;
  const diffMs = start.getTime() - nowMs;
  if (diffMs <= 0) return "En curso o finalizado";
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Hoy";
  if (diffDays === 1) return "En 1 día";
  if (diffDays <= 14) return `En ${diffDays} días`;
  return null;
}
