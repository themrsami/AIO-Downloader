// Initialize Lucide Icons
lucide.createIcons();

// State Variables
let activeView = 'downloader';
let extractedMedia = null;
let selectedQualityIndex = 0;
let downloadsMap = new Map();
let ws = null;
let clipboardCheckInterval = null;
let lastClipboardText = '';

// DOM Elements
const navItems = document.querySelectorAll('.m3-nav-item');
const viewSections = document.querySelectorAll('.view-section');
const pageTitle = document.getElementById('pageTitle');
const themeToggle = document.getElementById('themeToggle');
const paletteBtns = document.querySelectorAll('.palette-btn');

const urlInput = document.getElementById('urlInput');
const pasteBtn = document.getElementById('pasteBtn');
const fetchBtn = document.getElementById('fetchBtn');
const downloadsList = document.getElementById('downloadsList');
const emptyDownloadsState = document.getElementById('emptyDownloadsState');
const activeCountText = document.getElementById('activeCountText');
const clearCompletedBtn = document.getElementById('clearCompletedBtn');

const batchInput = document.getElementById('batchInput');
const batchQualitySelect = document.getElementById('batchQualitySelect');
const startBatchBtn = document.getElementById('startBatchBtn');

const galleryGrid = document.getElementById('galleryGrid');
const openDownloadsFolderBtn = document.getElementById('openDownloadsFolderBtn');

const storagePathInput = document.getElementById('storagePathInput');
const changeFolderBtn = document.getElementById('changeFolderBtn');
const clipboardToggle = document.getElementById('clipboardToggle');

const qualityDialog = document.getElementById('qualityDialog');
const closeQualityDialogBtn = document.getElementById('closeQualityDialogBtn');
const cancelQualityBtn = document.getElementById('cancelQualityBtn');
const confirmDownloadBtn = document.getElementById('confirmDownloadBtn');
const dialogThumb = document.getElementById('dialogThumb');
const dialogTitle = document.getElementById('dialogTitle');
const dialogAuthor = document.getElementById('dialogAuthor');
const dialogPlatform = document.getElementById('dialogPlatform');
const qualityOptionsList = document.getElementById('qualityOptionsList');

const playerDialog = document.getElementById('playerDialog');
const closePlayerDialogBtn = document.getElementById('closePlayerDialogBtn');
const previewVideoPlayer = document.getElementById('previewVideoPlayer');
const playerModalTitle = document.getElementById('playerModalTitle');

const appSnackbar = document.getElementById('appSnackbar');
const snackbarIcon = document.getElementById('snackbarIcon');
const snackbarMessage = document.getElementById('snackbarMessage');
const snackbarActionBtn = document.getElementById('snackbarActionBtn');

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    setupNavigation();
    setupThemeAndPalette();
    setupEventListeners();
    connectWebSocket();
    loadLocalHistory();
    setupClipboardListener();
    checkFfmpegStatus();
    loadAppSettings();
    setupFfmpegInstaller();
});

// Navigation Handler
function setupNavigation() {
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const targetView = item.getAttribute('data-view');
            switchView(targetView);
        });
    });
}

function switchView(targetView) {
    navItems.forEach(i => {
        if (i.getAttribute('data-view') === targetView) i.classList.add('active');
        else i.classList.remove('active');
    });

    viewSections.forEach(sec => sec.classList.remove('active'));
    const activeSec = document.getElementById(`view-${targetView}`);
    if (activeSec) activeSec.classList.add('active');

    activeView = targetView;
    updateHeaderTitle(targetView);

    if (targetView === 'gallery') {
        renderGallery();
    }
}

function updateHeaderTitle(view) {
    const titles = {
        downloader: '<i data-lucide="youtube" style="color: #FF0000; width: 30px; height: 30px;"></i> AIO YouTube Downloader',
        batch: '<i data-lucide="layers" style="color: var(--m3-color-primary)"></i> Batch YouTube Downloader',
        gallery: '<i data-lucide="folder-heart" style="color: var(--m3-color-primary)"></i> Downloaded YouTube Media',
        settings: '<i data-lucide="settings" style="color: var(--m3-color-primary)"></i> Preferences & FFmpeg Settings'
    };
    pageTitle.innerHTML = titles[view] || titles.downloader;
    lucide.createIcons();
}

// LocalStorage Persistent History Management
function getLocalHistory() {
    try {
        return JSON.parse(localStorage.getItem('m3_downloads_history') || '[]');
    } catch (e) {
        return [];
    }
}

