const { app, BrowserWindow, shell, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;
let serverProcess;

function startServer() {
    const serverScript = path.join(__dirname, 'src', 'server', 'appServer.js');
    serverProcess = spawn('node', [serverScript], {
        stdio: 'inherit'
    });
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1240,
        height: 840,
        minWidth: 960,
        minHeight: 650,
        title: 'AIO YouTube Downloader - Desktop Edition',
        backgroundColor: '#0f0f12',
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    // Load server URL with auto-retry if server is initializing
    mainWindow.webContents.on('did-fail-load', () => {
        setTimeout(() => {
            if (mainWindow) mainWindow.loadURL('http://localhost:38920');
        }, 600);
    });

    mainWindow.loadURL('http://localhost:38920');

    // Handle external links
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

app.whenReady().then(() => {
    startServer();
    setTimeout(() => {
        createWindow();
    }, 1200);

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (serverProcess) serverProcess.kill();
    if (process.platform !== 'darwin') app.quit();
});
