const fs = require('fs');
const path = require('path');
const { spawn, execSync, exec } = require('child_process');
const axios = require('axios');

class FFmpegManager {
    constructor() {
        this.localBinDir = path.resolve(__dirname, '../../bin');
        this.localFfmpegPath = path.join(this.localBinDir, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
        this.cachedStatus = null;
        this.isInstalling = false;
    }

    /**
     * Detects if FFmpeg is available locally or in system PATH
     */
    async detect(forceRefresh = false) {
        if (!forceRefresh && this.cachedStatus && this.cachedStatus.available) {
            return this.cachedStatus;
        }

        // 1. Check local bin directory inside the application
        if (fs.existsSync(this.localFfmpegPath)) {
            try {
                const versionOutput = execSync(`"${this.localFfmpegPath}" -version`, { encoding: 'utf8', timeout: 3000 });
                const firstLine = versionOutput.split('\n')[0] || '';
                const match = firstLine.match(/ffmpeg\s+version\s+([^\s]+)/i);
                this.cachedStatus = {
                    available: true,
                    isLocal: true,
                    path: this.localFfmpegPath,
                    version: match ? match[1] : 'Installed'
                };
                return this.cachedStatus;
            } catch (e) {}
        }

        // 2. Check system PATH
        try {
            const versionOutput = execSync('ffmpeg -version', { encoding: 'utf8', timeout: 3000 });
            const firstLine = versionOutput.split('\n')[0] || '';
            const match = firstLine.match(/ffmpeg\s+version\s+([^\s]+)/i);
            
            // Find system path
            let sysPath = 'ffmpeg';
            try {
                if (process.platform === 'win32') {
                    const whereOut = execSync('where ffmpeg', { encoding: 'utf8', timeout: 2000 }).trim();
                    sysPath = whereOut.split('\n')[0].trim() || 'ffmpeg';
                }
            } catch (err) {}

            this.cachedStatus = {
                available: true,
                isLocal: false,
                path: sysPath,
                version: match ? match[1] : 'System PATH'
            };
            return this.cachedStatus;
        } catch (e) {}

        this.cachedStatus = {
            available: false,
            isLocal: false,
            path: null,
            version: null
        };
        return this.cachedStatus;
    }

    /**
     * Automatically downloads and extracts static FFmpeg in one click
     */
    async install(onProgress) {
        if (this.isInstalling) {
            throw new Error('FFmpeg installation is already in progress.');
        }

        this.isInstalling = true;

        try {
            if (!fs.existsSync(this.localBinDir)) {
                fs.mkdirSync(this.localBinDir, { recursive: true });
            }

            const downloadUrl = 'https://github.com/ffbinaries/ffbinaries-prebuilt/releases/download/v6.1/ffmpeg-6.1-win-64.zip';
            const zipPath = path.join(this.localBinDir, 'ffmpeg_temp.zip');

            if (onProgress) onProgress({ percent: 5, status: 'Connecting to download server...' });

            // 1. Download zip archive
            const response = await axios({
                method: 'get',
                url: downloadUrl,
                responseType: 'stream',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
                },
                timeout: 60000
            });

            const totalBytes = parseInt(response.headers['content-length'] || 0, 10);
            let downloadedBytes = 0;

            const writer = fs.createWriteStream(zipPath);

            await new Promise((resolve, reject) => {
                response.data.on('data', (chunk) => {
                    downloadedBytes += chunk.length;
                    if (totalBytes > 0 && onProgress) {
                        const percent = Math.min(90, Math.round((downloadedBytes / totalBytes) * 85) + 5);
                        const downloadedMB = (downloadedBytes / (1024 * 1024)).toFixed(1);
                        const totalMB = (totalBytes / (1024 * 1024)).toFixed(1);
                        onProgress({
                            percent,
                            status: `Downloading FFmpeg (${downloadedMB} / ${totalMB} MB)...`,
                            downloadedBytes,
                            totalBytes
                        });
                    }
                });

                response.data.pipe(writer);
                writer.on('finish', resolve);
                writer.on('error', reject);
                response.data.on('error', reject);
            });

            // 2. Extract zip archive using PowerShell Expand-Archive
            if (onProgress) onProgress({ percent: 92, status: 'Extracting FFmpeg binary...' });

            const expandCmd = `powershell.exe -NoProfile -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${this.localBinDir}' -Force"`;
            await new Promise((resolve, reject) => {
                exec(expandCmd, (err, stdout, stderr) => {
                    if (err) return reject(new Error(`Extraction failed: ${stderr || err.message}`));
                    resolve();
                });
            });

            // Clean up zip
            try {
                if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
            } catch (e) {}

            // 3. Verify installation
            if (onProgress) onProgress({ percent: 98, status: 'Verifying installation...' });

            const status = await this.detect(true);
            if (!status.available) {
                throw new Error('FFmpeg was downloaded but failed verification check.');
            }

            if (onProgress) onProgress({ percent: 100, status: 'FFmpeg Ready!' });
            return status;

        } finally {
            this.isInstalling = false;
        }
    }

    /**
     * High-speed stream-copy audio/video muxing
     * Takes ~1-2 seconds with zero re-encoding.
     */
    async muxVideoAndAudio(videoPath, audioPath, outputPath, onProgress) {
        const status = await this.detect();
        if (!status.available) {
            throw new Error('FFmpeg is not installed. Please install FFmpeg to mux video and audio.');
        }

        const ffmpegBin = status.path;

        return new Promise((resolve, reject) => {
            const args = [
                '-y',
                '-i', videoPath,
                '-i', audioPath,
                '-c:v', 'copy',
                '-c:a', 'aac',
                '-map', '0:v:0',
                '-map', '1:a:0',
                '-shortest',
                outputPath
            ];

            const proc = spawn(ffmpegBin, args);
            let stderrOutput = '';

            proc.stderr.on('data', (data) => {
                const str = data.toString();
                stderrOutput += str;
                if (onProgress) {
                    onProgress({ status: 'Muxing audio & video streams...' });
                }
            });

            proc.on('close', (code) => {
                if (code === 0 && fs.existsSync(outputPath)) {
                    // Clean up temporary video and audio parts
                    try {
                        if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
                        if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
                    } catch (e) {}
                    resolve(outputPath);
                } else {
                    reject(new Error(`FFmpeg muxing failed with code ${code}: ${stderrOutput.slice(-300)}`));
                }
            });

            proc.on('error', (err) => {
                reject(new Error(`Failed to start FFmpeg: ${err.message}`));
            });
        });
    }
}

module.exports = new FFmpegManager();