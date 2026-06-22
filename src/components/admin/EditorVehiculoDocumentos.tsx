"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  inferLotDocumentKind,
  isLotDocumentLabelBlocked,
  lotDocumentKindBadgeClass,
  lotDocumentOpenUrl,
  normalizeLotDocumentLabelKey,
  type LotDocumentLink,
} from "@/lib/lot-documents";
import type { TasacionesDocumentoGestion } from "@/lib/tasaciones-documentos";

type EditorDocRow =
  | {
      key: string;
      source: "inventario";
      id: string;
      url: string;
      label: string;
      mimeType?: string;
      visibleCatalogo: boolean;
      puedeToggle: boolean;
    }
  | {
      key: string;
      source: "editor";
      url: string;
      label: string;
      mimeType?: string;
      visibleCatalogo: boolean;
      puedeToggle: boolean;
      editorIndex: number;
    };

const iconBtn =
  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors disabled:opacity-45";

function IconEye({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="currentColor" aria-hidden="true">
      <path d="M10 4c3.38 0 6.63 2 8.37 5.42a1.3 1.3 0 0 1 0 1.16C16.63 14 13.38 16 10 16s-6.63-2-8.37-5.42a1.3 1.3 0 0 1 0-1.16C3.37 6 6.62 4 10 4Zm0 2c-2.6 0-5.16 1.5-6.71 4 .01.02.02.04.03.05C4.84 12.5 7.4 14 10 14s5.16-1.5 6.71-4a.63.63 0 0 0-.03-.05C15.16 7.5 12.6 6 10 6Zm0 1.75A2.25 2.25 0 1 1 10 12.25 2.25 2.25 0 0 1 10 7.75Z" />
    </svg>
  );
}

function IconDownload({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="currentColor" aria-hidden="true">
      <path d="M10 2.75a.75.75 0 0 1 .75.75v7.19l2.22-2.22a.75.75 0 1 1 1.06 1.06l-3.5 3.5a.75.75 0 0 1-1.06 0l-3.5-3.5a.75.75 0 1 1 1.06-1.06l2.22 2.22V3.5A.75.75 0 0 1 10 2.75ZM4 14.25a.75.75 0 0 0 0 1.5h12a.75.75 0 0 0 0-1.5H4Z" />
    </svg>
  );
}

function IconGlobe({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="currentColor" aria-hidden="true">
      <path d="M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm6.5 8a6.47 6.47 0 0 1-.18 1.5H13a12.8 12.8 0 0 0 0-3h3.32c.12.49.18.99.18 1.5ZM11 4.07c.67.23 1.3.58 1.86 1.03.72.58 1.28 1.32 1.64 2.15H11V4.07ZM9 4.07V7.25H5.5c.36-.83.92-1.57 1.64-2.15A5.97 5.97 0 0 1 9 4.07ZM4.68 10.5H8a12.8 12.8 0 0 0 0 3H4.68A6.47 6.47 0 0 1 4.5 12c0-.51.06-1.01.18-1.5ZM9 15.93a5.97 5.97 0 0 1-1.86-1.03A6.27 6.27 0 0 1 5.5 12.75H9v3.18Zm2 0V12.75h3.5a6.27 6.27 0 0 1-1.64 2.15c-.56.45-1.19.8-1.86 1.03ZM11 10.5V7.25h4.32c.12.49.18.99.18 1.5s-.06 1.01-.18 1.5H11Z" />
    </svg>
  );
}

