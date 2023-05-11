"use strict";
const child_process = require("child_process");
const electron = require("electron");
const fs = require("fs");
const path = require("path");
const utils = require("@electron-toolkit/utils");
const icon = path.join(__dirname, "../../resources/icon.png");
function createWindow() {
  const mainWindow = new electron.BrowserWindow({
    width: 1080,
    height: 720,
    show: false,
    autoHideMenuBar: true,
    ...process.platform === "linux" ? { icon } : {},
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      preload: path.join(__dirname, "../preload/index.js"),
      sandbox: false
    }
  });
  mainWindow.on("ready-to-show", () => {
    mainWindow.show();
  });
  mainWindow.webContents.setWindowOpenHandler((details) => {
    electron.shell.openExternal(details.url);
    return { action: "deny" };
  });
  if (utils.is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}
electron.app.whenReady().then(() => {
  utils.electronApp.setAppUserModelId("com.electron");
  electron.app.on("browser-window-created", (_, window) => {
    utils.optimizer.watchWindowShortcuts(window);
  });
  electron.ipcMain.on("save-image", async (_, dataUrl, filename) => {
    const binary = atob(dataUrl.split(",")[1]);
    const buffer = new ArrayBuffer(binary.length);
    const uint8 = new Uint8Array(buffer);
    for (let i = 0; i < binary.length; i++) {
      uint8[i] = binary.charCodeAt(i);
    }
    const appDataPath = "/Users/albert/framesout/";
    const filePath = path.join(appDataPath, filename);
    fs.writeFile(filePath, uint8, (err) => {
      if (err) {
        console.error(`Failed to save file: ${err}`);
      } else {
        console.log(`File saved to: ${filePath}`);
      }
    });
  });
  const videoRecordingState = {
    subprocess: null
  };
  electron.ipcMain.on("video-start", async (_, filename) => {
    if (videoRecordingState.subprocess) {
      console.warn("Killing existing ffmpeg proceess!");
      videoRecordingState.subprocess.kill();
    }
    const appDataPath = "/Users/albert/Movies/";
    const fullFilename = path.join(appDataPath, filename);
    console.log(`Starting ffmpeg process for video recording, writing to ${fullFilename}`);
    videoRecordingState.subprocess = child_process.spawn("ffmpeg", [
      "-f",
      "image2pipe",
      "-loglevel",
      "error",
      "-r",
      "60",
      "-vcodec",
      "png",
      "-i",
      "-",
      "-y",
      "-pix_fmt",
      "yuv420p",
      "-vcodec",
      "libx264",
      fullFilename
    ]);
    if (videoRecordingState.subprocess.stdout) {
      videoRecordingState.subprocess.stdout.pipe(process.stdout);
    }
    if (videoRecordingState.subprocess.stderr) {
      videoRecordingState.subprocess.stderr.pipe(process.stdout);
    }
  });
  electron.ipcMain.on("video-add-frame", async (_, dataUrl) => {
    const { subprocess } = videoRecordingState;
    if (!subprocess) {
      console.error("No ffmpeg process running!");
      return;
    }
    const binary = atob(dataUrl.split(",")[1]);
    const buffer = new ArrayBuffer(binary.length);
    const uint8 = new Uint8Array(buffer);
    for (let i = 0; i < binary.length; i++) {
      uint8[i] = binary.charCodeAt(i);
    }
    if (subprocess.stdin) {
      subprocess.stdin.write(uint8);
    }
  });
  electron.ipcMain.on("video-stop", async () => {
    const { subprocess } = videoRecordingState;
    if (!subprocess) {
      console.error("No ffmpeg process running!");
      return;
    }
    console.log("Stopping ffmpeg process");
    if (subprocess.stdin) {
      subprocess.stdin.end();
    }
    subprocess.kill();
    videoRecordingState.subprocess = null;
  });
  createWindow();
  electron.app.on("activate", function() {
    if (electron.BrowserWindow.getAllWindows().length === 0)
      createWindow();
  });
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    electron.app.quit();
  }
});
