"use client";

import { useEffect, useRef } from "react";

type AdminLoginDialogProps = {
  open: boolean;
  email: string;
  password: string;
  error?: string;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
};

export function AdminLoginDialog({
  open,
  email,
  password,
  error,
  onEmailChange,
  onPasswordChange,
  onCancel,
  onSubmit,
}: AdminLoginDialogProps) {
  const emailRef = useRef<HTMLInputElement>(null);
  const onCancelRef = useRef(onCancel);

  useEffect(() => {
    onCancelRef.current = onCancel;
  }, [onCancel]);

  useEffect(() => {
    if (!open) return;
    emailRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancelRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-login-title"
        className="w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl"
      >
        <h3 id="admin-login-title" className="text-lg font-semibold text-slate-900">
          Login
        </h3>
        <p className="mt-1 text-sm text-slate-500">
          Solo administradores pueden editar categorías y vehículos.
        </p>
        <form
          className="mt-4 space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <input
            ref={emailRef}
            value={email}
            onChange={(e) => onEmailChange(e.target.value)}
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
            placeholder="Correo"
            aria-label="Correo de administrador"
            autoComplete="username"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => onPasswordChange(e.target.value)}
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
            placeholder="Contraseña"
            aria-label="Contraseña de administrador"
            autoComplete="current-password"
          />
          {error ? <p className="text-xs text-red-600">{error}</p> : null}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="ui-focus rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-600 transition hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="ui-focus rounded-md bg-cyan-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-cyan-500"
            >
              Entrar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
