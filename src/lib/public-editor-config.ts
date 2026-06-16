import type { EditorConfig } from "@/types/editor";

/**
 * Snapshot público del editor: mismo shape que usa el catálogo en cliente.
 * No incluye credenciales (nunca están en EditorConfig); sirve para GET sin ruta /admin.
 */
export function toPublicEditorSnapshot(config: EditorConfig): EditorConfig {
  return config;
}