function saveLocalHistory(records) {
    localStorage.setItem('m3_downloads_history', JSON.stringify(records));
}

function saveHistoryRecord(record) {
    const history = getLocalHistory();
    const idx = history.findIndex(h => h.id === record.id);
    if (idx >= 0) {
        history[idx] = { ...history[idx], ...record };
    } else {
        history.unshift(record);
    }
    saveLocalHistory(history);
    renderDownloadsList(history);
    renderGallery(history);
}

function loadLocalHistory() {
    const history = getLocalHistory();
    renderDownloadsList(history);
    renderGallery(history);
}

// Theme & Palette Handler
function setupThemeAndPalette() {
    const savedPalette = localStorage.getItem('m3_palette') || 'sunset';
    document.body.setAttribute('data-palette', savedPalette);

    themeToggle.addEventListener('click', () => {
        document.body.classList.toggle('light-theme');
        const isLight = document.body.classList.contains('light-theme');
        themeToggle.innerHTML = isLight ? '<i data-lucide="sun"></i>' : '<i data-lucide="moon"></i>';
        lucide.createIcons();
    });

    paletteBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const palette = btn.getAttribute('data-palette');
            document.body.setAttribute('data-palette', palette);
            localStorage.setItem('m3_palette', palette);
            showSnackbar(`Applied ${palette.toUpperCase()} theme!`, 'palette');
        });
    });
}

// Event Listeners Setup
function setupEventListeners() {
    // Paste Button
    pasteBtn.addEventListener('click', async () => {
        try {
            const text = await navigator.clipboard.readText();
            if (text) {
                urlInput.value = text;
                showSnackbar('Pasted URL from clipboard', 'clipboard-check');
            }
        } catch (e) {
            showSnackbar('Unable to read clipboard. Please paste manually.', 'alert-circle');
        }
    });

    // Fetch Qualities Button
    fetchBtn.addEventListener('click', handleFetchMedia);
    urlInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleFetchMedia();
    });

    // Quality Modal Buttons
    closeQualityDialogBtn.addEventListener('click', closeQualityModal);
    cancelQualityBtn.addEventListener('click', closeQualityModal);
    confirmDownloadBtn.addEventListener('click', handleConfirmDownload);

    // Player Modal Buttons
    closePlayerDialogBtn.addEventListener('click', () => {
        previewVideoPlayer.pause();
        playerDialog.classList.remove('active');
    });

    // Clear Completed Button
    clearCompletedBtn.addEventListener('click', () => {
        const history = getLocalHistory().filter(d => d.status === 'downloading');
        saveLocalHistory(history);
        renderDownloadsList(history);
        renderGallery(history);
        showSnackbar('Cleared completed downloads history', 'trash-2');
    });

    // Open Downloads Folder
    openDownloadsFolderBtn.addEventListener('click', () => {
        fetch('/api/open-folder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });
    });

    if (changeFolderBtn) {
        changeFolderBtn.addEventListener('click', () => {
            fetch('/api/open-folder', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });
        });
    }

    // Batch Queue Button
    startBatchBtn.addEventListener('click', handleStartBatch);
}

// Handle Fetch Media
async function handleFetchMedia() {
    const url = urlInput.value.trim();
    if (!url) {
        showSnackbar('Please enter a YouTube video, shorts, or music URL.', 'alert-circle');
        return;
    }

    fetchBtn.disabled = true;
    fetchBtn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Fetching...';
    lucide.createIcons();

    try {
        const res = await fetch('/api/extract', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        });
        const data = await res.json();

        if (!data.success) {
            throw new Error(data.error || 'Failed to extract media.');
        }

        extractedMedia = data.media || data.data;
        if (!extractedMedia) {
            throw new Error('Extraction returned invalid media data.');
        }
        openQualityModal(extractedMedia);

    } catch (err) {
        showSnackbar(`Error: ${err.message}`, 'alert-triangle');
    } finally {
        fetchBtn.disabled = false;
        fetchBtn.innerHTML = '<i data-lucide="sparkles"></i> Fetch Video';
        lucide.createIcons();
    }
}

