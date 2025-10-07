import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { URL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

loadEnvFile(path.join(__dirname, '.env'));

const PORT = Number(process.env.PORT || 3000);
const UPSELL_URL_FALLBACK = 'https://enchantedprosperity.com/ultimate-credit-guide';
const CORS_ALLOW_ORIGIN = process.env.CORS_ALLOW_ORIGIN || '*';

const dataDir = path.join(__dirname, 'data');
ensureDirectory(dataDir);

const leadsFile = path.join(dataDir, 'leads.json');
const quizFile = path.join(dataDir, 'quiz_responses.json');

const leadStore = loadJson(leadsFile, { lastId: 0, entries: [] });
const quizStore = loadJson(quizFile, { lastId: 0, entries: [] });

const server = http.createServer(async (req, res) => {
  applySecurityHeaders(res);
  applyCors(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = requestUrl.pathname;

  try {
    if (pathname === '/api/lead' && req.method === 'POST') {
      await handleLead(req, res);
      return;
    }

    if (pathname === '/api/quizResponses' && req.method === 'POST') {
      await handleQuiz(req, res);
      return;
    }

    if (pathname === '/api/config' && req.method === 'GET') {
      sendJson(res, 200, {
        upsellUrl: process.env.UPSELL_URL || UPSELL_URL_FALLBACK,
      });
      return;
    }

    if (req.method === 'GET') {
      serveStaticAsset(pathname, res);
      return;
    }

    sendJson(res, 404, { message: 'Not found' });
  } catch (error) {
    console.error('Request handling failed', error);
    sendJson(res, 500, { message: 'Internal server error' });
  }
});

server.listen(PORT, () => {
  console.log(`Enchanted Prosperity server listening on port ${PORT}`);
});

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf-8');
  content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .forEach((line) => {
      const eqIndex = line.indexOf('=');
      if (eqIndex === -1) return;
      const key = line.slice(0, eqIndex).trim();
      const value = line.slice(eqIndex + 1).trim().replace(/^"|"$/g, '');
      if (!(key in process.env)) {
        process.env[key] = value;
      }
    });
}

function ensureDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function loadJson(filePath, fallback) {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (error) {
    return JSON.parse(JSON.stringify(fallback));
  }
}

function saveJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function applyCors(res) {
  res.setHeader('Access-Control-Allow-Origin', CORS_ALLOW_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function applySecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self';"
  );
}

async function handleLead(req, res) {
  const payload = await readJsonBody(req);
  const { name, email, utm_source, utm_medium, utm_campaign, utm_content } = payload;

  if (!name || !email) {
    sendJson(res, 400, { message: 'Name and email are required.' });
    return;
  }

  const lead = createLead({ name, email, utm_source, utm_medium, utm_campaign, utm_content });

  const sheetRow = [
    new Date(lead.created_at).toISOString(),
    lead.name,
    lead.email,
    lead.utm_source || '',
    lead.utm_medium || '',
    lead.utm_campaign || '',
    lead.utm_content || '',
  ];

  forwardLeadIntegrations(lead, sheetRow).catch((error) => {
    console.error('Lead forwarding failed', error.message || error);
  });

  sendJson(res, 200, { leadId: lead.id });
}

async function handleQuiz(req, res) {
  const payload = await readJsonBody(req);
  const { leadId, responses } = payload;

  if (!leadId || !Array.isArray(responses)) {
    sendJson(res, 400, { message: 'Lead ID and responses array are required.' });
    return;
  }

  const lead = findLeadById(Number(leadId));
  if (!lead) {
    sendJson(res, 404, { message: 'Lead not found.' });
    return;
  }

  createQuizResponse({ lead_id: lead.id, responses });

  const quizSummary = responses
    .map((entry, index) => `<p><strong>Q${index + 1}:</strong> ${entry.question}<br/><em>${entry.answer}</em></p>`)
    .join('');

  const emailHtml = `
      <div style="font-family: Arial, sans-serif; color: #0b1b42;">
        <h2 style="color:#1e3a8a;">Your Credit Insights Are In!</h2>
        <p>Hi ${lead.name.split(' ')[0]},</p>
        <p>Thanks for taking the 60-second credit quiz. Here’s a snapshot of what you shared:</p>
        ${quizSummary}
        <p>Keep an eye on your inbox — we’re preparing personalized tips based on your answers.</p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
        <h3 style="color:#b8860b;">Next Step: Unlock the Ultimate Credit Guide</h3>
        <p>Inside you’ll find the exact steps to remove negative items legally, apply the Credit Reset Method™, and rebuild the score you deserve.</p>
        <p><a href="${process.env.UPSELL_URL || UPSELL_URL_FALLBACK}" style="display:inline-block;padding:12px 20px;background:#b8860b;color:#fff;text-decoration:none;border-radius:6px;">Get The Guide Now →</a></p>
      </div>
    `;

  forwardQuizIntegrations(lead, responses, quizSummary).catch((error) => {
    console.error('Quiz forwarding failed', error.message || error);
  });

  triggerEmailWorkflow(lead, emailHtml).catch((error) => {
    console.error('Email workflow failed', error.message || error);
  });

  sendJson(res, 200, { message: 'Responses saved.' });
}

function createLead(record) {
  const id = ++leadStore.lastId;
  const entry = { id, created_at: new Date().toISOString(), ...record };
  leadStore.entries.push(entry);
  saveJson(leadsFile, leadStore);
  return entry;
}

function findLeadById(id) {
  return leadStore.entries.find((entry) => entry.id === id) || null;
}

function createQuizResponse(record) {
  const id = ++quizStore.lastId;
  const entry = { id, created_at: new Date().toISOString(), ...record };
  quizStore.entries.push(entry);
  saveJson(quizFile, quizStore);
  return entry;
}

async function forwardLeadIntegrations(lead, sheetRow) {
  const tasks = [];
  if (process.env.LEAD_WEBHOOK_URL) {
    tasks.push(sendWebhook(process.env.LEAD_WEBHOOK_URL, { lead }));
  }
  if (process.env.GOOGLE_SHEETS_WEBHOOK_URL) {
    tasks.push(
      sendWebhook(process.env.GOOGLE_SHEETS_WEBHOOK_URL, {
        type: 'lead',
        row: sheetRow,
        lead,
      })
    );
  }
  await Promise.allSettled(tasks);
}

async function forwardQuizIntegrations(lead, responses, quizSummary) {
  const tasks = [];
  if (process.env.QUIZ_WEBHOOK_URL) {
    tasks.push(sendWebhook(process.env.QUIZ_WEBHOOK_URL, { lead, responses }));
  }
  if (process.env.GOOGLE_SHEETS_WEBHOOK_URL) {
    tasks.push(
      sendWebhook(process.env.GOOGLE_SHEETS_WEBHOOK_URL, {
        type: 'quiz',
        lead,
        responses,
        summaryHtml: quizSummary,
      })
    );
  }
  await Promise.allSettled(tasks);
}

async function triggerEmailWorkflow(lead, emailHtml) {
  if (!process.env.EMAIL_WEBHOOK_URL) {
    return;
  }
  await sendWebhook(process.env.EMAIL_WEBHOOK_URL, {
    to: lead.email,
    name: lead.name,
    subject: 'Your Credit Quiz Results Are On The Way',
    html: emailHtml,
  });
}

async function sendWebhook(url, payload) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`status ${response.status} - ${text}`.trim());
    }
  } catch (error) {
    console.error('Webhook dispatch failed', error.message || error);
  }
}

