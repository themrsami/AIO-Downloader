const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const cors = require('cors');
const fs = require('fs');

const instagramScraper = require('../engine/instagramScraper.js');
const facebookScraper = require('../engine/facebookScraper.js');
const tiktokScraper = require('../engine/tiktokScraper.js');
const twitterScraper = require('../engine/twitterScraper.js');
const pinterestScraper = require('../engine/pinterestScraper.js');
const chunkDownloader = require('../engine/chunkDownloader.js');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = 38920;
const downloadsStore = [];

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../ui')));

// Ensure downloads directory exists
const downloadsFolder = path.join(process.env.USERPROFILE || process.env.HOME || '.', 'Downloads', 'M3Downloader');
if (!fs.existsSync(downloadsFolder)) {
    fs.mkdirSync(downloadsFolder, { recursive: true });
}

// Get Downloads History & Settings
app.get('/api/downloads', (req, res) => {
    res.json({
        success: true,
        defaultDownloadDir: downloadsFolder,
        downloads: downloadsStore
    });
});

// Clear Completed Downloads History
app.post('/api/clear-history', (req, res) => {
    for (let i = downloadsStore.length - 1; i >= 0; i--) {
        if (downloadsStore[i].status === 'completed') {
            downloadsStore.splice(i, 1);
        }
    }
    res.json({ success: true, downloads: downloadsStore });
});

// Multi-Platform Extractor Router
app.post('/api/extract', async (req, res) => {
    const { url } = req.body;
    if (!url || typeof url !== 'string') {
        return res.status(400).json({ error: 'Please enter a valid media URL.' });
    }

    const cleanUrl = url.trim();

    try {
        let mediaData = null;

        if (cleanUrl.includes('instagram.com')) {
            mediaData = await instagramScraper.extract(cleanUrl);
        } else if (cleanUrl.includes('facebook.com') || cleanUrl.includes('fb.watch') || cleanUrl.includes('fb.gg')) {
            mediaData = await facebookScraper.extract(cleanUrl);
        } else if (cleanUrl.includes('tiktok.com') || cleanUrl.includes('vt.tiktok.com')) {
            mediaData = await tiktokScraper.extract(cleanUrl);
        } else if (cleanUrl.includes('twitter.com') || cleanUrl.includes('x.com')) {
            mediaData = await twitterScraper.extract(cleanUrl);
        } else if (cleanUrl.includes('pinterest.com') || cleanUrl.includes('pin.it')) {
            mediaData = await pinterestScraper.extract(cleanUrl);
        } else {
            return res.status(400).json({ error: 'Unsupported URL. Supported platforms: Instagram, Facebook, TikTok, Twitter/X, and Pinterest.' });
        }

        return res.json({ success: true, media: mediaData, data: mediaData });
    } catch (e) {
        return res.status(500).json({ error: e.message || 'Media extraction failed.' });
    }
});

// Start Parallel Chunk Download Router
app.post('/api/download', async (req, res) => {
    const { qualityUrl, fileName, title, platform, quality, media, selectedQualityIndex } = req.body;

    let targetUrl = qualityUrl;
    let targetFileName = fileName;
    let targetTitle = title;
    let targetPlatform = platform;
    let targetQuality = quality || 'HD Quality';
    let targetFormat = 'mp4';
    let targetThumb = '';

    if (media && media.qualities) {
        const idx = selectedQualityIndex || 0;
        const q = media.qualities[idx] || media.qualities[0];
        targetUrl = q.url;
        targetTitle = media.title;
        targetPlatform = media.platform;
        targetQuality = q.quality;
        targetFormat = q.format || 'mp4';
        targetThumb = media.thumbnail;
        const safeTitle = (media.title || 'media').replace(/[^a-zA-Z0-9_\-\s]/g, '').trim().substring(0, 35);
        targetFileName = `${media.platform}_${safeTitle}_${Date.now()}.${targetFormat}`;
    }

    if (!targetUrl) {
        return res.status(400).json({ error: 'Download URL is required.' });
    }

    const saveFileName = targetFileName || `media_${Date.now()}.mp4`;
    const targetFilePath = path.join(downloadsFolder, saveFileName);
    const taskId = `task_${Date.now()}`;

    const record = {
        id: taskId,
        platform: targetPlatform || 'media',
        title: targetTitle || 'Downloaded Media',
        thumbnail: targetThumb || '',
        quality: targetQuality,
        format: targetFormat,
        status: 'downloading',
        percent: 0,
        speedFormatted: '0 KB/s',
        etaFormatted: 'Calculating...',
        filePath: targetFilePath,
        saveFileName: saveFileName
    };

    downloadsStore.unshift(record);

    // Respond immediately with Task ID
    res.json({ success: true, taskId, record, savePath: targetFilePath });

    // Execute 6-stream parallel chunk download in background
    try {
        await chunkDownloader.downloadParallel(targetUrl, targetFilePath, (progress) => {
            record.percent = progress.percent;
            record.speedFormatted = progress.speedFormatted;
            record.etaFormatted = progress.etaFormatted;

            broadcastWS({
                type: 'download_progress',
                taskId,
                data: {
                    id: taskId,
                    percent: progress.percent,
                    downloadedBytes: progress.downloadedBytes,
                    totalBytes: progress.totalBytes,
                    speedBytes: progress.speedBytes,
                    speedFormatted: progress.speedFormatted,
                    etaFormatted: progress.etaFormatted
                }
            });
        });

        record.status = 'completed';
        record.percent = 100;
        record.speedFormatted = 'Completed';
        record.etaFormatted = 'Done';

        broadcastWS({
            type: 'download_completed',
            taskId,
            data: record,
            filePath: targetFilePath,
            saveFileName
        });

    } catch (e) {
        record.status = 'error';
        record.speedFormatted = 'Failed';

        broadcastWS({
            type: 'download_error',
            taskId,
            data: record,
            error: e.message
        });
    }
});

// Open File in Windows Explorer
app.post('/api/open-folder', (req, res) => {
    const { filePath } = req.body;
    const targetPath = filePath || downloadsFolder;
    const { exec } = require('child_process');

    if (process.platform === 'win32') {
        exec(`explorer.exe /select,"${targetPath}"`, (err) => {
            if (err) exec(`explorer.exe "${downloadsFolder}"`);
        });
    }
    res.json({ success: true });
});

// WebSocket Server for Live Download Progress
function broadcastWS(data) {
    const payload = JSON.stringify(data);
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(payload);
        }
    });
}

server.listen(PORT, () => {
    console.log(`\n==================================================`);
    console.log(`  Material v3 Multi-Site App Server Active!     `);
    console.log(`  URL: http://localhost:${PORT}                 `);
    console.log(`==================================================\n`);
});