// Open Quality Modal
function openQualityModal(media) {
    dialogThumb.src = media.thumbnail || 'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=150';
    dialogTitle.textContent = media.title || 'Untitled Media';
    dialogAuthor.textContent = `By ${media.author || 'Creator'}`;
    dialogPlatform.textContent = (media.platform || 'YOUTUBE').toUpperCase();
    dialogPlatform.className = `m3-chip ${media.platform || 'youtube'}`;

    selectedQualityIndex = 0;
    qualityOptionsList.innerHTML = '';

    media.qualities.forEach((q, index) => {
        const item = document.createElement('div');
        item.className = `quality-option-item ${index === 0 ? 'selected' : ''}`;

        let typeBadge = '';
        if (q.requiresMuxing) {
            typeBadge = '<span class="m3-chip" style="font-size: 11px; padding: 2px 8px; margin-left: 6px; background: rgba(16, 185, 129, 0.2); color: #10B981; border: 1px solid rgba(16, 185, 129, 0.35); border-radius: 6px; font-weight: 700; display: inline-flex; align-items: center; gap: 4px;"><i data-lucide="sparkles" style="width: 12px; height: 12px;"></i>Video + Audio (FFmpeg Merged)</span>';
        } else if (q.isVideoOnly) {
            typeBadge = '<span class="m3-chip" style="font-size: 11px; padding: 2px 8px; margin-left: 6px; background: rgba(245, 158, 11, 0.2); color: #F59E0B; border: 1px solid rgba(245, 158, 11, 0.35); border-radius: 6px; font-weight: 600;">Video Only</span>';
        } else if (q.hasAudio && q.hasVideo) {
            typeBadge = '<span class="m3-chip" style="font-size: 11px; padding: 2px 8px; margin-left: 6px; background: rgba(59, 130, 246, 0.2); color: #60A5FA; border: 1px solid rgba(59, 130, 246, 0.35); border-radius: 6px; font-weight: 600;">Standard (Video + Audio)</span>';
        } else if (q.type === 'audio') {
            typeBadge = '<span class="m3-chip" style="font-size: 11px; padding: 2px 8px; margin-left: 6px; background: rgba(168, 85, 247, 0.2); color: #C084FC; border: 1px solid rgba(168, 85, 247, 0.35); border-radius: 6px; font-weight: 600;">Audio Track</span>';
        }

        item.innerHTML = `
            <div style="flex: 1;">
                <div style="font-weight: 600; font-size: 14px; display: flex; align-items: center; flex-wrap: wrap; gap: 4px;">
                    <span>${q.quality}</span>
                    ${typeBadge}
                </div>
                <div style="font-size: 12px; color: var(--m3-color-on-surface-variant); margin-top: 3px;">
                    ${q.label || `Format: ${(q.format || 'MP4').toUpperCase()}`}
                </div>
            </div>
            <span class="badge-quality">${(q.format || 'MP4').toUpperCase()}</span>
        `;

        item.addEventListener('click', () => {
            document.querySelectorAll('.quality-option-item').forEach(i => i.classList.remove('selected'));
            item.classList.add('selected');
            selectedQualityIndex = index;
        });

        qualityOptionsList.appendChild(item);
    });

    qualityDialog.classList.add('active');
    lucide.createIcons();
}

function closeQualityModal() {
    qualityDialog.classList.remove('active');
}

// Auto Download File Helper - Downloads file straight to Downloads folder without opening new tabs
async function triggerAutoDownloadFile(url, fileName) {
    if (!url) return;
    showSnackbar(`Downloading ${fileName || 'media'} to Downloads folder...`, 'download');

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Fetch failed');
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = blobUrl;
        a.download = fileName || `media_${Date.now()}.mp4`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
        showSnackbar(`Saved ${fileName || 'file'} to Downloads folder!`, 'check-circle');
    } catch (e) {
        // Stream fallback anchor
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = fileName || `media_${Date.now()}.mp4`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }
}

