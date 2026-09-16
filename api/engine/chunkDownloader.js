const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const axios = require('axios');
const { URL } = require('url');

/**
 * High-Performance Multi-Chunk Parallel Downloader
 * Downloads files using HTTP Range requests in 4-8 parallel streams for maximum speed.
 */
class ChunkDownloader {
    constructor(options = {}) {
        this.concurrency = options.concurrency || 6;
        this.chunkSize = options.chunkSize || 2 * 1024 * 1024; // 2MB chunk default
        this.activeDownloads = new Map();
    }

    /**
     * Download a file from URL to destination path with real-time progress callbacks
     */
    async download(id, url, destPath, onProgress, onStatusChange) {
        const downloadState = {
            id,
            url,
            destPath,
            status: 'downloading', // downloading, paused, completed, error, cancelled
            totalBytes: 0,
            downloadedBytes: 0,
            startTime: Date.now(),
            speedBytesPerSec: 0,
            chunks: [],
            abortControllers: [],
            isPaused: false,
            isCancelled: false
        };

        this.activeDownloads.set(id, downloadState);

        try {
            if (onStatusChange) onStatusChange('downloading', downloadState);

            // Fetch headers to get content-length and accept-ranges
            const fileInfo = await this.getFileInfo(url);
            downloadState.totalBytes = fileInfo.contentLength;
            const supportsRanges = fileInfo.acceptRanges;

            // For YouTube (googlevideo.com / youtube) or when ranges are not supported,
            // direct streaming provides 100% reliability at full network line speed
            // without temporary .dat files, without memory buffer crashes, and without Windows EPERM file locking!
            const isYouTube = url.includes('googlevideo.com') || url.includes('youtube');
            if (isYouTube || !supportsRanges || downloadState.totalBytes <= 0 || downloadState.totalBytes < 5 * 1024 * 1024) {
                await this.downloadDirectStream(downloadState, onProgress);
            } else {
                await this.downloadMultiChunk(downloadState, onProgress);
            }

            if (downloadState.isCancelled) {
                if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
                if (onStatusChange) onStatusChange('cancelled', downloadState);
                return { success: false, reason: 'cancelled' };
            }

            downloadState.status = 'completed';
            if (onStatusChange) onStatusChange('completed', downloadState);
            return { success: true, path: destPath, totalBytes: downloadState.totalBytes };

        } catch (error) {
            console.error(`Download failed [${id}]:`, error.message);
            downloadState.status = 'error';
            downloadState.error = error.message;
            if (onStatusChange) onStatusChange('error', downloadState);
            throw error;
        } finally {
            this.activeDownloads.delete(id);
        }
    }

    getUaForUrl(urlStr) {
        if (urlStr && urlStr.includes('googlevideo.com')) {
            return 'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15';
        }
        return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
    }

