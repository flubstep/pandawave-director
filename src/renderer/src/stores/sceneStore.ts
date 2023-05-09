import { create } from 'zustand';

interface SceneStoreState {
  sceneName: string | null;
  setSceneName: (sceneName: string) => void;
}

export const useSceneStore = create<SceneStoreState>((set) => ({
  sceneName: null,
  setSceneName: (sceneName: string) => set({ sceneName }),
}));