// Handle Confirm Download
async function handleConfirmDownload() {
    if (!extractedMedia || selectedQualityIndex === undefined) return;

    const q = extractedMedia.qualities[selectedQualityIndex] || extractedMedia.qualities[0];
    closeQualityModal();

    if (q.requiresMuxing) {
        showSnackbar('Starting 1080p/4K download & FFmpeg stream muxing...', 'sparkles');
    } else {
        showSnackbar('Starting fast media download...', 'zap');
    }

    const taskId = `dl_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const safeTitle = (extractedMedia.title || 'media').replace(/[^a-zA-Z0-9_\-\s]/g, '').trim().substring(0, 35);
    const fileName = `${extractedMedia.platform}_${safeTitle}_${Date.now()}.${q.format || 'mp4'}`;

    const record = {
        id: taskId,
        platform: extractedMedia.platform,
        title: extractedMedia.title,
        thumbnail: extractedMedia.thumbnail,
        quality: q.quality,
        format: q.format || 'mp4',
        status: 'downloading',
        percent: 5,
        speedFormatted: 'Starting parallel stream...',
        etaFormatted: q.requiresMuxing ? 'Downloading video & audio streams...' : 'Downloading...',
        downloadUrl: q.url,
        fileName: fileName,
        requiresMuxing: Boolean(q.requiresMuxing),
        timestamp: Date.now()
    };

    saveHistoryRecord(record);

    try {
        const res = await fetch('/api/download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                media: extractedMedia,
                selectedQualityIndex: selectedQualityIndex,
                qualityUrl: q.url,
                fileName: fileName
            })
        });

        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
            const data = await res.json();
            if (data.success) {
                urlInput.value = '';
                if (data.taskId && data.taskId !== taskId) {
                    const history = getLocalHistory();
                    const idx = history.findIndex(h => h.id === taskId);
                    if (idx >= 0) {
                        history[idx].id = data.taskId;
                        if (data.savePath) history[idx].filePath = data.savePath;
                        saveLocalHistory(history);
                        renderDownloadsList(history);
                    }
                }
            } else {
                record.status = 'error';
                record.speedFormatted = 'Download failed';
                record.etaFormatted = data.error || 'Server error';
                saveHistoryRecord(record);
                showSnackbar(data.error || 'Download failed', 'alert-triangle');
            }
        } else {
            // Binary stream response (Vercel serverless mode)
            const blob = await res.blob();
            const blobUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = blobUrl;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);

            urlInput.value = '';
            record.status = 'completed';
            record.percent = 100;
            record.speedFormatted = 'Completed';
            record.etaFormatted = 'Done';
            saveHistoryRecord(record);
        }
    } catch (err) {
        record.status = 'error';
        record.speedFormatted = 'Error';
        record.etaFormatted = err.message;
        saveHistoryRecord(record);
        showSnackbar(`Download error: ${err.message}`, 'alert-triangle');
    }
}

// Connect WebSocket for Real-time Progress
function connectWebSocket() {
    try {
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        ws = new WebSocket(`${wsProtocol}//${window.location.host}`);

        ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                if (msg.type === 'download_progress' || msg.type === 'progress') {
                    updateDownloadProgress(msg.data);
                } else if (msg.type === 'download_completed') {
                    const finishedRecord = msg.data || {};
                    if (msg.filePath) finishedRecord.filePath = msg.filePath;
                    if (finishedRecord.id) {
                        saveHistoryRecord(finishedRecord);
                    }
                    showSnackbar('Download & Muxing Completed!', 'check-circle-2');
                } else if (msg.type === 'download_error') {
                    showSnackbar(`Download Error: ${msg.error || 'Failed'}`, 'alert-triangle');
                } else if (msg.type === 'ffmpeg_progress') {
                    const p = msg.data;
                    const ffmpegProgressContainer = document.getElementById('ffmpegProgressContainer');
                    const ffmpegProgressText = document.getElementById('ffmpegProgressText');
                    const ffmpegProgressPercent = document.getElementById('ffmpegProgressPercent');
                    const ffmpegProgressBar = document.getElementById('ffmpegProgressBar');

                    if (ffmpegProgressContainer) ffmpegProgressContainer.style.display = 'block';
                    if (ffmpegProgressBar) ffmpegProgressBar.style.width = `${p.percent}%`;
                    if (ffmpegProgressPercent) ffmpegProgressPercent.textContent = `${p.percent}%`;
                    if (ffmpegProgressText) {
                        if (p.stage === 'extracting') {
                            ffmpegProgressText.textContent = 'Extracting FFmpeg binaries (PowerShell)...';
                        } else if (p.stage === 'verifying') {
                            ffmpegProgressText.textContent = 'Verifying FFmpeg executable...';
                        } else {
                            ffmpegProgressText.textContent = `Downloading: ${p.downloadedFormatted || ''} / ${p.totalFormatted || ''} (${p.speedFormatted || ''})`;
                        }
                    }
                } else if (msg.type === 'ffmpeg_ready') {
                    const ffmpegReadyChip = document.getElementById('ffmpegReadyChip');
                    const ffmpegMissingBanner = document.getElementById('ffmpegMissingBanner');
                    const ffmpegProgressContainer = document.getElementById('ffmpegProgressContainer');
                    const ffmpegVersionText = document.getElementById('ffmpegVersionText');

                    if (ffmpegProgressContainer) ffmpegProgressContainer.style.display = 'none';
                    if (ffmpegMissingBanner) ffmpegMissingBanner.style.display = 'none';
                    if (ffmpegReadyChip) {
                        ffmpegReadyChip.style.display = 'inline-flex';
                        if (ffmpegVersionText) {
                            ffmpegVersionText.textContent = msg.data && msg.data.version ? `FFmpeg ${msg.data.version.split(' ')[0]}` : 'FFmpeg Ready';
                        }
                    }
                    showSnackbar('FFmpeg installed & verified! High quality muxing is ready.', 'check-circle');
                    lucide.createIcons();
                } else if (msg.type === 'ffmpeg_error') {
                    const installFfmpegBtn = document.getElementById('installFfmpegBtn');
                    const ffmpegProgressContainer = document.getElementById('ffmpegProgressContainer');
                    if (ffmpegProgressContainer) ffmpegProgressContainer.style.display = 'none';
                    if (installFfmpegBtn) {
                        installFfmpegBtn.disabled = false;
                        installFfmpegBtn.innerHTML = '<i data-lucide="download"></i> Retry Install FFmpeg';
                        lucide.createIcons();
                    }
                    showSnackbar(`FFmpeg error: ${msg.error}`, 'alert-triangle');
                }
            } catch (e) {
                console.error('WS parse error:', e);
            }
        };

        ws.onclose = () => {
            setTimeout(connectWebSocket, 5000);
        };
    } catch(e) {
        console.log('WebSocket not active in serverless mode.');
    }
}

