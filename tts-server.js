const { spawn } = require('child_process');
const http = require('http');

const PORT = 3090;

// Pre-warm: verify edge-tts is available
function checkEdgeTTS() {
  return new Promise((resolve) => {
    const proc = spawn('python3', ['-m', 'edge_tts', '--list-voices']);
    let output = '';
    proc.stdout.on('data', d => output += d);
    proc.on('close', (code) => resolve(code === 0));
    proc.on('error', () => resolve(false));
    setTimeout(() => resolve(false), 5000);
  });
}

async function synthesize(text, voice = 'zh-CN-XiaoxiaoNeural') {
  return new Promise((resolve, reject) => {
    const proc = spawn('python3', [
      '-m', 'edge_tts',
      '--text', text,
      '--voice', voice,
      '--write-media', '/dev/stdout'
    ]);

    const chunks = [];
    proc.stdout.on('data', d => chunks.push(d));
    proc.stderr.on('data', d => {}); // ignore
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) {
        resolve(Buffer.concat(chunks));
      } else {
        reject(new Error(`edge-tts exited with code ${code}`));
      }
    });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  
  if (req.method === 'GET' && url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', voices: [
      'zh-CN-XiaoxiaoNeural', 'zh-CN-XiaoyiNeural',
      'zh-CN-YunjianNeural', 'zh-CN-YunxiNeural',
      'zh-CN-YunxiaNeural', 'zh-CN-YunyangNeural'
    ]}));
    return;
  }
  
  if (req.method === 'POST' && url.pathname === '/tts') {
    let body = '';
    req.on('data', d => body += d);
    req.on('end', async () => {
      try {
        const { text, voice } = JSON.parse(body);
        if (!text) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing text' }));
          return;
        }
        const audio = await synthesize(text, voice || 'zh-CN-XiaoxiaoNeural');
        res.writeHead(200, {
          'Content-Type': 'audio/mpeg',
          'Content-Length': audio.length
        });
        res.end(audio);
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }
  
  res.writeHead(404);
  res.end('Not found');
});

let ready = false;
checkEdgeTTS().then(ok => {
  ready = ok;
  server.listen(PORT, () => {
    console.log(`Edge TTS server running on http://localhost:${PORT}`);
    console.log(`  edge-tts available: ${ok}`);
    console.log(`  GET  /health`);
    console.log(`  POST /tts  { "text": "...", "voice": "zh-CN-XiaoxiaoNeural" }`);
  });
});
