const axios = require('axios');

class YouTubeScraper {
    constructor() {
        this.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*'
        };
        this.visionOsUA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15';
        this.androidUA = 'com.google.android.youtube/21.26.364 (Linux; U; Android 11) gzip';
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
     * Obtains a fresh Visitor Data authorization token from YouTube
     */
    async getFreshVisitorData() {
        try {
            const res = await axios.post('https://www.youtube.com/youtubei/v1/visitor_id', {
                context: {
                    client: {
                        clientName: 'ANDROID_VR',
                        clientVersion: '1.65.10'
                    }
                }
            }, {
                headers: { 'Content-Type': 'application/json' },
                timeout: 6000
            });
            if (res.data && res.data.responseContext && res.data.responseContext.visitorData) {
                return res.data.responseContext.visitorData;
            }
        } catch (e) {
            console.log('Visitor Data fetch warning:', e.message);
        }
        return null;
    }

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
     * Primary fast extractor combining VisionOS and Android clients
     */
    async extract(urlStr) {
        const videoId = this.extractVideoId(urlStr);
        if (!videoId) {
            throw new Error('Invalid YouTube URL. Please enter a valid YouTube video, Shorts, or Live link.');
        }

        const visitorData = await this.getFreshVisitorData();
        let title = `YouTube Video (${videoId})`;
        let author = 'YouTube Creator';
        let thumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

        // 1. Fetch OEmbed metadata for clean title and author
        try {
            const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
            const oembedRes = await axios.get(oembedUrl, { headers: this.headers, timeout: 5000 });
            if (oembedRes.data) {
                title = oembedRes.data.title || title;
                author = oembedRes.data.author_name || author;
                if (oembedRes.data.thumbnail_url) {
                    thumbnail = oembedRes.data.thumbnail_url;
                }
            }
        } catch (e) {}

        const playerUrl = 'https://www.youtube.com/youtubei/v1/player';

        // 2. Query VISIONOS client (delivers 100% direct streaming URLs without bot challenges or cipher)
        const visionPayload = {
            context: {
                client: {
                    clientName: 'VISIONOS',
                    clientVersion: '1.02',
                    deviceMake: 'Apple',
                    deviceModel: 'RealityDevice17,1',
                    osName: 'visionOS',
                    osVersion: '26.5.23O471',
                    hl: 'en',
                    gl: 'US',
                    visitorData: visitorData
                }
            },
            videoId: videoId
        };

        // 3. Query ANDROID client in parallel (provides pre-merged progressive video+audio formats)
        const androidPayload = {
            context: {
                client: {
                    clientName: 'ANDROID',
                    clientVersion: '21.26.364',
                    androidSdkVersion: 30,
                    osName: 'Android',
                    osVersion: '11',
                    hl: 'en',
                    gl: 'US',
                    visitorData: visitorData
                }
            },
            videoId: videoId
        };

        const [visionResult, androidResult] = await Promise.allSettled([
            axios.post(playerUrl, visionPayload, {
                headers: {
                    'User-Agent': this.visionOsUA,
                    'Content-Type': 'application/json',
                    'X-Goog-Visitor-Id': visitorData || '',
                    'X-YouTube-Client-Name': '101',
                    'X-YouTube-Client-Version': '1.02'
                },
                timeout: 8000
            }),
            axios.post(playerUrl, androidPayload, {
                headers: {
                    'User-Agent': this.androidUA,
                    'Content-Type': 'application/json',
                    'X-Goog-Visitor-Id': visitorData || '',
                    'X-YouTube-Client-Name': '3',
                    'X-YouTube-Client-Version': '21.26.364'
                },
                timeout: 8000
            })
        ]);

        const rawFormats = [];

        // Check metadata from player responses if available
        if (visionResult.status === 'fulfilled' && visionResult.value.data) {
            const vData = visionResult.value.data;
            if (vData.videoDetails) {
                title = vData.videoDetails.title || title;
                author = vData.videoDetails.author || author;
                if (vData.videoDetails.thumbnail && vData.videoDetails.thumbnail.thumbnails?.length) {
                    const thumbs = vData.videoDetails.thumbnail.thumbnails;
                    thumbnail = thumbs[thumbs.length - 1].url || thumbnail;
                }
            }
            if (vData.streamingData) {
                if (vData.streamingData.formats) rawFormats.push(...vData.streamingData.formats);
                if (vData.streamingData.adaptiveFormats) rawFormats.push(...vData.streamingData.adaptiveFormats);
            }
        }

        // Add progressive & adaptive formats and metadata from Android client
        if (androidResult.status === 'fulfilled' && androidResult.value.data) {
            const aData = androidResult.value.data;
            if (aData.videoDetails) {
                title = aData.videoDetails.title || title;
                author = aData.videoDetails.author || author;
                if (aData.videoDetails.thumbnail && aData.videoDetails.thumbnail.thumbnails?.length) {
                    const thumbs = aData.videoDetails.thumbnail.thumbnails;
                    thumbnail = thumbs[thumbs.length - 1].url || thumbnail;
                }
            }
            if (aData.streamingData) {
                if (aData.streamingData.formats) rawFormats.push(...aData.streamingData.formats);
                if (aData.streamingData.adaptiveFormats) rawFormats.push(...aData.streamingData.adaptiveFormats);
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

        const isLiveBroadcast = (visionResult.status === 'fulfilled' && visionResult.value.data?.videoDetails?.isLiveContent) ||
                               (androidResult.status === 'fulfilled' && androidResult.value.data?.videoDetails?.isLiveContent);
        if (isLiveBroadcast) {
            throw new Error('This YouTube URL is an active ongoing live stream. Direct video downloading is available once the broadcast finishes and is processed as a standard video.');
        }

        const diag = {
            visionStatus: visionResult.status === 'fulfilled' ? (visionResult.value.data?.playabilityStatus?.status || 'no_data') : (visionResult.reason?.message || 'err'),
            androidStatus: androidResult.status === 'fulfilled' ? (androidResult.value.data?.playabilityStatus?.status || 'no_data') : (androidResult.reason?.message || 'err'),
            androidFormats: androidResult.status === 'fulfilled' ? (androidResult.value.data?.streamingData?.formats?.length || 0) : -1,
            androidAdaptive: androidResult.status === 'fulfilled' ? (androidResult.value.data?.streamingData?.adaptiveFormats?.length || 0) : -1,
            visitor: Boolean(visitorData)
        };

        throw new Error(`Unable to extract video streams from YouTube URL. [Diagnostics: ${JSON.stringify(diag)}]`);
    }
}

module.exports = new YouTubeScraper();