// Update Download Progress UI
function updateDownloadProgress(stats) {
    const card = document.getElementById(`card_${stats.id}`);
    if (card) {
        const progressBar = card.querySelector('.m3-progress-bar');
        const percentText = card.querySelector('.progress-percent');
        const speedText = card.querySelector('.speed-text');
        const etaText = card.querySelector('.eta-text');

        if (progressBar) {
            progressBar.style.width = `${stats.percent}%`;
            if (stats.status === 'muxing') {
                progressBar.style.background = 'linear-gradient(90deg, #10B981, #059669)';
            }
        }
        if (percentText) percentText.textContent = `${stats.percent}%`;
        if (speedText) speedText.textContent = stats.speedFormatted || '';
        if (etaText) etaText.textContent = stats.etaFormatted || (stats.status === 'muxing' ? 'Merging audio + video...' : '');
    }

    const history = getLocalHistory();
    const record = history.find(h => h.id === stats.id);
    if (record) {
        record.percent = stats.percent;
        if (stats.speedFormatted) record.speedFormatted = stats.speedFormatted;
        if (stats.etaFormatted) record.etaFormatted = stats.etaFormatted;
        if (stats.status) record.status = stats.status;
        saveLocalHistory(history.map(h => h.id === stats.id ? { ...h, ...stats } : h));
    }
}

