"use client";

import Link from "next/link";
import { useCallback, useRef } from "react";
import { CatalogVehicleHighlightStrip } from "@/components/catalog-vehicle-highlight-strip";
import { ShareIcon } from "@/components/share-icon";
import {
  inferLotDocumentKind,
  lotDocumentKindBadgeClass,
  lotDocumentKindLabel,
  lotDocumentOpenUrl,
  type LotDocumentLink,
} from "@/lib/lot-documents";
import { sanitizeCatalogHtml } from "@/lib/sanitize-html";
import type { CatalogItem } from "@/types/catalog";
import type { EditorVehicleDetails } from "@/types/editor";

type MobileSectionId = "visor" | "precio" | "descripcion" | "info" | "tecnica" | "fotos" | "docs";

type VehicleDetailMobileProps = {
  vehicle: CatalogItem;
  override?: EditorVehicleDetails;
  patent: string;
  displayTitle: string;
  subtitle?: string;
  priceLabel: string | null;
  promoEnabled: boolean;
  originalPriceLabel: string | null;
  referencePriceAmount: number;
  conditionLabel: string | null;
  conditionClasses: string;
  view3dUrl?: string | null;
  mainImage: string;
  galleryImages: string[];
  imageIndex: number;
  onImageIndexChange: (index: number) => void;
  onOpenLightbox: (index: number) => void;
  descriptionHtml: string;
  generalFields: Array<[string, string]>;
  technicalFields: Array<[string, string]>;
  documents: LotDocumentLink[];
  whatsappUrl: string;
  whatsappLabel: string;
  onBack: () => void;
  onOffer: () => void;
  onShare: () => void;
  onWhatsappTrack?: () => void;
  backHref?: string;
};

const SECTIONS: Array<{ id: MobileSectionId; label: string }> = [
  { id: "visor", label: "3D" },
  { id: "precio", label: "Precio" },
  { id: "descripcion", label: "Descripción" },
  { id: "info", label: "Info" },
  { id: "tecnica", label: "Técnica" },
  { id: "fotos", label: "Fotos" },
  { id: "docs", label: "Docs" },
];

