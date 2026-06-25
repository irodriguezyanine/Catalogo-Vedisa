import { describe, expect, it } from "vitest";
import { mergeEditorVehicleDetailsSmart } from "@/lib/rainworx-merge-smart";
import type { EditorVehicleDetails } from "@/types/editor";

const GLO3D_THUMB = "https://res.cloudinary.com/vedisa/image/upload/glo3d/thumb.jpg";
const TASACIONES_PHOTO = "https://xyz.supabase.co/storage/v1/object/public/inventario-documentos/foto.jpg";
const RAINWORX_THUMB = "https://www.vehiculoschocados.cl/Content/Images/lot.jpg";
const RAINWORX_PHOTO2 = "https://www.vehiculoschocados.cl/Content/Images/lot2.jpg";

describe("mergeEditorVehicleDetailsSmart", () => {
  it("preserva miniatura Glo3D aunque Rainworx traiga otra", () => {
    const existing: EditorVehicleDetails = {
      thumbnail: GLO3D_THUMB,
      imagesCsv: GLO3D_THUMB,
      brand: "Toyota",
    };
    const incoming: EditorVehicleDetails = {
      thumbnail: RAINWORX_THUMB,
      imagesCsv: `${RAINWORX_THUMB}, ${RAINWORX_PHOTO2}`,
      brand: "TOYOTA",
    };
    const { details, stats } = mergeEditorVehicleDetailsSmart(existing, incoming);
    expect(details.thumbnail).toBe(GLO3D_THUMB);
    expect(stats.photosPreserved).toBe(true);
    expect(details.imagesCsv).toContain(GLO3D_THUMB);
    expect(details.imagesCsv).toContain(RAINWORX_THUMB);
  });

  it("preserva miniatura Tasaciones", () => {
    const existing: EditorVehicleDetails = { thumbnail: TASACIONES_PHOTO };
    const incoming: EditorVehicleDetails = { thumbnail: RAINWORX_THUMB };
    const { details } = mergeEditorVehicleDetailsSmart(existing, incoming);
    expect(details.thumbnail).toBe(TASACIONES_PHOTO);
  });

  it("completa campos vacíos sin sobrescribir los existentes", () => {
    const existing: EditorVehicleDetails = { brand: "Hyundai", model: "Tucson" };
    const incoming: EditorVehicleDetails = {
      brand: "HYUNDAI",
      model: "TUCSON 2020",
      year: "2020",
      color: "Blanco",
    };
    const { details } = mergeEditorVehicleDetailsSmart(existing, incoming);
    expect(details.brand).toBe("Hyundai");
    expect(details.model).toBe("Tucson");
    expect(details.year).toBe("2020");
    expect(details.color).toBe("Blanco");
  });

  it("fusiona descripción extendida sin duplicar bloques", () => {
    const existing: EditorVehicleDetails = {
      extendedDescription: "<p>Motor en buen estado</p>",
    };
    const incoming: EditorVehicleDetails = {
      extendedDescription: "<p>Motor en buen estado</p>\n<p>Airbags frontales OK</p>",
    };
    const { details, stats } = mergeEditorVehicleDetailsSmart(existing, incoming);
    expect(details.extendedDescription).toContain("Airbags frontales OK");
    expect(stats.descriptionAppended).toBe(true);
    expect(details.extendedDescription?.match(/Motor en buen estado/g)?.length).toBe(1);
  });

  it("usa Rainworx cuando no hay fotos protegidas previas", () => {
    const existing: EditorVehicleDetails = {};
    const incoming: EditorVehicleDetails = {
      thumbnail: RAINWORX_THUMB,
      imagesCsv: RAINWORX_THUMB,
    };
    const { details } = mergeEditorVehicleDetailsSmart(existing, incoming);
    expect(details.thumbnail).toBe(RAINWORX_THUMB);
  });
});
