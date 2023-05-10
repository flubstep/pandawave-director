"use strict";
const electron = require("electron");
const preload = require("@electron-toolkit/preload");
const api = {
  saveImage: (image, filename) => {
    electron.ipcRenderer.send("save-image", image, filename);
  }
};
if (process.contextIsolated) {
  try {
    electron.contextBridge.exposeInMainWorld("electron", preload.electronAPI);
    electron.contextBridge.exposeInMainWorld("api", api);
  } catch (error) {
    console.error(error);
  }
} else {
  window.electron = preload.electronAPI;
  window.api = api;
}
