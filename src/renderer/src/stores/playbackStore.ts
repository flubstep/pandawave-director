import { create } from 'zustand';

interface PlaybackStoreState {
  playing: boolean;
  timestamp: number;
  setPlaying: (playing: boolean) => void;
  setTimestamp: (timestamp: number) => void;
}

export const usePlaybackStore = create<PlaybackStoreState>((set) => ({
  playing: false,
  timestamp: 0.0,
  setPlaying: (playing: boolean) => set({ playing }),
  setTimestamp: (timestamp: number) => set({ timestamp }),
}));