function IconGlobeOff({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="currentColor" aria-hidden="true">
      <path d="M3.28 2.22a.75.75 0 0 0-1.06 1.06l1.2 1.2A8 8 0 0 0 2 10a8 8 0 0 0 8 8c1.93 0 3.7-.69 5.08-1.83l1.64 1.64a.75.75 0 1 0 1.06-1.06L3.28 2.22ZM6.7 5.62A6.5 6.5 0 0 0 4.68 8.5H8a12.8 12.8 0 0 1 .35-2.88L6.7 5.62ZM10 4.07c.67.23 1.3.58 1.86 1.03l-1.2 1.2A5.97 5.97 0 0 0 10 4.07ZM4.5 12c0 .51.06 1.01.18 1.5H8a12.8 12.8 0 0 0 0-3H4.68c-.12.49-.18.99-.18 1.5ZM9 15.93v-3.18l-2.9 2.9c.9.2 1.84.28 2.9.28Zm1 0c1.06 0 2-.08 2.9-.28l-2.9-2.9v3.18ZM11 10.5h4.32c.12-.49.18-.99.18-1.5s-.06-1.01-.18-1.5H11v3Zm0-3.25V4.07c.67.23 1.3.58 1.86 1.03L11 7.25Zm5.82 5.25H13a12.8 12.8 0 0 0 0 3h3.32A6.47 6.47 0 0 0 16.82 12.5ZM15.3 6.18l-1.2 1.2c.23.67.37 1.39.4 2.12H18a6.5 6.5 0 0 0-2.7-3.32Z" />
    </svg>
  );
}

function IconTrash({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="currentColor" aria-hidden="true">
      <path d="M7 2.5A1.5 1.5 0 0 0 5.5 4v.5H3.75a.75.75 0 0 0 0 1.5h.56l.75 9.02A2 2 0 0 0 7.06 17h5.88a2 2 0 0 0 1.99-1.98l.75-9.02h.57a.75.75 0 0 0 0-1.5H14.5V4A1.5 1.5 0 0 0 13 2.5H7Z" />
    </svg>
  );
}

