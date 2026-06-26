import Link from "next/link";

type Props = {
  className?: string;
  onClick?: () => void;
};

export function AdminAccessLink({ className, onClick }: Props) {
  return (
    <Link
      href="/admin"
      title="Acceso administrador"
      aria-label="Acceso administrador"
      onClick={onClick}
      className={
        className ??
        "ui-focus inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-600 transition hover:-translate-y-0.5 hover:border-cyan-400 hover:bg-cyan-50 hover:text-cyan-700"
      }
    >
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
        <path
          fillRule="evenodd"
          d="M10 1a4.5 4.5 0 0 0-4.5 4.5V9H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-.5V5.5A4.5 4.5 0 0 0 10 1Zm3 8V5.5a3 3 0 1 0-6 0V9h6Z"
          clipRule="evenodd"
        />
      </svg>
    </Link>
  );
}
