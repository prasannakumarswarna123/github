import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from both .env and .ev files
const envPath = path.join(__dirname, '.env');
const evPath = path.join(__dirname, '.ev');

if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}
if (fs.existsSync(evPath)) {
  const evConfig = dotenv.parse(fs.readFileSync(evPath));
  for (const k in evConfig) {
    if (!process.env[k] || process.env[k].includes('your-project-id') || process.env[k].includes('your_gemini')) {
      process.env[k] = evConfig[k];
    }
  }
}

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-gemini-api-key', 'apikey', 'x-supabase-key']
}));
app.use(express.json({ limit: '10mb' }));

// Serve frontend static files
const frontendPath = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendPath));

// ----------------------------------------------------
// Supabase Client Initialization
// ----------------------------------------------------
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

const isSupabaseConfigured = Boolean(
  SUPABASE_URL &&
  SUPABASE_KEY &&
  !SUPABASE_URL.includes('your-project-id') &&
  !SUPABASE_KEY.includes('your-supabase')
);

let supabase = null;
if (isSupabaseConfigured) {
  try {
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    console.log(`⚡ Supabase client initialized with endpoint: ${SUPABASE_URL}`);
  } catch (err) {
    console.warn(`⚠️ Failed to initialize Supabase client: ${err.message}`);
  }
}

// Helper: Resolve API key from header, body, or env
function getApiKey(req) {
  const headerKey = req.headers['x-gemini-api-key'];
  const bodyKey = req.body?.apiKey;
  const envKey = process.env.GEMINI_API_KEY;
  return headerKey || bodyKey || envKey || '';
}

// Helper: Format history for Google Generative AI
function formatHistory(messages = []) {
  return messages.map(msg => ({
    role: msg.role === 'assistant' || msg.role === 'model' ? 'model' : 'user',
    parts: [{ text: msg.text || msg.content || '' }]
  }));
}

