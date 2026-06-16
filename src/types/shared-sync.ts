export type SharedSyncDlqEntry = {
  id: string;
  source: string;
  message: string;
  skippedCount: number;
  createdAt: string;
};

export type SharedSyncResult = {
  skipped: string[];
  updatedRemates?: number;
  updatedInventario?: number;
  updatedRemateItems?: number;
};
