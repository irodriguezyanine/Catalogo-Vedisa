import { describe, expect, it } from "vitest";
import {
  isGlo3dRateLimitMessage,
  isGlo3dRateLimitResponse,
  resolveGlo3dClientCooldownMs,
} from "@/lib/glo3d-client-cooldown";

describe("resolveGlo3dClientCooldownMs", () => {
  it("ya no impone pausa mínima de 30 segundos", () => {
    expect(resolveGlo3dClientCooldownMs()).toBe(0);
    expect(resolveGlo3dClientCooldownMs(5_000)).toBe(5_000);
  });

  it("usa retryAfter cuando es mayor al mínimo", () => {
    expect(resolveGlo3dClientCooldownMs(45_000)).toBe(45_000);
  });
});

describe("isGlo3dRateLimitResponse", () => {
  it("detecta 429 y flags de payload", () => {
    expect(isGlo3dRateLimitResponse(new Response(null, { status: 429 }))).toBe(true);
    expect(isGlo3dRateLimitResponse(new Response(null, { status: 200 }), { rateLimited: true })).toBe(
      true,
    );
    expect(
      isGlo3dRateLimitResponse(new Response(null, { status: 200 }), { glo3dRateLimited: true }),
    ).toBe(true);
    expect(isGlo3dRateLimitResponse(new Response(null, { status: 200 }))).toBe(false);
  });
});

describe("isGlo3dRateLimitMessage", () => {
  it("detecta mensajes de saturación", () => {
    expect(isGlo3dRateLimitMessage("Glo3D saturado, espera un momento")).toBe(true);
    expect(isGlo3dRateLimitMessage("Error 429 desde API")).toBe(true);
    expect(isGlo3dRateLimitMessage("Patente no encontrada")).toBe(false);
  });
});
