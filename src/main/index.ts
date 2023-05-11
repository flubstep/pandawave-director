import { spawn } from 'child_process';
import { app, BrowserWindow, ipcMain, shell } from 'electron';
import fs from 'fs';
import { join } from 'path';

import { electronApp, is, optimizer } from '@electron-toolkit/utils';

import icon from '../../resources/icon.png?asset';

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1080,
    height: 720,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
    },
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron');

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  ipcMain.on('save-image', async (_, dataUrl, filename) => {
    const binary = atob(dataUrl.split(',')[1]);
    const buffer = new ArrayBuffer(binary.length);
    const uint8 = new Uint8Array(buffer);
    for (let i = 0; i < binary.length; i++) {
      uint8[i] = binary.charCodeAt(i);
    }
    const appDataPath = '/Users/albert/Documents/';
    const filePath = join(appDataPath, filename);
    fs.writeFile(filePath, uint8, (err) => {
      if (err) {
        console.error(`Failed to save file: ${err}`);
      } else {
        console.log(`File saved to: ${filePath}`);
      }
    });
  });

  const videoRecordingState: {
    subprocess: ReturnType<typeof spawn> | null;
  } = {
    subprocess: null,
  };

  ipcMain.on('video-start', async (_, filename) => {
    if (videoRecordingState.subprocess) {
      console.warn('Killing existing ffmpeg proceess!');
      videoRecordingState.subprocess.kill();
    }
    const appDataPath = '/Users/albert/Movies/';
    const fullFilename = join(appDataPath, filename);
    console.log(`Starting ffmpeg process for video recording, writing to ${fullFilename}`);
    videoRecordingState.subprocess = spawn('ffmpeg', [
      '-f',
      'image2pipe',
      '-loglevel',
      'error',
      '-r',
      '60',
      '-vcodec',
      'png',
      '-i',
      '-',
      '-y',
      '-pix_fmt',
      'yuv420p',
      '-vcodec',
      'libx264',
      fullFilename,
    ]);
    if (videoRecordingState.subprocess.stdout) {
      videoRecordingState.subprocess.stdout.pipe(process.stdout);
    }
    if (videoRecordingState.subprocess.stderr) {
      videoRecordingState.subprocess.stderr.pipe(process.stdout);
    }
  });

  ipcMain.on('video-add-frame', async (_, dataUrl) => {
    const { subprocess } = videoRecordingState;
    if (!subprocess) {
      console.error('No ffmpeg process running!');
      return;
    }
    const binary = atob(dataUrl.split(',')[1]);
    const buffer = new ArrayBuffer(binary.length);
    const uint8 = new Uint8Array(buffer);
    for (let i = 0; i < binary.length; i++) {
      uint8[i] = binary.charCodeAt(i);
    }
    if (subprocess.stdin) {
      subprocess.stdin.write(uint8);
    }
  });

  ipcMain.on('video-stop', async () => {
    const { subprocess } = videoRecordingState;
    if (!subprocess) {
      console.error('No ffmpeg process running!');
      return;
    }
    console.log('Stopping ffmpeg process');
    if (subprocess.stdin) {
      subprocess.stdin.end();
    }
    subprocess.kill();
    videoRecordingState.subprocess = null;
  });

  createWindow();

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// In this file you can include the rest of your app"s specific main process
// code. You can also put them in separate files and require them here.
