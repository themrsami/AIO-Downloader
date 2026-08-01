const axios = require('axios');

class YouTubeScraper {
    constructor() {
        this.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*'
        };
        this.visitorData = null;
    }

    extractVideoId(urlStr) {
        if (!urlStr || typeof urlStr !== 'string') return null;
        const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/;
        const match = urlStr.match(regex);
        return match ? match[1] : null;
    }

    async getVisitorData() {
        if (this.visitorData) return this.visitorData;
        try {
            const res = await axios.post('https://www.youtube.com/youtubei/v1/visitor_id', {
                context: {
                    client: {
                        clientName: 'ANDROID_VR',
                        clientVersion: '1.50.31'
                    }
                }
            }, {
                headers: { 'Content-Type': 'application/json' },
                timeout: 6000
            });
            if (res.data && res.data.responseContext && res.data.responseContext.visitorData) {
                this.visitorData = res.data.responseContext.visitorData;
            }
        } catch (e) {
            console.log('Visitor Data fetch warning:', e.message);
        }
        return this.visitorData;
    }

    async extract(urlStr) {
        const videoId = this.extractVideoId(urlStr);
        if (!videoId) {
            throw new Error('Invalid YouTube URL. Please enter a valid YouTube video or Shorts link.');
        }

        const visitorData = await this.getVisitorData();
        let title = `YouTube Video (${videoId})`;
        let author = 'YouTube Creator';

        // Fetch OEmbed metadata for clean title and author
        try {
            const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
            const oembedRes = await axios.get(oembedUrl, { headers: this.headers, timeout: 6000 });
            if (oembedRes.data) {
                title = oembedRes.data.title || title;
                author = oembedRes.data.author_name || author;
            }
        } catch(e) {}

        const thumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

        // Direct InnerTube Stream Extractor with Visitor Session Authorization
        const playerUrl = 'https://www.youtube.com/youtubei/v1/player';
        const payload = {
            context: {
                client: {
                    clientName: 'ANDROID_VR',
                    clientVersion: '1.50.31',
                    androidSdkVersion: 32,
                    visitorData: visitorData,
                    hl: 'en',
                    gl: 'US'
                }
            },
            videoId: videoId
        };

        const res = await axios.post(playerUrl, payload, {
            headers: {
                'User-Agent': 'Dalvik/2.1.0 (Linux; U; Android 12; Quest 2 Build/SQ3A.220605.009.A1)',
                'Content-Type': 'application/json',
                'X-Goog-Visitor-Id': visitorData || ''
            },
            timeout: 10000
        });

        if (res.data && res.data.streamingData) {
            const formats = res.data.streamingData.formats || [];
            const adaptiveFormats = res.data.streamingData.adaptiveFormats || [];
            const allFormats = [...formats, ...adaptiveFormats];

            const qualities = [];
            const addedLabels = new Set();

            allFormats.forEach(f => {
                if (f.url) {
                    const isAudio = f.mimeType && f.mimeType.includes('audio');
                    let label = f.qualityLabel || f.quality || (isAudio ? 'Audio Stream' : '720p HD');

                    if (isAudio) {
                        label = 'MP3 Audio Stream (Original Track)';
                    } else {
                        label = `${label} (MP4)`;
                    }

                    if (!addedLabels.has(label)) {
                        addedLabels.add(label);
                        qualities.push({
                            quality: label,
                            format: isAudio ? 'mp3' : 'mp4',
                            type: isAudio ? 'audio' : 'video',
                            url: f.url,
                            label: label
                        });
                    }
                }
            });

            if (qualities.length > 0) {
                qualities.sort((a, b) => {
                    const resA = parseInt((a.quality.match(/\d+/) || [0])[0], 10);
                    const resB = parseInt((b.quality.match(/\d+/) || [0])[0], 10);
                    return resB - resA;
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
        }

        throw new Error('Unable to extract video streams from YouTube URL. Please verify the video is public.');
    }
}

module.exports = new YouTubeScraper();