function IconSpinner({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={`${className} animate-spin`} fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="2" strokeOpacity="0.25" />
      <path d="M17 10a7 7 0 0 0-7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

type Props = {
  patente: string;
  editorDocuments: LotDocumentLink[];
  onEditorDocumentsChange: (docs: LotDocumentLink[]) => void;
  uploadSlot?: ReactNode;
};

export function EditorVehiculoDocumentos({
  patente,
  editorDocuments,
  onEditorDocumentsChange,
  uploadSlot,
}: Props) {
  const [inventarioDocs, setInventarioDocs] = useState<TasacionesDocumentoGestion[]>([]);
  const [nombresOcultos, setNombresOcultos] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [togglingKey, setTogglingKey] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const p = patente.trim();
    if (!p) {
      setInventarioDocs([]);
      setNombresOcultos([]);
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/vehiculo-documentos?patente=${encodeURIComponent(p)}`);
      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        documentos_inventario?: TasacionesDocumentoGestion[];
        nombres_archivo_ocultos?: string[];
      } | null;
      if (!response.ok || !payload?.ok) {
        setInventarioDocs([]);
        setNombresOcultos([]);
        return;
      }
      setInventarioDocs(Array.isArray(payload.documentos_inventario) ? payload.documentos_inventario : []);
      setNombresOcultos(
        Array.isArray(payload.nombres_archivo_ocultos) ? payload.nombres_archivo_ocultos : [],
      );
    } finally {
      setLoading(false);
    }
  }, [patente]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const editorOnlyDocuments = useMemo(() => {
    const inventarioLabels = new Set(
      inventarioDocs.map((doc) => normalizeLotDocumentLabelKey(doc.nombre_archivo)),
    );
    const inventarioUrls = new Set(inventarioDocs.map((doc) => doc.public_url.trim().toLowerCase()));
    return editorDocuments
      .map((doc, editorIndex) => ({ doc, editorIndex }))
      .filter(({ doc }) => {
        const labelKey = normalizeLotDocumentLabelKey(doc.label);
        const urlKey = doc.url.trim().toLowerCase();
        return !inventarioLabels.has(labelKey) && !inventarioUrls.has(urlKey);
      });
  }, [editorDocuments, inventarioDocs]);

  const rows: EditorDocRow[] = useMemo(() => {
    const inventarioRows: EditorDocRow[] = inventarioDocs.map((doc) => ({
      key: `inv-${doc.id}`,
      source: "inventario",
      id: doc.id,
      url: doc.public_url,
      label: doc.nombre_archivo,
      visibleCatalogo: doc.visible_catalogo,
      puedeToggle: doc.puede_publicar,
    }));

    const editorRows: EditorDocRow[] = editorOnlyDocuments.map(({ doc, editorIndex }) => ({
      key: `ed-${doc.url}-${editorIndex}`,
      source: "editor",
      url: doc.url,
      label: doc.label,
      mimeType: doc.mimeType,
      visibleCatalogo: doc.visibleInCatalog !== false,
      puedeToggle: true,
      editorIndex,
    }));

    return [...inventarioRows, ...editorRows];
  }, [inventarioDocs, editorOnlyDocuments]);

  const handleToggle = async (row: EditorDocRow) => {
    const siguiente = !row.visibleCatalogo;
    setTogglingKey(row.key);
    try {
      if (row.source === "inventario") {
        const response = await fetch("/api/admin/vehiculo-documentos", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            documento_id: row.id,
            visible_catalogo: siguiente,
          }),
        });
        const body = (await response.json().catch(() => null)) as { ok?: boolean } | null;
        if (!response.ok || !body?.ok) return;
        await cargar();
        return;
      }

      const next = [...editorDocuments];
      const current = next[row.editorIndex];
      if (!current) return;
      next[row.editorIndex] = { ...current, visibleInCatalog: siguiente };
      onEditorDocumentsChange(next);
    } finally {
      setTogglingKey(null);
    }
  };

  const handleRemoveEditor = (editorIndex: number) => {
    onEditorDocumentsChange(editorDocuments.filter((_, i) => i !== editorIndex));
  };

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Documentos</p>
        <p className="text-[11px] tabular-nums text-slate-400">
          {rows.length > 0 ? `${rows.length} archivo${rows.length === 1 ? "" : "s"}` : "Sin archivos"}
        </p>
      </div>

      {uploadSlot}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-6 text-xs text-slate-400">
          <IconSpinner />
          Sincronizando con inventario…
        </div>
      ) : rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-center text-xs text-slate-500">
          Sin documentos
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {rows.map((row) => {
            const kind = inferLotDocumentKind(row.url, row.mimeType);
            const toggling = togglingKey === row.key;
            const blockedByInventario =
              row.source === "editor" && isLotDocumentLabelBlocked(row.label, nombresOcultos);
            return (
              <li key={row.key} className="flex items-center gap-2 px-2 py-2">
                <span
                  className={`inline-flex w-9 shrink-0 justify-center rounded px-1 py-0.5 text-[10px] font-bold ${lotDocumentKindBadgeClass(kind)}`}
                >
                  {kind === "pdf" ? "PDF" : kind.toUpperCase().slice(0, 3)}
                </span>
                <p className="min-w-0 flex-1 truncate text-sm text-slate-800" title={row.label}>
                  {row.label}
                </p>
                <div className="flex shrink-0 items-center gap-1">
                  <a
                    href={lotDocumentOpenUrl(row.url, kind)}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Ver"
                    title="Ver"
                    className={`${iconBtn} border-slate-200 text-slate-600 hover:bg-slate-50`}
                  >
                    <IconEye />
                  </a>
                  <a
                    href={row.url}
                    download={row.label}
                    aria-label="Descargar"
                    title="Descargar"
                    className={`${iconBtn} border-sky-200/80 text-cyan-700 hover:bg-sky-50`}
                  >
                    <IconDownload />
                  </a>
                  {row.puedeToggle ? (
                    <button
                      type="button"
                      disabled={toggling || blockedByInventario}
                      onClick={() => void handleToggle(row)}
                      aria-label={row.visibleCatalogo ? "Ocultar del catálogo" : "Mostrar en catálogo"}
                      title={
                        blockedByInventario
                          ? "Oculto en inventario VEDISA"
                          : row.visibleCatalogo
                            ? "Visible en catálogo"
                            : "Oculto en catálogo"
                      }
                      className={`${iconBtn} ${
                        row.visibleCatalogo
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-slate-200 text-slate-400 hover:bg-slate-50"
                      }`}
                    >
                      {toggling ? (
                        <IconSpinner />
                      ) : row.visibleCatalogo ? (
                        <IconGlobe />
                      ) : (
                        <IconGlobeOff />
                      )}
                    </button>
                  ) : null}
                  {row.source === "editor" ? (
                    <button
                      type="button"
                      onClick={() => handleRemoveEditor(row.editorIndex)}
                      aria-label="Quitar"
                      title="Quitar"
                      className={`${iconBtn} border-rose-200 text-rose-600 hover:bg-rose-50`}
                    >
                      <IconTrash />
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
