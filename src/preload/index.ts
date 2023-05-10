import { contextBridge, ipcRenderer } from 'electron';

import { electronAPI } from '@electron-toolkit/preload';

// Custom APIs for renderer
const api = {
  saveImage: (image: string, filename: string) => {
    ipcRenderer.send('save-image', image, filename);
  },
  videoStart: (filename: string) => {
    ipcRenderer.send('video-start', filename);
  },
  videoAddFrame: (dataUrl: string) => {
    ipcRenderer.send('video-add-frame', dataUrl);
  },
  videoStop: () => {
    ipcRenderer.send('video-stop');
  },
};

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI);
    contextBridge.exposeInMainWorld('api', api);
  } catch (error) {
    console.error(error);
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI;
  // @ts-ignore (define in dts)
  window.api = api;
}
