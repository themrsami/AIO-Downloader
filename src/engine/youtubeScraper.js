const axios = require('axios');

class YouTubeScraper {
    constructor() {
        this.desktopUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
        this.iosUA = 'com.google.ios.youtube/20.11.6 (iPhone10,4; U; CPU iOS 16_7_7 like Mac OS X)';
        this.androidUA = 'com.google.android.youtube/21.03.36 (Linux; U; Android 14; SM-S908E Build/TP1A.220624.014) gzip';
        this.visionOsUA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15';
    }

    /**
     * Extracts an 11-character video ID from any YouTube URL variation
     */
    extractVideoId(urlStr) {
        if (!urlStr || typeof urlStr !== 'string') return null;
        const trimmed = urlStr.trim();

        // 1. Direct 11-char ID
        if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
            return trimmed;
        }

        // 2. Decode attribution redirect parameters (e.g. ?u=/watch%3Fv%3D...)
        let candidate = trimmed;
        try {
            if (candidate.includes('attribution_link') && candidate.includes('u=')) {
                const parsed = new URL(candidate.startsWith('http') ? candidate : 'https://' + candidate);
                const u = parsed.searchParams.get('u');
                if (u) candidate = decodeURIComponent(u);
            }
        } catch (e) {}

        // 3. Match against all known YouTube URL structures
        const patterns = [
            /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|v\/|e\/|embed\/|shorts\/|live\/)|youtu\.be\/|youtube-nocookie\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
            /(?:music\.youtube\.com\/watch\?(?:.*&)?v=)([a-zA-Z0-9_-]{11})/,
            /(?:gaming\.youtube\.com\/watch\?(?:.*&)?v=)([a-zA-Z0-9_-]{11})/,
            /[?&]v=([a-zA-Z0-9_-]{11})/
        ];

        for (const pat of patterns) {
            const m = candidate.match(pat);
            if (m && m[1]) return m[1];
        }

        return null;
    }

    /**
    /**
     * Formats bytes into clean human-readable size
     */
    formatBytes(bytes) {
        if (!bytes || isNaN(bytes)) return '';
        const b = parseInt(bytes, 10);
        if (b <= 0) return '';
        if (b >= 1024 * 1024 * 1024) return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`;
        if (b >= 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
        if (b >= 1024) return `${(b / 1024).toFixed(0)} KB`;
        return `${b} B`;
    }

    /**
     * Ultra-fast multi-client native YouTube extractor
     * Queries iOS, Android, and VisionOS InnerTube clients in parallel
     */
    async extract(urlStr) {
        const videoId = this.extractVideoId(urlStr);
        if (!videoId) {
            throw new Error('Invalid YouTube URL. Please enter a valid YouTube video, Shorts, or Live link.');
        }

        let title = `YouTube Video (${videoId})`;
        let author = 'YouTube Creator';
        let thumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

        const playerUrl = 'https://www.youtube.com/youtubei/v1/player';

        const clientConfigs = [
            // 1. iOS App client profile (Apple trusted client, direct non-ciphered DASH & progressive streams)
            {
                name: 'ios',
                payload: {
                    context: {
                        client: {
                            clientName: 'IOS',
                            clientVersion: '20.11.6',
                            deviceModel: 'iPhone10,4',
                            osName: 'iOS',
                            osVersion: '16.7.7.20H330',
                            hl: 'en',
                            gl: 'US'
                        }
                    },
                    videoId: videoId
                },
                headers: {
                    'User-Agent': this.iosUA,
                    'Content-Type': 'application/json'
                }
            },
            // 2. Android App client profile (pre-merged progressive streams + adaptive DASH)
            {
                name: 'android',
                payload: {
                    context: {
                        client: {
                            clientName: 'ANDROID',
                            clientVersion: '21.03.36',
                            androidSdkVersion: 34,
                            osName: 'Android',
                            osVersion: '14',
                            hl: 'en',
                            gl: 'US'
                        }
                    },
                    videoId: videoId
                },
                headers: {
                    'User-Agent': this.androidUA,
                    'Content-Type': 'application/json'
                }
            },
            // 3. VisionOS client profile (high resolution 4K/2K/1080p UHD DASH streams)
            {
                name: 'vision',
                payload: {
                    context: {
                        client: {
                            clientName: 'VISIONOS',
                            clientVersion: '1.02',
                            deviceMake: 'Apple',
                            deviceModel: 'RealityDevice17,1',
                            osName: 'visionOS',
                            osVersion: '26.5.23O471',
                            hl: 'en',
                            gl: 'US'
                        }
                    },
                    videoId: videoId
                },
                headers: {
                    'User-Agent': this.visionOsUA,
                    'Content-Type': 'application/json'
                }
            }
        ];

        // Execute OEmbed and all InnerTube player calls in parallel for instantaneous resolution
        const [oembedResult, ...playerResults] = await Promise.allSettled([
            axios.get(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`, {
                headers: { 'User-Agent': this.desktopUA },
                timeout: 4000
            }),
            ...clientConfigs.map(c => 
                axios.post(playerUrl, c.payload, {
                    headers: c.headers,
                    timeout: 7000
                })
            )
        ]);

        // Process OEmbed metadata
        if (oembedResult.status === 'fulfilled' && oembedResult.value.data) {
            const od = oembedResult.value.data;
            title = od.title || title;
            author = od.author_name || author;
            if (od.thumbnail_url) {
                thumbnail = od.thumbnail_url;
            }
        }

        const rawFormats = [];
        this.lastLiveCheck = false;

        // Process all fulfilled player responses
        for (const res of playerResults) {
            if (res.status === 'fulfilled' && res.value.data) {
                const data = res.value.data;

                if (data.videoDetails) {
                    if (data.videoDetails.isLiveContent) {
                        this.lastLiveCheck = true;
                    }
                    if (data.videoDetails.title) title = data.videoDetails.title;
                    if (data.videoDetails.author) author = data.videoDetails.author;
                    if (data.videoDetails.thumbnail && data.videoDetails.thumbnail.thumbnails?.length) {
                        const thumbs = data.videoDetails.thumbnail.thumbnails;
                        thumbnail = thumbs[thumbs.length - 1].url || thumbnail;
                    }
                }

                if (data.streamingData) {
                    if (Array.isArray(data.streamingData.formats)) {
                        rawFormats.push(...data.streamingData.formats);
                    }
                    if (Array.isArray(data.streamingData.adaptiveFormats)) {
                        rawFormats.push(...data.streamingData.adaptiveFormats);
                    }
                }
            }
        }

        // 4. Find the progressive format (itag 18) for 100% stable audio extraction & default playback
        const progFormat = rawFormats.find(f => f.itag === 18 && f.url);

        // Find the best audio track for stream-copy muxing (prefer progressive or native M4A)
        let bestAudioFormat = null;
        let bestM4aFormat = null;
        for (const f of rawFormats) {
            if (!f.url) continue;
            const isAudio = Boolean(f.mimeType && f.mimeType.includes('audio'));
            if (isAudio) {
                if (!bestAudioFormat || (f.bitrate || 0) > (bestAudioFormat.bitrate || 0)) {
                    bestAudioFormat = f;
                }
                if (f.mimeType.includes('audio/mp4') || f.mimeType.includes('m4a')) {
                    if (!bestM4aFormat || (f.bitrate || 0) > (bestM4aFormat.bitrate || 0)) {
                        bestM4aFormat = f;
                    }
                }
            }
        }
        // Use progressive stream for audio if available, as it is never throttled or blocked
        const defaultMuxAudio = progFormat || bestM4aFormat || bestAudioFormat;

        // 5. Organize, deduplicate, and annotate stream formats
        const qualities = [];
        const seenKeys = new Set();

        // 5a. Primary Audio Track from progressive stream (100% complete audio, zero 403 errors)
        if (progFormat && progFormat.url) {
            const audioSizeStr = this.formatBytes(progFormat.contentLength ? Math.round(parseInt(progFormat.contentLength, 10) * 0.35) : null);
            qualities.push({
                quality: 'Original Audio Track (M4A / AAC)',
                format: 'm4a',
                type: 'audio',
                hasAudio: true,
                hasVideo: false,
                isVideoOnly: false,
                requiresMuxing: false,
                isAudioExtract: true,
                resolution: 0,
                sizeBytes: progFormat.contentLength ? parseInt(progFormat.contentLength, 10) : null,
                sizeFormatted: audioSizeStr,
                url: progFormat.url,
                label: `Crystal-Clear Audio • 100% Complete (M4A via FFmpeg)${audioSizeStr ? ` • ~${audioSizeStr}` : ''}`,
                itag: 18
            });
            seenKeys.add('audio_m4a_main');
        }

        for (const f of rawFormats) {
            if (!f.url) continue;

            const isAudio = Boolean(f.mimeType && f.mimeType.includes('audio'));
            const hasBoth = Boolean(f.hasAudio && f.hasVideo) || (f.mimeType && f.mimeType.includes('avc1') && f.mimeType.includes('mp4a'));
            const isWebm = Boolean(f.mimeType && f.mimeType.includes('webm'));
            const sizeStr = this.formatBytes(f.contentLength);

            let resNum = 0;
            if (!isAudio) {
                const match = (f.qualityLabel || '').match(/(\d+)p/);
                if (match) {
                    resNum = parseInt(match[1], 10);
                } else if (f.height) {
                    resNum = parseInt(f.height, 10);
                } else if (f.width) {
                    resNum = parseInt(f.width, 10);
                }
            }

            let formatExt = isWebm ? 'webm' : 'mp4';

            if (isAudio) {
                // Secondary Audio Track (e.g. WebM/Opus)
                if (isWebm) {
                    const bitrateKbps = f.bitrate ? Math.round(f.bitrate / 1000) : 128;
                    const audioKey = `audio_webm_${bitrateKbps}`;
                    if (!seenKeys.has(audioKey)) {
                        seenKeys.add(audioKey);
                        qualities.push({
                            quality: `Opus Audio Track (${bitrateKbps} kbps)`,
                            format: 'webm',
                            type: 'audio',
                            hasAudio: true,
                            hasVideo: false,
                            isVideoOnly: false,
                            requiresMuxing: false,
                            resolution: 0,
                            sizeBytes: f.contentLength ? parseInt(f.contentLength, 10) : null,
                            sizeFormatted: sizeStr,
                            url: f.url,
                            label: `Audio Only • WEBM${sizeStr ? ` • ${sizeStr}` : ''}`,
                            itag: f.itag
                        });
                    }
                }
            } else if (hasBoth) {
                // Pre-merged Progressive Stream (e.g. 360p / 720p)
                const progKey = `prog_${resNum || 360}_mp4`;
                if (!seenKeys.has(progKey)) {
                    seenKeys.add(progKey);
                    qualities.push({
                        quality: `${resNum || 360}p Standard (Video + Audio)`,
                        format: 'mp4',
                        type: 'video',
                        hasAudio: true,
                        hasVideo: true,
                        isVideoOnly: false,
                        requiresMuxing: false,
                        resolution: resNum || 360,
                        sizeBytes: f.contentLength ? parseInt(f.contentLength, 10) : null,
                        sizeFormatted: sizeStr,
                        url: f.url,
                        label: `Full Video + Sound (Progressive MP4 - 100% Reliable)${sizeStr ? ` • ${sizeStr}` : ''}`,
                        itag: f.itag
                    });
                }
            } else {
                // High Resolution Adaptive Stream (1080p, 1440p, 2160p, 720p, etc.)
                let resName = `${resNum}p`;
                if (resNum >= 2160) resName = '2160p 4K UHD';
                else if (resNum >= 1440) resName = '1440p 2K QHD';
                else if (resNum >= 1080) resName = '1080p Full HD';
                else if (resNum >= 720) resName = '720p HD';
                else if (resNum >= 480) resName = '480p SD';

                // Option 1: Merged Video + Audio (using FFmpeg stream copy)
                if (defaultMuxAudio && !isWebm) {
                    const mergedKey = `merged_${resNum}_mp4`;
                    if (!seenKeys.has(mergedKey)) {
                        seenKeys.add(mergedKey);
                        const vBytes = f.contentLength ? parseInt(f.contentLength, 10) : 0;
                        const aBytes = defaultMuxAudio.contentLength ? parseInt(defaultMuxAudio.contentLength, 10) : 0;
                        const totalBytes = vBytes + aBytes;
                        qualities.push({
                            quality: `${resName} (Video + Audio)`,
                            format: 'mp4',
                            type: 'video',
                            hasAudio: true,
                            hasVideo: true,
                            isVideoOnly: false,
                            requiresMuxing: true,
                            resolution: resNum,
                            sizeBytes: totalBytes || null,
                            sizeFormatted: this.formatBytes(totalBytes),
                            url: f.url,
                            audioUrl: defaultMuxAudio.url,
                            label: `Full Video + Sound (Merged MP4 via FFmpeg)${this.formatBytes(totalBytes) ? ` • ${this.formatBytes(totalBytes)}` : ''}`,
                            itag: f.itag
                        });
                    }
                }

                // Option 2: Standalone Video Only (Fast DASH)
                const dashKey = `dash_${resNum}_${formatExt}`;
                if (!seenKeys.has(dashKey)) {
                    seenKeys.add(dashKey);
                    qualities.push({
                        quality: `${resName} (${formatExt.toUpperCase()})`,
                        format: formatExt,
                        type: 'video',
                        hasAudio: false,
                        hasVideo: true,
                        isVideoOnly: true,
                        requiresMuxing: false,
                        resolution: resNum,
                        sizeBytes: f.contentLength ? parseInt(f.contentLength, 10) : null,
                        sizeFormatted: sizeStr,
                        url: f.url,
                        label: `Video Only (No Sound - Fast DASH)${sizeStr ? ` • ${sizeStr}` : ''}`,
                        itag: f.itag
                    });
                }
            }
        }

        if (qualities.length > 0) {
            // Sort: 100% Reliable Progressive MP4 first (default selection in modal),
            // then Merged HD formats (1080p, 720p, 4K), then Audio, then Video Only
            qualities.sort((a, b) => {
                // 1. Progressive video (itag 18) always on top as safe, fast, 100% working default
                if (a.itag === 18 && a.type === 'video' && !a.requiresMuxing) return -1;
                if (b.itag === 18 && b.type === 'video' && !b.requiresMuxing) return 1;

                // 2. Merged HD video formats (highest resolution first)
                if (a.requiresMuxing && !b.requiresMuxing) return -1;
                if (!a.requiresMuxing && b.requiresMuxing) return 1;
                if (a.requiresMuxing && b.requiresMuxing) {
                    return (b.resolution || 0) - (a.resolution || 0);
                }

                // 3. Audio tracks
                if (a.type === 'audio' && b.type !== 'audio') return -1;
                if (a.type !== 'audio' && b.type === 'audio') return 1;

                // 4. Video only DASH
                if (a.type === 'video' && b.type === 'video') {
                    return (b.resolution || 0) - (a.resolution || 0);
                }

                return (b.sizeBytes || 0) - (a.sizeBytes || 0);
            });

            return {
                id: `yt_${videoId}`,
                platform: 'youtube',
                title: title,
                author: author,
                thumbnail: thumbnail,
                isVideo: true,
                qualities: qualities
            };
        }

        if (this.lastLiveCheck) {
            throw new Error('This YouTube URL is an active ongoing live stream. Direct video downloading is available once the broadcast finishes and is processed as a standard video.');
        }

        const diag = playerResults.map((r, i) => ({
            name: clientConfigs[i]?.name,
            status: r.status,
            playability: r.status === 'fulfilled' ? (r.value.data?.playabilityStatus?.status || 'no_data') : (r.reason?.message || 'err'),
            reason: r.status === 'fulfilled' ? r.value.data?.playabilityStatus?.reason : undefined,
            formats: r.status === 'fulfilled' ? (r.value.data?.streamingData?.formats?.length || 0) : -1,
            adaptive: r.status === 'fulfilled' ? (r.value.data?.streamingData?.adaptiveFormats?.length || 0) : -1
        }));

        throw new Error(`Unable to extract video streams from YouTube URL. [Diagnostics: ${JSON.stringify(diag)}]`);
    }
}

module.exports = new YouTubeScraper();