// Render Downloads List
function renderDownloadsList(historyList) {
    const downloads = historyList || getLocalHistory();

    if (downloads.length === 0) {
        downloadsList.innerHTML = `
            <div style="text-align: center; padding: 40px; color: var(--m3-color-on-surface-variant);">
                <i data-lucide="download-cloud" style="width: 48px; height: 48px; opacity: 0.5; margin-bottom: 12px;"></i>
                <p style="font-size: 15px; font-weight: 500;">No active or past downloads</p>
                <p style="font-size: 12px; margin-top: 4px;">Paste a YouTube link above to start downloading media at ultra-fast speeds.</p>
            </div>
        `;
        lucide.createIcons();
        return;
    }

    downloadsList.innerHTML = '';
    downloads.forEach(d => {
        const card = document.createElement('div');
        card.className = 'download-card';
        card.id = `card_${d.id}`;

        const isMuxing = d.status === 'muxing';
        const isDownloading = d.status === 'downloading' || d.status === 'extracting';
        const isCompleted = d.status === 'completed';

        card.innerHTML = `
            <img src="${d.thumbnail || 'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=100'}" class="download-thumb" alt="Thumb">
            <div class="download-info">
                <div class="download-title">${d.title || 'Downloading Media...'}</div>
                <div class="download-meta">
                    <span class="badge-quality">${d.quality || 'HD'}</span>
                    <span class="speed-text" style="font-weight: 700; color: ${isMuxing ? '#10B981' : 'var(--m3-color-primary)'};">${d.speedFormatted || (isCompleted ? 'Completed' : 'Downloading...')}</span>
                    <span class="eta-text">${isMuxing ? 'Muxing Streams (FFmpeg)...' : (isDownloading ? (d.etaFormatted || 'In progress...') : (isCompleted ? 'Completed' : 'Failed'))}</span>
                </div>
                <div class="m3-progress-container" style="margin-top: 6px;">
                    <div class="m3-progress-bar" style="width: ${d.percent || (isCompleted ? 100 : 20)}%; ${isMuxing ? 'background: linear-gradient(90deg, #10B981, #059669);' : ''}"></div>
                </div>
            </div>
            <div style="display: flex; gap: 8px; align-items: center;">
                <span class="progress-percent" style="font-size: 13px; font-weight: 700; min-width: 40px; text-align: right;">${d.percent || (isCompleted ? 100 : 20)}%</span>
                ${isCompleted ? `
                    <button class="m3-btn-icon open-folder-item-btn" data-filepath="${d.filePath || ''}" title="Show in Windows Explorer" style="color: var(--m3-color-on-surface-variant); background: rgba(255,255,255,0.06); border: none; cursor: pointer; border-radius: var(--m3-shape-s); width: 34px; height: 34px; display: flex; align-items: center; justify-content: center;">
                        <i data-lucide="folder-open" style="width: 18px; height: 18px;"></i>
                    </button>
                    ${d.downloadUrl && !d.requiresMuxing ? `
                        <button class="m3-btn-icon play-btn dl-trigger-btn" title="Download File directly to Browser" style="color: var(--m3-color-primary); background: transparent; border: none; cursor: pointer;">
                            <i data-lucide="download" style="width: 18px; height: 18px;"></i>
                        </button>
                    ` : ''}
                ` : ''}
            </div>
        `;

        const folderBtn = card.querySelector('.open-folder-item-btn');
        if (folderBtn) {
            folderBtn.addEventListener('click', () => {
                const fp = folderBtn.getAttribute('data-filepath');
                fetch('/api/open-folder', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ filePath: fp || undefined })
                });
            });
        }

        const btn = card.querySelector('.dl-trigger-btn');
        if (btn) {
            btn.addEventListener('click', () => {
                triggerAutoDownloadFile(d.downloadUrl, d.fileName);
            });
        }

        downloadsList.appendChild(card);
    });

    lucide.createIcons();
}