async function readJsonBody(req) {
  const body = await readRequestBody(req);
  if (!body) return {};
  try {
    return JSON.parse(body);
  } catch (error) {
    throw new Error('Invalid JSON payload');
  }
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    const limit = 1 * 1024 * 1024; // 1 MB

    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > limit) {
        reject(new Error('Payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      resolve(Buffer.concat(chunks).toString('utf-8'));
    });

    req.on('error', (error) => reject(error));
  });
}

function sendJson(res, statusCode, payload) {
  const data = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(data),
  });
  res.end(data);
}

function serveStaticAsset(urlPath, res) {
  const publicDir = path.join(__dirname, 'public');
  let filePath = path.join(publicDir, decodeURIComponent(urlPath));

  if (!filePath.startsWith(publicDir)) {
    sendJson(res, 403, { message: 'Forbidden' });
    return;
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  if (!fs.existsSync(filePath)) {
    filePath = path.join(publicDir, 'index.html');
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = getContentType(ext);

  const stream = fs.createReadStream(filePath);
  stream.on('open', () => {
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
    });
  });
  stream.on('error', () => {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Internal server error');
  });
  stream.pipe(res);
}

function getContentType(ext) {
  switch (ext) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.js':
      return 'application/javascript; charset=utf-8';
    case '.json':
      return 'application/json; charset=utf-8';
    case '.svg':
      return 'image/svg+xml';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.woff2':
      return 'font/woff2';
    default:
      return 'application/octet-stream';
  }
}
