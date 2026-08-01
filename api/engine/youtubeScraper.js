const axios = require('axios');

class ServerlessYoutubeScraper {
    constructor() {
        this.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*'
        };
    }

    extractVideoId(urlStr) {
        if (!urlStr || typeof urlStr !== 'string') return null;
        const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/;
        const match = urlStr.match(regex);
        return match ? match[1] : null;
    }

    async extract(urlStr) {
        const videoId = this.extractVideoId(urlStr);
        if (!videoId) throw new Error('Invalid YouTube URL.');

        let title = `YouTube Video (${videoId})`;
        let author = 'YouTube Creator';

        try {
            const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
            const oembedRes = await axios.get(oembedUrl, { headers: this.headers, timeout: 6000 });
            if (oembedRes.data) {
                title = oembedRes.data.title || title;
                author = oembedRes.data.author_name || author;
            }
        } catch(e) {}

        const thumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

        // Client Candidates to try in sequence
        const clientConfigs = [
            {
                name: 'ANDROID_VR',
                payload: { clientName: 'ANDROID_VR', clientVersion: '1.50.31', androidSdkVersion: 32 },
                headers: { 'User-Agent': 'Dalvik/2.1.0 (Linux; U; Android 12; Quest 2 Build/SQ3A.220605.009.A1)' }
            },
            {
                name: 'TVHTML5_SIMPLY_EMBEDDED_PLAYER',
                payload: { clientName: 'TVHTML5_SIMPLY_EMBEDDED_PLAYER', clientVersion: '2.0', clientScreen: 'EMBED' },
                headers: { 'User-Agent': 'Mozilla/5.0 (SMART-TV; LINUX; Tizen 6.0) AppleWebKit/537.36' }
            },
            {
                name: 'WEB_EMBEDDED_PLAYER',
                payload: { clientName: 'WEB_EMBEDDED_PLAYER', clientVersion: '5.20240501.00.00' },
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
            },
            {
                name: 'ANDROID_TESTSUITE',
                payload: { clientName: 'ANDROID_TESTSUITE', clientVersion: '1.9', androidSdkVersion: 31 },
                headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 11; Pixel 5)' }
            }
        ];

        for (const c of clientConfigs) {
            try {
                const playerUrl = 'https://www.youtube.com/youtubei/v1/player';
                const res = await axios.post(playerUrl, {
                    context: {
                        client: {
                            ...c.payload,
                            hl: 'en',
                            gl: 'US'
                        },
                        thirdParty: {
                            embedUrl: `https://www.youtube.com/embed/${videoId}`
                        }
                    },
                    videoId: videoId
                }, {
                    headers: {
                        ...c.headers,
                        'Content-Type': 'application/json'
                    },
                    timeout: 8000
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
            } catch(e) {}
        }

        throw new Error('Unable to extract video streams from YouTube URL. Please verify the video is public.');
    }
}

module.exports = new ServerlessYoutubeScraper();
