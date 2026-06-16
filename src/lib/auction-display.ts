import type { UpcomingAuction } from "@/types/editor";

function parseAuctionStartDate(auction: UpcomingAuction): Date | null {
  if (auction.startAt) {
    const start = new Date(auction.startAt);
    if (!Number.isNaN(start.getTime())) return start;
  }
  if (auction.date) {
    const date = new Date(auction.date);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return null;
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