// Render Media Gallery
function renderGallery() {
    const downloads = getLocalHistory();
    const completed = downloads.filter(d => d.status === 'completed' || d.downloadUrl);

    if (completed.length === 0) {
        galleryGrid.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: var(--m3-color-on-surface-variant);">
                <i data-lucide="folder-open" style="width: 48px; height: 48px; opacity: 0.5; margin-bottom: 12px;"></i>
                <p style="font-size: 15px; font-weight: 500;">No downloaded files yet</p>
                <p style="font-size: 12px; margin-top: 4px;">Completed downloads will automatically appear in your saved gallery.</p>
            </div>
        `;
        lucide.createIcons();
        return;
    }

    galleryGrid.innerHTML = '';
    completed.forEach(item => {
        const card = document.createElement('div');
        card.className = 'm3-card';
        card.style.padding = '12px';

        card.innerHTML = `
            <div style="position: relative; border-radius: var(--m3-shape-m); overflow: hidden; height: 160px; background: #000;">
                <img src="${item.thumbnail || 'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=300'}" style="width: 100%; height: 100%; object-fit: cover;">
                <div style="position: absolute; top: 8px; left: 8px;" class="m3-chip ${item.platform}">${(item.platform || 'YOUTUBE').toUpperCase()}</div>
                <button class="m3-btn-icon open-gallery-folder-btn" data-filepath="${item.filePath || ''}" style="position: absolute; top: 8px; right: 8px; background: rgba(0,0,0,0.65); color: #fff; width: 34px; height: 34px; border: none; cursor: pointer; border-radius: var(--m3-shape-s); display: flex; align-items: center; justify-content: center;" title="Show in Windows Explorer">
                    <i data-lucide="folder-open" style="width: 16px; height: 16px;"></i>
                </button>
            </div>
            <div style="margin-top: 10px;">
                <div style="font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${item.title || 'Media Item'}</div>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 6px;">
                    <span class="badge-quality">${item.quality || 'HD'}</span>
                    <span style="font-size: 11px; color: var(--m3-color-on-surface-variant);">${(item.format || 'MP4').toUpperCase()}</span>
                </div>
            </div>
        `;

        const folderBtn = card.querySelector('.open-gallery-folder-btn');
        if (folderBtn) {
            folderBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const fp = folderBtn.getAttribute('data-filepath');
                fetch('/api/open-folder', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ filePath: fp || undefined })
                });
            });
        }

        galleryGrid.appendChild(card);
    });

    lucide.createIcons();
}

// Open Video Player Modal
function openVideoPlayer(filePath, title) {
    playerModalTitle.textContent = title || 'Video Preview';
    playerDialog.classList.add('active');
}

// Handle Batch Multi-Link Download
async function handleStartBatch() {
    const text = batchInput.value.trim();
    if (!text) {
        showSnackbar('Please enter one or more media links.', 'alert-circle');
        return;
    }

    const urls = text.split('\n').map(u => u.trim()).filter(u => u.length > 0);
    showSnackbar(`Batch downloading ${urls.length} URLs...`, 'layers');

    startBatchBtn.disabled = true;
    startBatchBtn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Batch Processing...';
    lucide.createIcons();

    // Switch view to Downloader section so user sees active progress cards
    switchView('downloader');

    for (let i = 0; i < urls.length; i++) {
        const url = urls[i];
        const taskId = `batch_${Date.now()}_${i}`;

        const initialRecord = {
            id: taskId,
            platform: url.includes('instagram') ? 'instagram' : (url.includes('facebook') ? 'facebook' : (url.includes('tiktok') ? 'tiktok' : (url.includes('twitter') || url.includes('x.com') ? 'twitter' : 'pinterest'))),
            title: `Batch Item ${i + 1}: ${url.substring(0, 30)}...`,
            thumbnail: '',
            quality: 'Auto HD',
            format: 'mp4',
            status: 'extracting',
            percent: 15,
            speedFormatted: 'Extracting metadata...',
            timestamp: Date.now()
        };

        saveHistoryRecord(initialRecord);

        try {
            const extractRes = await fetch('/api/extract', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url })
            });

            const extractData = await extractRes.json();
            if (extractData.success && extractData.media && extractData.media.qualities.length > 0) {
                const media = extractData.media;
                const q = media.qualities[0];

                initialRecord.title = media.title;
                initialRecord.thumbnail = media.thumbnail;
                initialRecord.quality = q.quality;
                initialRecord.status = 'downloading';
                initialRecord.percent = 50;
                initialRecord.speedFormatted = 'Downloading stream...';
                saveHistoryRecord(initialRecord);

                const dlRes = await fetch('/api/download', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ media: media, selectedQualityIndex: 0 })
                });

                const contentType = dlRes.headers.get('content-type') || '';
                if (contentType.includes('application/json')) {
                    const dlData = await dlRes.json();
                    if (dlData.success) {
                        initialRecord.status = 'completed';
                        initialRecord.percent = 100;
                        initialRecord.speedFormatted = 'Completed';
                        initialRecord.downloadUrl = q.url;
                        saveHistoryRecord(initialRecord);
                    }
                } else {
                    const blob = await dlRes.blob();
                    const safeTitle = (media.title || 'media').replace(/[^a-zA-Z0-9_\-\s]/g, '').trim().substring(0, 30);
                    const fileName = `${media.platform}_${safeTitle}_${Date.now()}.${q.format || 'mp4'}`;

                    const blobUrl = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = blobUrl;
                    a.download = fileName;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);

                    initialRecord.status = 'completed';
                    initialRecord.percent = 100;
                    initialRecord.speedFormatted = 'Completed';
                    initialRecord.downloadUrl = q.url;
                    saveHistoryRecord(initialRecord);
                }
            } else {
                initialRecord.status = 'error';
                initialRecord.speedFormatted = 'Extraction Failed';
                saveHistoryRecord(initialRecord);
            }
        } catch (e) {
            initialRecord.status = 'error';
            initialRecord.speedFormatted = 'Failed';
            saveHistoryRecord(initialRecord);
        }
    }

    startBatchBtn.disabled = false;
    startBatchBtn.innerHTML = '<i data-lucide="play-circle"></i> Start Batch Download Queue';
    lucide.createIcons();
    showSnackbar('Batch Queue Completed!', 'check-circle-2');
}

// Clipboard Listener
function setupClipboardListener() {
    if (!clipboardToggle || !clipboardToggle.checked) return;

    clipboardCheckInterval = setInterval(async () => {
        try {
            if (document.hasFocus()) {
                const text = await navigator.clipboard.readText();
                if (text && text !== lastClipboardText && isMediaUrl(text)) {
                    lastClipboardText = text;
                    if (urlInput && !urlInput.value) {
                        urlInput.value = text;
                        showSnackbar('Detected media URL in clipboard! Tap Fetch to download.', 'clipboard');
                    }
                }
            }
        } catch (e) {
            // Ignore clipboard permission errors
        }
    }, 3000);
}

function isMediaUrl(text) {
    return text.includes('youtube.com') || text.includes('youtu.be') || text.includes('instagram.com') || text.includes('facebook.com') || text.includes('fb.watch') || text.includes('tiktok.com') || text.includes('twitter.com') || text.includes('x.com') || text.includes('pinterest.com') || text.includes('pin.it');
}

// Toast Snackbar Notification
function showSnackbar(message, iconName = 'info') {
    snackbarMessage.textContent = message;
    snackbarIcon.setAttribute('data-lucide', iconName);
    lucide.createIcons();

    appSnackbar.classList.add('active');
    setTimeout(() => {
        appSnackbar.classList.remove('active');
    }, 4000);
}

// Check FFmpeg Status on App Start
async function checkFfmpegStatus() {
    const ffmpegReadyChip = document.getElementById('ffmpegReadyChip');
    const ffmpegMissingBanner = document.getElementById('ffmpegMissingBanner');
    const ffmpegVersionText = document.getElementById('ffmpegVersionText');

    try {
        const res = await fetch('/api/ffmpeg/status');
        const data = await res.json();
        if (data.success && data.available) {
            if (ffmpegReadyChip) {
                ffmpegReadyChip.style.display = 'inline-flex';
                if (ffmpegVersionText) {
                    ffmpegVersionText.textContent = data.version ? `FFmpeg ${data.version.split(' ')[0]}` : 'FFmpeg Ready';
                }
            }
            if (ffmpegMissingBanner) ffmpegMissingBanner.style.display = 'none';
        } else {
            if (ffmpegReadyChip) ffmpegReadyChip.style.display = 'none';
            if (ffmpegMissingBanner) ffmpegMissingBanner.style.display = 'block';
        }
        lucide.createIcons();
    } catch (e) {
        console.warn('Could not check FFmpeg status:', e);
    }
}

// Load Application Settings (Download Folder, etc.)
async function loadAppSettings() {
    try {
        const res = await fetch('/api/downloads');
        const data = await res.json();
        if (data.success && data.defaultDownloadDir) {
            if (storagePathInput) storagePathInput.value = data.defaultDownloadDir;
        }
    } catch (e) {
        console.warn('Could not load app settings:', e);
    }
}

// Setup FFmpeg One-Click Installer
function setupFfmpegInstaller() {
    const installFfmpegBtn = document.getElementById('installFfmpegBtn');
    const ffmpegProgressContainer = document.getElementById('ffmpegProgressContainer');
    const ffmpegProgressText = document.getElementById('ffmpegProgressText');
    const ffmpegProgressPercent = document.getElementById('ffmpegProgressPercent');
    const ffmpegProgressBar = document.getElementById('ffmpegProgressBar');

    if (installFfmpegBtn) {
        installFfmpegBtn.addEventListener('click', async () => {
            installFfmpegBtn.disabled = true;
            installFfmpegBtn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Downloading FFmpeg...';
            lucide.createIcons();

            if (ffmpegProgressContainer) ffmpegProgressContainer.style.display = 'block';
            if (ffmpegProgressText) ffmpegProgressText.textContent = 'Connecting to download server...';
            if (ffmpegProgressPercent) ffmpegProgressPercent.textContent = '0%';
            if (ffmpegProgressBar) ffmpegProgressBar.style.width = '0%';

            try {
                const res = await fetch('/api/ffmpeg/install', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });
                const data = await res.json();
                if (!data.success) {
                    throw new Error(data.error || 'Failed to start installation');
                }
            } catch (err) {
                showSnackbar(`FFmpeg install failed: ${err.message}`, 'alert-triangle');
                installFfmpegBtn.disabled = false;
                installFfmpegBtn.innerHTML = '<i data-lucide="download"></i> Download & Install FFmpeg (One-Click)';
                lucide.createIcons();
                if (ffmpegProgressContainer) ffmpegProgressContainer.style.display = 'none';
            }
        });
    }
}