// ----------------------------------------------------
// Configuration & Health check endpoints
// ----------------------------------------------------
app.get('/api/health', (req, res) => {
  const hasEnvKey = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 0);
  res.json({
    status: 'healthy',
    hasApiKey: hasEnvKey,
    hasSupabase: isSupabaseConfigured,
    supabaseUrl: isSupabaseConfigured ? SUPABASE_URL : null,
    defaultModel: process.env.DEFAULT_MODEL || 'gemini-3.8-flash',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

app.get('/api/config', (req, res) => {
  res.json({
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
    isSupabaseConfigured,
    defaultModel: process.env.DEFAULT_MODEL || 'gemini-3.8-flash',
    hasApiKey: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim())
  });
});

// ----------------------------------------------------
// Supported models list
// ----------------------------------------------------
app.get('/api/models', (req, res) => {
  res.json({
    models: [
      { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash', description: 'Next-gen, ultra-fast & intelligent model (Recommended)', recommended: true },
      { id: 'gemini-3.8-pro', name: 'Gemini 3.8 Pro', description: 'Deep reasoning & advanced multimodal understanding' },
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', description: 'Legacy fast model' },
      { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', description: 'Legacy lightweight model' }
    ]
  });
});

// ----------------------------------------------------
// Supabase Endpoints (Sync & Retrieval)
// ----------------------------------------------------
app.get('/api/supabase/status', async (req, res) => {
  if (!isSupabaseConfigured || !supabase) {
    return res.json({
      connected: false,
      message: 'Supabase credentials not configured or placeholder detected in .ev / .env'
    });
  }

  try {
    const { data, error } = await supabase.from('conversations').select('id').limit(1);
    if (error) {
      return res.json({
        connected: false,
        message: `Supabase query check failed: ${error.message}. Have you run the supabase_schema.sql setup script?`
      });
    }
    return res.json({
      connected: true,
      url: SUPABASE_URL,
      message: 'Supabase connection verified successfully.'
    });
  } catch (err) {
    return res.json({
      connected: false,
      message: `Supabase ping error: ${err.message}`
    });
  }
});

// Sync conversation and messages to Supabase
app.post('/api/supabase/sync', async (req, res) => {
  if (!isSupabaseConfigured || !supabase) {
    return res.status(400).json({
      error: 'Supabase not configured',
      message: 'Please set valid SUPABASE_URL and SUPABASE_ANON_KEY in backend/.ev or backend/.env.'
    });
  }

  const { session } = req.body;
  if (!session || !session.id) {
    return res.status(400).json({ error: 'Validation Error', message: 'Session object with ID is required.' });
  }

  try {
    // 1. Upsert Conversation record
    const { error: convError } = await supabase
      .from('conversations')
      .upsert({
        id: session.id,
        title: session.title || 'New Conversation',
        model: session.model || 'gemini-2.5-flash',
        persona: session.persona || 'helpful',
        temperature: session.temperature || 0.7,
        updated_at: new Date().toISOString()
      });

    if (convError) {
      console.error('Error upserting conversation in Supabase:', convError);
      return res.status(500).json({ error: 'Supabase Error', message: convError.message });
    }

    // 2. Sync Messages if present
    if (Array.isArray(session.messages) && session.messages.length > 0) {
      // Delete existing messages for this session to keep in sync cleanly
      await supabase.from('messages').delete().eq('conversation_id', session.id);

      const messageRows = session.messages.map(m => ({
        conversation_id: session.id,
        role: m.role,
        content: m.text || m.content || '',
        created_at: m.timestamp || new Date().toISOString()
      }));

      const { error: msgError } = await supabase.from('messages').insert(messageRows);
      if (msgError) {
        console.error('Error inserting messages in Supabase:', msgError);
        return res.status(500).json({ error: 'Supabase Error', message: msgError.message });
      }
    }

    res.json({
      success: true,
      sessionId: session.id,
      syncedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Sync failure:', error);
    res.status(500).json({ error: 'Server Error', message: error.message });
  }
});

// Fetch all sessions from Supabase
app.get('/api/supabase/sessions', async (req, res) => {
  if (!isSupabaseConfigured || !supabase) {
    return res.status(400).json({
      error: 'Supabase not configured',
      message: 'Please set valid SUPABASE_URL and SUPABASE_ANON_KEY in backend/.ev or backend/.env.'
    });
  }

  try {
    const { data: convs, error: convError } = await supabase
      .from('conversations')
      .select('*')
      .order('updated_at', { ascending: false });

    if (convError) throw convError;

    // Fetch messages for all conversations
    const { data: messages, error: msgError } = await supabase
      .from('messages')
      .select('*')
      .order('created_at', { ascending: true });

    if (msgError) throw msgError;

    // Group messages by conversation_id
    const messageMap = {};
    (messages || []).forEach(m => {
      if (!messageMap[m.conversation_id]) {
        messageMap[m.conversation_id] = [];
      }
      messageMap[m.conversation_id].push({
        role: m.role,
        text: m.content,
        timestamp: m.created_at
      });
    });

    const sessions = (convs || []).map(c => ({
      id: c.id,
      title: c.title,
      model: c.model,
      persona: c.persona,
      temperature: parseFloat(c.temperature) || 0.7,
      createdAt: c.created_at,
      messages: messageMap[c.id] || []
    }));

    res.json({ sessions });
  } catch (error) {
    console.error('Error fetching Supabase sessions:', error);
    res.status(500).json({ error: 'Supabase Error', message: error.message });
  }
});

// Delete a session from Supabase
app.delete('/api/supabase/sessions/:id', async (req, res) => {
  if (!isSupabaseConfigured || !supabase) {
    return res.status(400).json({ error: 'Supabase not configured' });
  }

  const { id } = req.params;
  try {
    const { error } = await supabase.from('conversations').delete().eq('id', id);
    if (error) throw error;
    res.json({ success: true, id });
  } catch (error) {
    console.error('Error deleting Supabase session:', error);
    res.status(500).json({ error: 'Supabase Error', message: error.message });
  }
});

// Helper: Resolve active Gemini model with fallback
function resolveModel(requestedModel) {
  let selected = requestedModel || process.env.DEFAULT_MODEL || 'gemini-3.8-flash';
  if (selected === 'gemini-2.5-flash') {
    selected = 'gemini-3.8-flash';
  } else if (selected === 'gemini-2.5-pro') {
    selected = 'gemini-3.8-pro';
  }
  return selected;
}

// ----------------------------------------------------
// Standard Chat Completion Endpoint (Non-streaming)
// ----------------------------------------------------
app.post('/api/chat', async (req, res) => {
  try {
    const apiKey = getApiKey(req);
    if (!apiKey) {
      return res.status(401).json({
        error: 'API key missing',
        message: 'No Gemini API key provided. Set GEMINI_API_KEY in backend/.ev / .env or configure it in the web interface.'
      });
    }

    const {
      message,
      history = [],
      model,
      systemInstruction,
      temperature = 0.7
    } = req.body;

    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'Validation Error', message: 'Message string is required.' });
    }

    const resolvedModel = resolveModel(model);
    const genAI = new GoogleGenerativeAI(apiKey);
    const modelConfig = {
      model: resolvedModel,
      generationConfig: {
        temperature: Math.min(Math.max(parseFloat(temperature) || 0.7, 0), 2),
      }
    };

    if (systemInstruction && systemInstruction.trim()) {
      modelConfig.systemInstruction = systemInstruction.trim();
    }

    const geminiModel = genAI.getGenerativeModel(modelConfig);
    const formattedHistory = formatHistory(history);

    const chat = geminiModel.startChat({
      history: formattedHistory
    });

    const result = await chat.sendMessage(message);
    const responseText = result.response.text();

    res.json({
      reply: responseText,
      model: resolvedModel,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error in /api/chat:', error);
    res.status(500).json({
      error: 'Gemini API Error',
      message: error.message || 'An error occurred while contacting Gemini LLM.',
      details: error.statusText || null
    });
  }
});

// ----------------------------------------------------
// Streaming Chat Completion Endpoint (Server-Sent Events)
// ----------------------------------------------------
app.post('/api/chat/stream', async (req, res) => {
  const apiKey = getApiKey(req);
  if (!apiKey) {
    return res.status(401).json({
      error: 'API key missing',
      message: 'No Gemini API key provided. Set GEMINI_API_KEY in backend/.ev / .env or configure it in the web interface.'
    });
  }

  const {
    message,
    history = [],
    model,
    systemInstruction,
    temperature = 0.7
  } = req.body;

  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'Validation Error', message: 'Message string is required.' });
  }

  const resolvedModel = resolveModel(model);

  // Set SSE response headers
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const modelConfig = {
      model: resolvedModel,
      generationConfig: {
        temperature: Math.min(Math.max(parseFloat(temperature) || 0.7, 0), 2),
      }
    };

    if (systemInstruction && systemInstruction.trim()) {
      modelConfig.systemInstruction = systemInstruction.trim();
    }

    const geminiModel = genAI.getGenerativeModel(modelConfig);
    const formattedHistory = formatHistory(history);

    const chat = geminiModel.startChat({
      history: formattedHistory
    });

    const streamResult = await chat.sendMessageStream(message);

    for await (const chunk of streamResult.stream) {
      const chunkText = chunk.text();
      if (chunkText) {
        res.write(`data: ${JSON.stringify({ text: chunkText })}\n\n`);
      }
    }

    // Completion signal
    res.write(`data: [DONE]\n\n`);
    res.end();
  } catch (error) {
    console.error('Streaming error in /api/chat/stream:', error);
    res.write(`data: ${JSON.stringify({ error: error.message || 'Stream error occurred' })}\n\n`);
    res.end();
  }
});

// Fallback to index.html for single-page app behavior
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// Start Server
app.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 Gemini Chatbot Backend running at http://localhost:${PORT}`);
  console.log(`📁 Frontend served from: ${frontendPath}`);
  console.log(`🔑 Gemini API Key: ${process.env.GEMINI_API_KEY ? 'Configured' : 'Not configured'}`);
  console.log(`⚡ Supabase Cloud: ${isSupabaseConfigured ? `Connected (${SUPABASE_URL})` : 'Awaiting credentials in .ev / .env'}`);
  console.log(`======================================================\n`);
});
