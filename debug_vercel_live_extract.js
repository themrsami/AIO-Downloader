const axios = require('axios');

async function debugVercelExtract() {
    const liveUrl = 'https://aio-downloader-sigma.vercel.app/api/extract';
    const testUrls = [
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        'https://www.youtube.com/shorts/sMZesCP09IU'
    ];

    for (const u of testUrls) {
        console.log(`\nTesting Vercel Live API for: ${u}`);
        try {
            const res = await axios.post(liveUrl, { url: u }, {
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
                },
                timeout: 12000
            });

            console.log('Status Code:', res.status);
            console.log('Response Body:', res.data);
        } catch(e) {
            if (e.response) {
                console.log('Error Status:', e.response.status);
                console.log('Error Response Data:', JSON.stringify(e.response.data));
            } else {
                console.log('Error Message:', e.message);
            }
        }
    }
}

debugVercelExtract();
