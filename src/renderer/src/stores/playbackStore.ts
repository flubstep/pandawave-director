import { create } from 'zustand';

interface PlaybackStoreState {
  playing: boolean;
  timestamp: number;
  sceneName: string | null;
  setPlaying: (playing: boolean) => void;
  setTimestamp: (timestamp: number) => void;
  setSceneName: (sceneName: string) => void;
}

export const usePlaybackStore = create<PlaybackStoreState>((set) => ({
  playing: false,
  timestamp: 0.0,
  sceneName: null,
  setPlaying: (playing: boolean) => set({ playing }),
  setTimestamp: (timestamp: number) => set({ timestamp }),
  setSceneName: (sceneName: string) => set({ sceneName }),
}));
