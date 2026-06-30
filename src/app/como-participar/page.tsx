import type { Metadata } from "next";
import { ComoParticiparPageClient } from "@/components/como-participar-page-client";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Cómo participar en remates | Catálogo VEDISA REMATES",
  description:
    "Guía paso a paso para registrarte, constituir garantía y participar en los remates online de VEDISA REMATES.",
};

export default function ComoParticiparPage() {
  return <ComoParticiparPageClient />;
}
