"use client";

import Image from "next/image";
import Link from "next/link";
import { AdminAccessLink } from "@/components/admin/admin-access-link";
import { CatalogSiteFooter } from "@/components/catalog-site-footer";
import { ComoParticiparContent } from "@/components/como-participar-content";
import { FloatingWhatsappButton } from "@/components/floating-whatsapp-button";

export function ComoParticiparPageClient() {
  return (
    <div className="catalog-bg min-h-full pb-6">
      <section className="sticky top-0 z-30 border-b border-cyan-100/80 bg-white/92 shadow-sm backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-3 py-2.5 sm:px-6 lg:px-8">
          <Link href="/" className="inline-flex min-w-0">
            <Image
              src="/vedisa-logo.png"
              alt="Logo Vedisa Remates"
              width={208}
              height={43}
              priority
              className="h-auto w-full max-w-[148px] sm:max-w-[192px]"
            />
          </Link>
          <div className="flex shrink-0 items-center gap-1.5">
            <AdminAccessLink />
            <Link
              href="/"
              className="ui-focus hidden rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 sm:inline-flex"
            >
              Inicio
            </Link>
            <Link
              href="/"
              aria-label="Volver al inicio"
              className="ui-focus inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-700 sm:hidden"
            >
              <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
                <path
                  d="M12.5 4.5L7 10l5.5 5.5"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </Link>
          </div>
        </div>
      </section>

      <main className="relative z-10 mx-auto max-w-7xl px-3 py-5 sm:px-6 sm:py-8 lg:px-8">
        <section className="section-shell">
          <ComoParticiparContent />
        </section>
      </main>

      <CatalogSiteFooter />
      <FloatingWhatsappButton />
    </div>
  );
}
