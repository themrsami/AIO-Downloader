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

        // 4. Organize, deduplicate, and annotate stream formats
        const qualities = [];
        const seenKeys = new Set();

        for (const f of rawFormats) {
            if (!f.url) continue;

            const isAudio = f.mimeType && f.mimeType.includes('audio');
            const hasBoth = Boolean(f.hasAudio && f.hasVideo) || (f.mimeType && f.mimeType.includes('avc1') && f.mimeType.includes('mp4a'));
            const isWebm = f.mimeType && f.mimeType.includes('webm');
            const sizeStr = this.formatBytes(f.contentLength);

            let resNum = 0;
            if (!isAudio) {
                const match = (f.qualityLabel || '').match(/(\d+)p/);
                if (match) resNum = parseInt(match[1], 10);
            }

            let qualityTitle = '';
            let labelSubtitle = '';
            let formatExt = 'mp4';
            let streamType = 'video';

            if (isAudio) {
                streamType = 'audio';
                formatExt = isWebm ? 'webm' : 'm4a';
                const bitrateKbps = f.bitrate ? Math.round(f.bitrate / 1000) : 128;
                qualityTitle = isWebm ? `Opus Audio Track (${bitrateKbps} kbps)` : `Original Audio Track (${bitrateKbps} kbps)`;
                labelSubtitle = `Audio Only • ${formatExt.toUpperCase()}${sizeStr ? ` • ${sizeStr}` : ''}`;
            } else if (hasBoth) {
                qualityTitle = `${resNum || 360}p Standard (Video + Audio)`;
                formatExt = 'mp4';
                labelSubtitle = `Video + Audio (Progressive MP4)${sizeStr ? ` • ${sizeStr}` : ''}`;
            } else {
                // Adaptive Video Only
                formatExt = isWebm ? 'webm' : 'mp4';
                let resName = `${resNum}p`;
                if (resNum >= 2160) resName = '2160p 4K UHD';
                else if (resNum >= 1440) resName = '1440p 2K QHD';
                else if (resNum >= 1080) resName = '1080p Full HD';
                else if (resNum >= 720) resName = '720p HD';

                qualityTitle = `${resName} (${formatExt.toUpperCase()})`;
                labelSubtitle = `Video Only (No Sound - Fast DASH)${sizeStr ? ` • ${sizeStr}` : ''}`;
            }

            const uniqueKey = `${streamType}_${resNum}_${formatExt}_${hasBoth ? 'both' : 'single'}`;
            if (!seenKeys.has(uniqueKey)) {
                seenKeys.add(uniqueKey);
                qualities.push({
                    quality: qualityTitle,
                    format: formatExt,
                    type: streamType,
                    hasAudio: hasBoth || isAudio,
                    hasVideo: !isAudio,
                    isVideoOnly: !isAudio && !hasBoth,
                    resolution: resNum,
                    sizeBytes: f.contentLength ? parseInt(f.contentLength, 10) : null,
                    sizeFormatted: sizeStr,
                    url: f.url,
                    label: labelSubtitle,
                    itag: f.itag
                });
            }
        }

        if (qualities.length > 0) {
            // Sort: High resolution video first (descending), then progressive/lower video, then audio tracks
            qualities.sort((a, b) => {
                if (a.type === 'video' && b.type === 'video') {
                    // Prefer higher resolution
                    if (b.resolution !== a.resolution) {
                        return b.resolution - a.resolution;
                    }
                    // Prefer MP4 over WebM for identical resolution
                    if (a.format === 'mp4' && b.format !== 'mp4') return -1;
                    if (b.format === 'mp4' && a.format !== 'mp4') return 1;
                    // Prefer video+audio if same resolution
                    if (a.hasAudio && !b.hasAudio) return -1;
                    if (b.hasAudio && !a.hasAudio) return 1;
                    return 0;
                }
                if (a.type === 'video' && b.type === 'audio') return -1;
                if (a.type === 'audio' && b.type === 'video') return 1;
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

        throw new Error('Unable to extract video streams from YouTube URL. Please verify the video is public.');
    }
}

module.exports = new YouTubeScraper();
