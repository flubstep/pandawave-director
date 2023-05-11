import { create } from 'zustand';

export type ScreenshotFunction = (filename?: string) => Promise<void>;

interface ActionStoreState {
  screenshot: ScreenshotFunction | null;
  record: ScreenshotFunction | null;
  setScreenshotFunction: (screenshot: ScreenshotFunction | null) => void;
  setRecordFunction: (record: ScreenshotFunction | null) => void;
}

export const useActionStore = create<ActionStoreState>((set) => ({
  screenshot: null,
  record: null,
  setScreenshotFunction: (screenshot: ScreenshotFunction | null) => set({ screenshot }),
  setRecordFunction: (record: ScreenshotFunction | null) => set({ record }),
}));
