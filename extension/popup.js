const LOCAL_SERVER_API = 'http://localhost:38920/api/extract';
const VERCEL_API = 'https://aio-downloader-sigma.vercel.app/api/extract';

let activeTargetUrl = '';
let currentMediaData = null;
let activeApiEndpoint = LOCAL_SERVER_API;

document.addEventListener('DOMContentLoaded', async () => {
    await checkServerStatus();
    await detectActiveTab();

    document.getElementById('analyzeBtn').addEventListener('click', () => {
        if (activeTargetUrl) fetchMedia(activeTargetUrl);
    });

    document.getElementById('fetchManualBtn').addEventListener('click', () => {
        const val = document.getElementById('manualUrlInput').value.trim();
        if (val) fetchMedia(val);
    });

    document.getElementById('downloadBtn').addEventListener('click', startDownload);
});

async function checkServerStatus() {
    const statusDot = document.getElementById('statusDot');
    const statusLabel = document.getElementById('statusLabel');

    try {
        const res = await fetch('http://localhost:38920/api/downloads', { method: 'GET' });
        if (res.ok) {
            statusDot.className = 'status-dot online';
            statusLabel.textContent = 'Local Server Active';
            activeApiEndpoint = LOCAL_SERVER_API;
            return;
        }
    } catch(e) {}

    statusDot.className = 'status-dot offline';
    statusLabel.textContent = 'Vercel Cloud Active';
    activeApiEndpoint = VERCEL_API;
}

async function detectActiveTab() {
    const display = document.getElementById('tabUrlDisplay');
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab && tab.url && (tab.url.startsWith('http://') || tab.url.startsWith('https://'))) {
            activeTargetUrl = tab.url;
            display.textContent = tab.url;
        } else {
            display.textContent = 'No media URL on current tab.';
        }
    } catch (e) {
        display.textContent = 'Paste URL manually below.';
    }
}

async function fetchMedia(url) {
    showToast('', false);
    const analyzeBtn = document.getElementById('analyzeBtn');
    analyzeBtn.disabled = true;
    analyzeBtn.textContent = '⏳ Extracting Media Streams...';

    try {
        const res = await fetch(activeApiEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: url })
        });

        const data = await res.json();
        analyzeBtn.disabled = false;
        analyzeBtn.textContent = '⚡ Fetch Qualities';

        if (data.success && data.media && data.media.qualities && data.media.qualities.length > 0) {
            currentMediaData = data.media;
            renderMediaResult(data.media);
        } else {
            showToast(data.error || 'Failed to extract media from this URL.');
        }
    } catch (e) {
        analyzeBtn.disabled = false;
        analyzeBtn.textContent = '⚡ Fetch Qualities';

        // Try Vercel API fallback if local server failed
        if (activeApiEndpoint === LOCAL_SERVER_API) {
            activeApiEndpoint = VERCEL_API;
            await fetchMedia(url);
        } else {
            showToast('Network error. Make sure your local server or internet is connected.');
        }
    }
}

function renderMediaResult(media) {
    const mediaCard = document.getElementById('mediaCard');
    const mediaThumb = document.getElementById('mediaThumb');
    const mediaTitle = document.getElementById('mediaTitle');
    const mediaAuthor = document.getElementById('mediaAuthor');
    const qualitySelect = document.getElementById('qualitySelect');

    mediaThumb.src = media.thumbnail || 'https://via.placeholder.com/60';
    mediaTitle.textContent = media.title || 'Extracted Media';
    mediaAuthor.textContent = `${(media.platform || 'media').toUpperCase()} • ${media.qualities.length} Qualities Available`;

    qualitySelect.innerHTML = '';
    media.qualities.forEach((q, idx) => {
        const opt = document.createElement('option');
        opt.value = idx;
        opt.textContent = q.quality;
        qualitySelect.appendChild(opt);
    });

    mediaCard.classList.remove('hidden');
}

async function startDownload() {
    if (!currentMediaData) return;

    const qualitySelect = document.getElementById('qualitySelect');
    const selectedIdx = parseInt(qualitySelect.value, 10);
    const selectedQuality = currentMediaData.qualities[selectedIdx] || currentMediaData.qualities[0];

    const downloadBtn = document.getElementById('downloadBtn');
    downloadBtn.disabled = true;
    downloadBtn.textContent = '⏳ Starting Download...';

    const safeTitle = (currentMediaData.title || 'media').replace(/[^a-zA-Z0-9_\-\s]/g, '').trim().substring(0, 35);
    const format = selectedQuality.format || 'mp4';
    const fileName = `${currentMediaData.platform}_${safeTitle}_${Date.now()}.${format}`;

    // Priority 1: Trigger native local server parallel chunk download if active
    if (activeApiEndpoint === LOCAL_SERVER_API) {
        try {
            await fetch('http://localhost:38920/api/download', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    qualityUrl: selectedQuality.url,
                    fileName: fileName,
                    title: currentMediaData.title,
                    platform: currentMediaData.platform,
                    quality: selectedQuality.quality
                })
            });
            downloadBtn.disabled = false;
            downloadBtn.textContent = '✅ Download Started in M3Downloader!';
            return;
        } catch(e) {}
    }

    // Priority 2: Native Chrome Extension Download via chrome.downloads API
    try {
        chrome.downloads.download({
            url: selectedQuality.url,
            filename: `M3Downloader/${fileName}`,
            saveAs: false
        }, (downloadId) => {
            downloadBtn.disabled = false;
            downloadBtn.textContent = '✅ Downloading in Browser!';
        });
    } catch(e) {
        window.open(selectedQuality.url, '_blank');
        downloadBtn.disabled = false;
        downloadBtn.textContent = '🚀 Start Direct Download';
    }
}

function showToast(msg, isShow = true) {
    const toast = document.getElementById('toast');
    if (!isShow || !msg) {
        toast.classList.add('hidden');
        return;
    }
    toast.textContent = msg;
    toast.classList.remove('hidden');
}