function FieldGrid({ fields }: { fields: Array<[string, string]> }) {
  if (fields.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
        No hay datos disponibles.
      </p>
    );
  }
  return (
    <dl className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
      {fields.map(([label, value]) => (
        <div key={label} className="px-4 py-3">
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
          <dd className="mt-0.5 break-words text-sm font-medium text-slate-900 [overflow-wrap:anywhere]">
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function VehicleDetailMobile({
  vehicle,
  override,
  patent,
  displayTitle,
  subtitle,
  priceLabel,
  promoEnabled,
  originalPriceLabel,
  referencePriceAmount,
  conditionLabel,
  conditionClasses,
  view3dUrl,
  mainImage,
  galleryImages,
  imageIndex,
  onImageIndexChange,
  onOpenLightbox,
  descriptionHtml,
  generalFields,
  technicalFields,
  documents,
  whatsappUrl,
  whatsappLabel,
  onBack,
  onOffer,
  onShare,
  onWhatsappTrack,
  backHref,
}: VehicleDetailMobileProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Partial<Record<MobileSectionId, HTMLElement | null>>>({});

  const scrollToSection = useCallback((id: MobileSectionId) => {
    const node = sectionRefs.current[id];
    if (!node) return;
    node.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const visibleSections = SECTIONS.filter((section) => {
    if (section.id === "fotos") return galleryImages.length > 1;
    if (section.id === "docs") return documents.length > 0;
    if (section.id === "tecnica") return technicalFields.length > 0;
    if (section.id === "info") return generalFields.length > 0;
    return true;
  });

  const BackControl = backHref ? (
    <Link
      href={backHref}
      className="ui-focus inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm"
      aria-label="Volver"
    >
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden="true">
        <path
          d="M11.75 4.5L6.25 10l5.5 5.5"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </Link>
  ) : (
    <button
      type="button"
      onClick={onBack}
      className="ui-focus inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm"
      aria-label="Volver"
    >
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden="true">
        <path
          d="M11.75 4.5L6.25 10l5.5 5.5"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-white md:hidden">
      <header className="shrink-0 border-b border-slate-200 bg-white/95 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <div className="flex items-center gap-3 px-3 py-2.5">
          {BackControl}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold leading-tight text-slate-900">{displayTitle}</p>
            <p className="truncate text-xs text-slate-500">{subtitle?.trim() || patent}</p>
          </div>
          {conditionLabel ? (
            <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${conditionClasses}`}>
              {conditionLabel}
            </span>
          ) : null}
        </div>
        <nav
          className="flex snap-x snap-mandatory gap-2 overflow-x-auto px-3 pb-2.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          aria-label="Ir a sección"
        >
          {visibleSections.map((section) => (
            <button
              key={section.id}
              type="button"
              onClick={() => scrollToSection(section.id)}
              className="ui-focus shrink-0 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700"
            >
              {section.label}
            </button>
          ))}
        </nav>
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-28">
        <section
          ref={(node) => {
            sectionRefs.current.visor = node;
          }}
          id="mobile-visor"
          className="scroll-mt-36 border-b border-slate-100 bg-slate-100"
        >
          {view3dUrl ? (
            <div className="relative w-full bg-slate-900" style={{ height: "min(52vh, 420px)" }}>
              <iframe
                src={view3dUrl}
                title={`Visor 3D ${displayTitle}`}
                className="absolute inset-0 h-full w-full border-0"
                allow="fullscreen; autoplay; gyroscope; accelerometer; xr-spatial-tracking"
                loading="eager"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => onOpenLightbox(imageIndex)}
              className="ui-focus block w-full"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={mainImage}
                alt={displayTitle}
                className="w-full object-cover"
                style={{ height: "min(42vh, 360px)" }}
              />
            </button>
          )}
          {view3dUrl && galleryImages.length > 1 ? (
            <div className="flex snap-x snap-mandatory gap-2 overflow-x-auto bg-white p-2">
              {galleryImages.map((imageUrl, index) => (
                <button
                  key={`${imageUrl}-${index}`}
                  type="button"
                  onClick={() => {
                    onImageIndexChange(index);
                    onOpenLightbox(index);
                  }}
                  className={`ui-focus h-14 w-[4.5rem] shrink-0 overflow-hidden rounded-lg border ${
                    imageIndex === index ? "border-cyan-500 ring-2 ring-cyan-200" : "border-slate-200"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imageUrl} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          ) : null}
        </section>

        <div className="px-4 py-3">
          <CatalogVehicleHighlightStrip item={vehicle} override={override} />
        </div>

        <section
          ref={(node) => {
            sectionRefs.current.precio = node;
          }}
          id="mobile-precio"
          className="scroll-mt-36 border-t border-slate-100 px-4 py-5"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-cyan-700">Precio referencial</p>
          {promoEnabled && originalPriceLabel && priceLabel ? (
            <p className="mt-1 text-base font-semibold text-slate-400 line-through">{originalPriceLabel}</p>
          ) : null}
          <p className={`mt-1 text-3xl font-bold tracking-tight ${promoEnabled ? "text-rose-700" : "text-slate-900"}`}>
            {priceLabel ?? "No informado"}
          </p>
          {promoEnabled ? (
            <span className="mt-2 inline-flex rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-semibold text-rose-700">
              Precio promocional
            </span>
          ) : null}
          <p className="mt-2 text-sm text-slate-600">Valor + gastos de impuesto y transferencia.</p>
        </section>

        <section
          ref={(node) => {
            sectionRefs.current.descripcion = node;
          }}
          id="mobile-descripcion"
          className="scroll-mt-36 border-t border-slate-100 px-4 py-5"
        >
          <h2 className="text-sm font-bold text-slate-900">Descripción ampliada</h2>
          <div
            className="prose prose-sm mt-3 max-w-none text-slate-700 [&_a]:text-cyan-700 [&_a]:underline [&_b]:font-bold [&_strong]:font-bold [&_em]:italic [&_li]:ml-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5 [&_p]:mb-2"
            dangerouslySetInnerHTML={{ __html: sanitizeCatalogHtml(descriptionHtml) }}
          />
        </section>

        <section
          ref={(node) => {
            sectionRefs.current.info = node;
          }}
          id="mobile-info"
          className="scroll-mt-36 border-t border-slate-100 px-4 py-5"
        >
          <h2 className="mb-3 text-sm font-bold text-slate-900">Información del vehículo</h2>
          <FieldGrid fields={generalFields} />
        </section>

        {technicalFields.length > 0 ? (
          <section
            ref={(node) => {
              sectionRefs.current.tecnica = node;
            }}
            id="mobile-tecnica"
            className="scroll-mt-36 border-t border-slate-100 px-4 py-5"
          >
            <h2 className="mb-3 text-sm font-bold text-slate-900">Detalles técnicos</h2>
            <FieldGrid fields={technicalFields} />
          </section>
        ) : null}

        {galleryImages.length > 0 ? (
          <section
            ref={(node) => {
              sectionRefs.current.fotos = node;
            }}
            id="mobile-fotos"
            className="scroll-mt-36 border-t border-slate-100 px-4 py-5"
          >
            <h2 className="mb-3 text-sm font-bold text-slate-900">Fotos</h2>
            <div className="grid grid-cols-2 gap-2">
              {galleryImages.map((imageUrl, index) => (
                <button
                  key={`mobile-photo-${imageUrl}-${index}`}
                  type="button"
                  onClick={() => {
                    onImageIndexChange(index);
                    onOpenLightbox(index);
                  }}
                  className="ui-focus overflow-hidden rounded-xl border border-slate-200"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imageUrl} alt={`Foto ${index + 1}`} className="aspect-[4/3] w-full object-cover" />
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {documents.length > 0 ? (
          <section
            ref={(node) => {
              sectionRefs.current.docs = node;
            }}
            id="mobile-docs"
            className="scroll-mt-36 border-t border-slate-100 px-4 py-5"
          >
            <h2 className="mb-3 text-sm font-bold text-slate-900">Documentación</h2>
            <ul className="space-y-2">
              {documents.map((doc, idx) => {
                const kind = inferLotDocumentKind(doc.url, doc.mimeType);
                return (
                <li key={`mobile-doc-${doc.url}-${idx}`}>
                  <a
                    href={lotDocumentOpenUrl(doc.url, kind)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold text-cyan-700"
                  >
                    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${lotDocumentKindBadgeClass(kind)}`}>
                      {lotDocumentKindLabel(kind)}
                    </span>
                    <span className="break-all">{doc.label}</span>
                  </a>
                </li>
                );
              })}
            </ul>
          </section>
        ) : null}
      </div>

      <footer className="shrink-0 border-t border-slate-200 bg-white/95 px-3 py-2.5 pb-[calc(env(safe-area-inset-bottom)+10px)] backdrop-blur-md">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOffer}
            disabled={referencePriceAmount <= 0}
            className="ui-focus min-w-0 flex-1 rounded-full bg-cyan-600 px-4 py-3 text-sm font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
          >
            Enviar mi precio
          </button>
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noreferrer"
            onClick={onWhatsappTrack}
            className="ui-focus inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#25D366] text-white shadow-sm"
            aria-label={whatsappLabel}
            title={whatsappLabel}
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
              <path d="M12.04 2C6.58 2 2.16 6.42 2.16 11.88c0 1.75.46 3.46 1.33 4.96L2 22l5.3-1.38a9.83 9.83 0 0 0 4.74 1.21h.01c5.45 0 9.87-4.42 9.87-9.88A9.87 9.87 0 0 0 12.04 2Zm0 18.03h-.01a8.13 8.13 0 0 1-4.14-1.14l-.3-.18-3.15.82.84-3.07-.2-.31a8.13 8.13 0 0 1-1.25-4.3c0-4.51 3.69-8.2 8.22-8.2 4.53 0 8.21 3.68 8.21 8.2 0 4.53-3.69 8.2-8.22 8.2Zm4.49-6.19c-.25-.12-1.49-.73-1.72-.81-.23-.09-.4-.12-.57.12-.17.25-.65.81-.8.97-.15.17-.29.19-.54.06-.25-.12-1.04-.38-1.99-1.22-.74-.66-1.24-1.48-1.39-1.72-.15-.25-.02-.38.11-.51.11-.11.25-.29.37-.44.12-.15.16-.25.25-.42.08-.17.04-.31-.02-.44-.06-.12-.57-1.37-.78-1.88-.21-.49-.42-.42-.57-.43h-.48c-.17 0-.44.06-.67.31-.23.25-.88.86-.88 2.09 0 1.23.9 2.42 1.03 2.58.12.17 1.77 2.71 4.29 3.8.6.26 1.07.42 1.43.54.6.19 1.15.16 1.59.1.49-.07 1.49-.61 1.7-1.2.21-.59.21-1.1.15-1.2-.06-.1-.23-.16-.48-.28Z" />
            </svg>
          </a>
          <button
            type="button"
            onClick={onShare}
            className="ui-focus inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm"
            aria-label="Compartir"
          >
            <ShareIcon className="h-5 w-5" />
          </button>
        </div>
      </footer>
    </div>
  );
}