    async getFileInfo(urlStr) {
        return new Promise((resolve) => {
            try {
                const parsedUrl = new URL(urlStr);
                const protocol = parsedUrl.protocol === 'https:' ? https : http;
                const ua = this.getUaForUrl(urlStr);
                
                // Use GET with Range: bytes=0-0 for 100% CDN compatibility (bypasses HEAD 405/403 blocks)
                const req = protocol.request(parsedUrl, {
                    method: 'GET',
                    headers: {
                        'User-Agent': ua,
                        'Range': 'bytes=0-0'
                    }
                }, (res) => {
                    // Handle redirects
                    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                        return this.getFileInfo(res.headers.location).then(resolve);
                    }
                    
                    let contentLength = 0;
                    let acceptRanges = false;

                    if (res.headers['content-range']) {
                        acceptRanges = true;
                        const match = res.headers['content-range'].match(/\/(\d+)/);
                        if (match) contentLength = parseInt(match[1], 10);
                    } else if (res.headers['content-length']) {
                        contentLength = parseInt(res.headers['content-length'], 10);
                        acceptRanges = res.headers['accept-ranges'] === 'bytes';
                    }

                    resolve({ contentLength, acceptRanges });
                });

                req.on('error', () => resolve({ contentLength: 0, acceptRanges: false }));
                req.end();
            } catch (err) {
                resolve({ contentLength: 0, acceptRanges: false });
            }
        });
    }

    async downloadDirectStream(state, onProgress, maxRetries = 3) {
        const ua = this.getUaForUrl(state.url);
        let retries = 0;

        while (retries <= maxRetries) {
            try {
                await new Promise((resolve, reject) => {
                    const startByte = state.downloadedBytes;
                    const headers = {
                        'User-Agent': ua,
                        'Accept': '*/*',
                        'Connection': 'keep-alive'
                    };
                    if (startByte > 0) {
                        headers['Range'] = `bytes=${startByte}-`;
                    }

                    const fileStream = fs.createWriteStream(state.destPath, {
                        flags: startByte > 0 ? 'a' : 'w'
                    });

                    let lastReport = Date.now();
                    let bytesSinceLastReport = 0;

                    axios({
                        method: 'get',
                        url: state.url,
                        responseType: 'stream',
                        headers,
                        timeout: 45000,
                        maxRedirects: 5
                    }).then((response) => {
                        if (response.status !== 200 && response.status !== 206) {
                            fileStream.destroy();
                            return reject(new Error(`Server returned HTTP ${response.status}`));
                        }

                        if (!state.totalBytes) {
                            if (response.headers['content-range']) {
                                const match = response.headers['content-range'].match(/\/(\d+)/);
                                if (match) state.totalBytes = parseInt(match[1], 10);
                            } else if (response.headers['content-length']) {
                                state.totalBytes = startByte + parseInt(response.headers['content-length'], 10);
                            }
                        }

                        const stream = response.data;

                        stream.on('data', (chunk) => {
                            if (state.isCancelled) {
                                stream.destroy();
                                fileStream.destroy();
                                return;
                            }
                            state.downloadedBytes += chunk.length;
                            bytesSinceLastReport += chunk.length;

                            const now = Date.now();
                            const diffSec = (now - lastReport) / 1000;
                            if (diffSec >= 0.2) {
                                state.speedBytesPerSec = Math.round(bytesSinceLastReport / diffSec);
                                lastReport = now;
                                bytesSinceLastReport = 0;
                                if (onProgress) onProgress(this.getProgressStats(state));
                            }
                        });

                        fileStream.on('finish', () => {
                            if (onProgress) onProgress(this.getProgressStats(state));
                            resolve();
                        });

                        fileStream.on('error', (err) => {
                            stream.destroy();
                            reject(err);
                        });

                        stream.on('error', (err) => {
                            fileStream.destroy();
                            reject(err);
                        });

                        stream.pipe(fileStream);

                    }).catch((err) => {
                        fileStream.destroy();
                        reject(err);
                    });
                });

                return;

            } catch (err) {
                if (state.isCancelled) throw err;
                retries++;
                if (retries > maxRetries) {
                    throw new Error(`Download failed: ${err.message}`);
                }
                console.warn(`[Download] Retry ${retries}/${maxRetries} after: ${err.message}`);
                await new Promise(r => setTimeout(r, 1000));
            }
        }
    }

    async downloadMultiChunk(state, onProgress) {
        const totalSize = state.totalBytes;
        const numChunks = Math.min(this.concurrency, Math.ceil(totalSize / this.chunkSize));
        const actualChunkSize = Math.ceil(totalSize / numChunks);
        const tempDir = path.join(path.dirname(state.destPath), `.tmp_${state.id}`);

        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        const chunkPromises = [];
        let lastReport = Date.now();
        let lastDownloaded = 0;

        const updateProgressInterval = setInterval(() => {
            const now = Date.now();
            const diffSec = (now - lastReport) / 1000;
            if (diffSec > 0) {
                const downloadedDelta = state.downloadedBytes - lastDownloaded;
                state.speedBytesPerSec = Math.round(downloadedDelta / diffSec);
                lastReport = now;
                lastDownloaded = state.downloadedBytes;
                if (onProgress) onProgress(this.getProgressStats(state));
            }
        }, 200);

        try {
            for (let i = 0; i < numChunks; i++) {
                const start = i * actualChunkSize;
                const end = i === numChunks - 1 ? totalSize - 1 : (start + actualChunkSize - 1);
                const chunkFile = path.join(tempDir, `chunk_${i}.dat`);

                chunkPromises.push(this.downloadChunkRange(state, start, end, chunkFile));
            }

            await Promise.all(chunkPromises);
            clearInterval(updateProgressInterval);

            // Assemble chunks into final file
            await new Promise((resolve, reject) => {
                const destStream = fs.createWriteStream(state.destPath);
                destStream.on('finish', () => {
                    // Safe cleanup after destStream is fully closed
                    setTimeout(() => {
                        try {
                            if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
                        } catch (e) {}
                    }, 500);
                    resolve();
                });
                destStream.on('error', reject);

                for (let i = 0; i < numChunks; i++) {
                    const chunkFile = path.join(tempDir, `chunk_${i}.dat`);
                    if (fs.existsSync(chunkFile)) {
                        const data = fs.readFileSync(chunkFile);
                        destStream.write(data);
                        try { fs.unlinkSync(chunkFile); } catch (e) {}
                    }
                }
                destStream.end();
            });

            if (onProgress) onProgress(this.getProgressStats(state));

        } catch (err) {
            clearInterval(updateProgressInterval);
            setTimeout(() => {
                try {
                    if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
                } catch (e) {}
            }, 500);
            throw err;
        }
    }

    async downloadChunkRange(state, start, end, chunkPath) {
        return new Promise((resolve, reject) => {
            const parsedUrl = new URL(state.url);
            const protocol = parsedUrl.protocol === 'https:' ? https : http;

            const req = protocol.get(state.url, {
                headers: {
                    'User-Agent': this.getUaForUrl(state.url),
                    'Range': `bytes=${start}-${end}`
                }
            }, (res) => {
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    state.url = res.headers.location;
                    return this.downloadChunkRange(state, start, end, chunkPath).then(resolve).catch(reject);
                }

                const outStream = fs.createWriteStream(chunkPath);
                res.on('data', (chunk) => {
                    if (state.isCancelled) {
                        req.destroy();
                        outStream.destroy();
                        return;
                    }
                    outStream.write(chunk);
                    state.downloadedBytes += chunk.length;
                });

                res.on('end', () => {
                    outStream.end();
                    resolve();
                });

                res.on('error', (err) => {
                    outStream.destroy();
                    reject(err);
                });
            });

            req.on('error', reject);
        });
    }

    getProgressStats(state) {
        const percent = state.totalBytes > 0 ? Math.min(100, (state.downloadedBytes / state.totalBytes) * 100) : 0;
        const remainingBytes = Math.max(0, state.totalBytes - state.downloadedBytes);
        const etaSeconds = state.speedBytesPerSec > 0 ? Math.ceil(remainingBytes / state.speedBytesPerSec) : 0;

        return {
            id: state.id,
            status: state.status,
            totalBytes: state.totalBytes,
            downloadedBytes: state.downloadedBytes,
            percent: parseFloat(percent.toFixed(1)),
            speedBytesPerSec: state.speedBytesPerSec,
            speedFormatted: this.formatSpeed(state.speedBytesPerSec),
            etaSeconds,
            etaFormatted: this.formatEta(etaSeconds)
        };
    }

    cancel(id) {
        const state = this.activeDownloads.get(id);
        if (state) {
            state.isCancelled = true;
            state.status = 'cancelled';
        }
    }

    async downloadParallel(url, destPath, onProgress) {
        const id = `dl_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        return await this.download(id, url, destPath, onProgress);
    }

    formatSpeed(bytesPerSec) {
        if (!bytesPerSec || bytesPerSec <= 0) return '0 KB/s';
        if (bytesPerSec >= 1024 * 1024) {
            return (bytesPerSec / (1024 * 1024)).toFixed(2) + ' MB/s';
        }
        return (bytesPerSec / 1024).toFixed(1) + ' KB/s';
    }

    formatEta(seconds) {
        if (!seconds || seconds <= 0 || !isFinite(seconds)) return '0s';
        if (seconds < 60) return `${seconds}s`;
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}m ${secs}s`;
    }
}

const chunkDownloaderInstance = new ChunkDownloader();
module.exports = chunkDownloaderInstance;
