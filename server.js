require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const FRONTEND_URL = process.env.FRONTEND_URL;

const memoryStore = new Map();
const rateStore = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 30;

const REQUEST_TIMEOUT_MS = 45000;

function fetchWithTimeout(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timeout));
}

const allowedOrigins = FRONTEND_URL
  ? [FRONTEND_URL]
  : ['http://localhost:3000', 'http://127.0.0.1:3000'];

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'x-session-id']
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.static('public'));

function safeError(message = 'Internal server error', status = 500) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function basicRateLimit(req, res, next) {
  const key = req.ip || 'unknown';
  const now = Date.now();
  const bucket = rateStore.get(key) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };

  if (now > bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = now + RATE_LIMIT_WINDOW_MS;
  }

  bucket.count += 1;
  rateStore.set(key, bucket);

  if (bucket.count > RATE_LIMIT_MAX) {
    return res.status(429).json({ error: 'Too many requests. Please try again shortly.' });
  }

  return next();
}

function getModelByMode(mode) {
  const map = {
    fast: 'llama-3.1-8b-instant',
    balanced: 'llama-3.3-70b-versatile',
    deep: 'deepseek-r1-distill-llama-70b'
  };
  return map[mode] || map.balanced;
}

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), groqConfigured: Boolean(GROQ_API_KEY) });
});

app.post('/api/reset', basicRateLimit, (req, res) => {
  const sessionId = req.get('x-session-id');
  if (!sessionId) return res.status(400).json({ error: 'Missing session id' });
  memoryStore.delete(sessionId);
  return res.json({ ok: true });
});

app.post('/api/chat', basicRateLimit, async (req, res, next) => {
  try {
    if (!GROQ_API_KEY) throw safeError('AI service is not configured', 503);

    const sessionId = req.get('x-session-id');
    const { message, mode = 'balanced' } = req.body || {};

    if (!sessionId) return res.status(400).json({ error: 'Missing session id' });
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required' });
    }

    const model = getModelByMode(mode);
    const history = memoryStore.get(sessionId) || [];
    const messages = [
      { role: 'system', content: 'You are MindForge, a concise and helpful AI assistant.' },
      ...history,
      { role: 'user', content: message.trim() }
    ];

    const response = await fetchWithTimeout('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ model, messages, temperature: 0.7 })
    });

    if (!response.ok) {
      throw safeError('Upstream AI service error', 502);
    }

    const data = await response.json();
    const answer = data?.choices?.[0]?.message?.content || 'No response generated.';

    const updated = [...history, { role: 'user', content: message.trim() }, { role: 'assistant', content: answer }].slice(-10);
    memoryStore.set(sessionId, updated);

    return res.json({ reply: answer, mode, model });
  } catch (error) {
    if (error.name === 'AbortError') {
      return next(safeError('AI response timed out', 504));
    }
    return next(error);
  }
});

app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  const message = status >= 500 ? 'Internal server error' : err.message;
  res.status(status).json({ error: message });
});

app.listen(PORT, () => {
  console.log(`MindForge listening on port ${PORT}`);
});
