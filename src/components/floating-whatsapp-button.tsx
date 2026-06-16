"use client";

const WHATSAPP_URL =
  "https://wa.me/56989323397?text=Hola%2C%20quiero%20informaci%C3%B3n%20sobre%20veh%C3%ADculos%20disponibles%20en%20Vedisa%20Remates";

type FloatingWhatsappButtonProps = {
  hidden?: boolean;
  onClick?: () => void;
};

export function FloatingWhatsappButton({ hidden = false, onClick }: FloatingWhatsappButtonProps) {
  if (hidden) return null;

  return (
    <a
      href={WHATSAPP_URL}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onClick}
      className="ui-focus fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-[60] inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg shadow-emerald-900/20 transition hover:scale-105 hover:brightness-95 md:hidden"
      aria-label="Consultar vehículos por WhatsApp"
      title="WhatsApp Vedisa"
    >
      <svg viewBox="0 0 24 24" className="h-7 w-7 fill-current" aria-hidden="true">
        <path d="M12.04 2C6.58 2 2.16 6.42 2.16 11.88c0 1.75.46 3.45 1.32 4.95L2 22l5.33-1.4a9.83 9.83 0 0 0 4.7 1.2h.01c5.45 0 9.88-4.43 9.88-9.89A9.86 9.86 0 0 0 12.04 2zm0 17.96h-.01a8.08 8.08 0 0 1-4.11-1.12l-.3-.18-3.16.83.84-3.09-.2-.32a8.03 8.03 0 0 1-1.24-4.2 8.2 8.2 0 1 1 8.19 8.08zm4.49-6.14c-.25-.12-1.48-.73-1.71-.81-.23-.09-.4-.12-.56.12-.16.24-.65.8-.79.97-.15.17-.3.19-.55.07-.25-.12-1.07-.4-2.03-1.28-.75-.66-1.25-1.48-1.4-1.73-.15-.24-.01-.37.11-.49.11-.11.25-.29.37-.43.12-.14.16-.24.24-.4.08-.17.04-.31-.02-.43-.06-.12-.56-1.36-.77-1.87-.2-.48-.41-.41-.56-.42h-.48c-.17 0-.43.06-.65.3-.22.24-.85.83-.85 2.03s.87 2.35.99 2.51c.12.17 1.7 2.6 4.12 3.64.58.25 1.03.4 1.38.51.58.18 1.1.15 1.52.09.46-.07 1.48-.6 1.68-1.17.21-.58.21-1.07.15-1.17-.06-.1-.22-.16-.47-.28z" />
      </svg>
    </a>
  );
}
