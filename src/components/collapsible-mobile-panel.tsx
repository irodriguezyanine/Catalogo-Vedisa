"use client";

import { useId, useState, type ReactNode } from "react";

type CollapsibleMobilePanelProps = {
  summary: ReactNode;
  children: ReactNode;
  defaultExpanded?: boolean;
  className?: string;
  panelClassName?: string;
  activeCount?: number;
  expandLabel?: string;
  collapseLabel?: string;
  /** mobile-only: collapsed bar on small screens, always open on md+ */
  mode?: "mobile-only" | "always";
};

function CollapsiblePanelToggle({
  expanded,
  panelId,
  expandLabel,
  collapseLabel,
  onToggle,
}: {
  expanded: boolean;
  panelId: string;
  expandLabel: string;
  collapseLabel: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      aria-controls={panelId}
      aria-label={expanded ? collapseLabel : expandLabel}
      className="ui-focus inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-600"
    >
      <svg
        viewBox="0 0 20 20"
        fill="none"
        className={`h-4 w-4 transition ${expanded ? "rotate-180" : ""}`}
        aria-hidden="true"
      >
        <path
          d="M5 7.5L10 12.5L15 7.5"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

function CollapsiblePanelSummaryBar({
  summary,
  expanded,
  panelId,
  expandLabel,
  collapseLabel,
  activeCount,
  onToggle,
}: {
  summary: ReactNode;
  expanded: boolean;
  panelId: string;
  expandLabel: string;
  collapseLabel: string;
  activeCount: number;
  onToggle: () => void;
}) {
  return (
    <div
      className={`flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-2 py-2 shadow-sm ${
        expanded ? "rounded-b-none border-b-0" : ""
      }`}
    >
      <div className="min-w-0 flex-1">{summary}</div>
      {activeCount > 0 ? (
        <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-cyan-600 px-1.5 text-[10px] font-bold text-white">
          {activeCount}
        </span>
      ) : null}
      <CollapsiblePanelToggle
        expanded={expanded}
        panelId={panelId}
        expandLabel={expandLabel}
        collapseLabel={collapseLabel}
        onToggle={onToggle}
      />
    </div>
  );
}

export function CollapsibleMobilePanel({
  summary,
  children,
  defaultExpanded = false,
  className = "",
  panelClassName = "",
  activeCount = 0,
  expandLabel = "Expandir",
  collapseLabel = "Ocultar",
  mode = "mobile-only",
}: CollapsibleMobilePanelProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const panelId = useId();
  const toggle = () => setExpanded((prev) => !prev);

  if (mode === "always") {
    return (
      <div className={className}>
        <CollapsiblePanelSummaryBar
          summary={summary}
          expanded={expanded}
          panelId={panelId}
          expandLabel={expandLabel}
          collapseLabel={collapseLabel}
          activeCount={activeCount}
          onToggle={toggle}
        />
        <div
          id={panelId}
          hidden={!expanded}
          className={`overflow-hidden rounded-b-xl border border-t-0 border-slate-200 bg-white shadow-sm ${panelClassName}`}
        >
          {children}
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="md:hidden">
        <CollapsiblePanelSummaryBar
          summary={summary}
          expanded={expanded}
          panelId={panelId}
          expandLabel={expandLabel}
          collapseLabel={collapseLabel}
          activeCount={activeCount}
          onToggle={toggle}
        />
        <div
          id={panelId}
          hidden={!expanded}
          className={`overflow-hidden rounded-b-xl border border-t-0 border-slate-200 bg-white shadow-sm ${panelClassName}`}
        >
          {children}
        </div>
      </div>
      <div className={`hidden md:block ${panelClassName}`}>{children}</div>
    </div>
  );
}
