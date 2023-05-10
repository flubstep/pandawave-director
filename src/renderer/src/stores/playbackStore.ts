import { create } from 'zustand';

interface PlaybackStoreState {
  playing: boolean;
  recording: boolean;
  timestamp: number;
  sceneName: string | null;
  setPlaying: (playing: boolean) => void;
  setRecording: (recording: boolean) => void;
  setTimestamp: (timestamp: number) => void;
  setSceneName: (sceneName: string) => void;
}

export const usePlaybackStore = create<PlaybackStoreState>((set) => ({
  playing: false,
  recording: false,
  timestamp: 0.0,
  sceneName: null,
  setPlaying: (playing: boolean) => set({ playing }),
  setTimestamp: (timestamp: number) => set({ timestamp }),
  setSceneName: (sceneName: string) => set({ sceneName }),
  setRecording: (recording: boolean) => set({ recording }),
}));
