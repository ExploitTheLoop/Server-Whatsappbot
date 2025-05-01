// ✅ FINAL server.js with duplicate WhatsApp session protection, all original features preserved
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs').promises;
const path = require('path');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const { google } = require('googleapis');

const app = express();
app.use(express.json());
app.use(express.static('public'));

app.use(cors({
  origin: ['http://localhost', 'http://localhost:3000'],
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type'],
}));

const sessionsDir = path.join(__dirname, 'sessions');
const AUDIO_DOWNLOAD_PATH = path.join(__dirname, 'audio_downloads');

const sessions = {};
const connectedNumbers = {}; // New: to track WhatsApp number to session


fs.mkdir(sessionsDir, { recursive: true }).catch(() => {});
fs.mkdir(AUDIO_DOWNLOAD_PATH, { recursive: true }).catch(() => {});


// ========== GOOGLE SHEETS LOGGING ==========
async function logToGoogleSheets(sender, message, whyImportant, sessionId, googleSheetsId) {
  try {
    if (!process.env.GOOGLE_CREDENTIALS_PATH) {
      throw new Error('Missing GOOGLE_CREDENTIALS_PATH in .env');
    }
    if (!googleSheetsId) {
      throw new Error('Google Sheets ID not provided for session');
    }

    const auth = new google.auth.GoogleAuth({
      keyFile: process.env.GOOGLE_CREDENTIALS_PATH,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = googleSheetsId;

    const values = [
      [
        new Date().toISOString(),
        sender,
        message,
        whyImportant || 'N/A',
        sessionId || 'N/A',
      ],
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Sheet1!A:E',
      valueInputOption: 'USER_ENTERED',
      resource: { values },
    });

    console.log(`📝 Logged to Google Sheets: ${sender} - ${message} - ${whyImportant} (Session: ${sessionId}, Sheet: ${spreadsheetId})`);
    return true;
  } catch (err) {
    console.error('Google Sheets error:', err.message);
    await new Promise(r => setTimeout(r, 2000));
    try {
      const auth = new google.auth.GoogleAuth({
        keyFile: process.env.GOOGLE_CREDENTIALS_PATH,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });
      const sheets = google.sheets({ version: 'v4', auth });
      await sheets.spreadsheets.values.append({
        spreadsheetId: googleSheetsId,
        range: 'Sheet1!A:E',
        valueInputOption: 'USER_ENTERED',
        resource: { values },
      });
      console.log(`📝 Retry succeeded for ${sender} (Session: ${sessionId}, Sheet: ${spreadsheetId})`);
      return true;
    } catch (retryErr) {
      console.error('Google Sheets retry failed:', retryErr.message);
      return false;
    }
  }
}

// ========== GOOGLE SHEETS READING ==========
async function readFromGoogleSheets(sender, sessionId, googleSheetsId) {
  try {
    console.log(`Reading Google Sheets for sender: ${sender}, session: ${sessionId}, sheet: ${googleSheetsId}`);
    if (!googleSheetsId) {
      throw new Error('Google Sheets ID not provided for session');
    }

    const auth = new google.auth.GoogleAuth({
      keyFile: process.env.GOOGLE_CREDENTIALS_PATH,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = googleSheetsId;

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Sheet1!A:E',
    });

    const rows = response.data.values || [];
    for (let i = rows.length - 1; i >= 0; i--) {
      if (rows[i][1] === sender && (!sessionId || rows[i][4] === sessionId)) {
        const result = [{ message: rows[i][2], timestamp: rows[i][0], whyImportant: rows[i][3] }];
        console.log(`Found match for sender ${sender}, session ${sessionId}:`, result);
        return result;
      }
    }

    return [];
  } catch (err) {
    console.error('Google Sheets read error:', err.message);
    return [];
  }
}

// Generate ElevenLabs audio
async function generateElevenLabsAudio(text, outputPath, apiKey, voiceId) {
  try {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_turbo_v2_5',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    });
    if (!response.ok) throw new Error(`ElevenLabs API error: ${response.status}`);
    const audioBuffer = await response.buffer();
    await fs.writeFile(outputPath, audioBuffer);
    return outputPath;
  } catch (err) {
    console.error('ElevenLabs error:', err.message);
    return null;
  }
}

// Transcribe audio using Deepgram
async function transcribeAudiousingdeepgram(audioPath, apiKey) {
  try {
    const audioBuffer = await fs.readFile(audioPath);
    const ext = audioPath.split('.').pop().toLowerCase();
    const mimeType = ext === 'wav' ? 'audio/wav' : ext === 'mp3' ? 'audio/mpeg' : 'audio/ogg';
    const response = await fetch('https://api.deepgram.com/v1/listen?model=nova-3&punctuate=true', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${apiKey}`,
        'Content-Type': mimeType,
      },
      body: audioBuffer,
    });
    if (!response.ok) throw new Error(`Deepgram API error: ${response.status}`);
    const result = await response.json();
    const transcription = result.results?.channels[0]?.alternatives[0]?.transcript;
    return transcription || 'No transcription found.';
  } catch (err) {
    console.error('Transcription error:', err);
    return 'Couldn’t process audio.';
  } finally {
    await fs.unlink(audioPath).catch(() => {});
  }
}

// Gemini API for chat responses
async function geminiApi(message, chatId, config) {
  try {
    const conversationHistory = sessions[config.sessionId]?.conversationHistory || {};
    conversationHistory[chatId] = conversationHistory[chatId] || [];
    const history = conversationHistory[chatId].slice(-3).map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }],
    }));

    const prompt = config.prompt.trim() + `\n\nConversation history:\n${history.map(item => `${item.role}: ${item.parts[0].text}`).join('\n')}\n\nCurrent message: ${message}`;
    const request = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 250, temperature: 0.8 },
    };

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${config.geminiApiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Gemini API error: ${response.status} - ${JSON.stringify(errorData)}`);
    }

    const data = await response.json();
    let reply = data.candidates[0].content.parts[0].text.trim();
    let isImportant = false;
    let whyImportant = '';
    let checkLogs = false;

  //  console.log('Reply From Ai:', reply);

    try {
      const jsonMatch = reply.match(/\{[^{}]*\}/);
      if (jsonMatch) {
        const jsonData = JSON.parse(jsonMatch[0]);
        console.log('Parsed JSON from reply:', jsonData);
        if (jsonData.isImportant) {
          isImportant = true;
          whyImportant = jsonData.why || 'Urgent message detected';
        } else if (jsonData.checkLogs) {
          checkLogs = true;
        }
        reply = reply.replace(jsonMatch[0], '').trim();
      }
    } catch (e) {
      console.log('JSON parsing error:', e.message);
    }

    conversationHistory[chatId].push({ role: 'user', content: message });
    conversationHistory[chatId].push({ role: 'assistant', content: reply });
    sessions[config.sessionId].conversationHistory = conversationHistory;

    if (isImportant) {
      const sender = chatId.split('@')[0];
      await logToGoogleSheets(sender, message, whyImportant, config.sessionId, config.googleSheetsId);
      console.log(`Logged to Google Sheets: ${sender} - ${message} - ${whyImportant} (Session: ${config.sessionId}, Sheet: ${config.googleSheetsId})`);
    }

    if (checkLogs) {
      const sender = chatId.split('@')[0];
      const logs = await readFromGoogleSheets(sender, config.sessionId, config.googleSheetsId);
      if (logs.length > 0) {
        reply += `\nNoted: 📋 ${logs[0].message} (at ${new Date(logs[0].timestamp).toLocaleString()})`;
      } else {
        reply += `\nOi, no 📋 scribbles yet, bhai! Wanna drop something new? 😄`;
      }
    }

    return reply;
  } catch (err) {
    console.error('Gemini API error:', err);
    return 'Arre yaar, my chat magic fizzled out! Try me again? 😅';
  }
}

function initializeWhatsAppClient(sessionId, config) {
  const client = new Client({
    authStrategy: new LocalAuth({ clientId: sessionId }),
    puppeteer: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] },
  });

  client.on('qr', async (qr) => {
    const qrCodeDataUrl = await qrcode.toDataURL(qr);
    sessions[sessionId].qrCode = qrCodeDataUrl;
    sessions[sessionId].status = 'waiting';
    await fs.writeFile(path.join(sessionsDir, `${sessionId}.json`), JSON.stringify(config, null, 2));
  });

  client.on('ready', async () => {
    try {
      const number = client.info.wid._serialized;

      for (const sid in sessions) {
        if (sid !== sessionId && sessions[sid]?.whatsappNumber === number) {
          if (sessions[sid].client) {
            for (let i = 0; i < 3; i++) {
              try {
                await sessions[sid].client.destroy();
                console.log(`✅ Destroyed duplicate session ${sid}`);
                break;
              } catch (err) {
                if (err.code === 'EBUSY' && i < 2) {
                  console.warn(`🔁 Retry destroy (${i + 1}) for duplicate session ${sid}`);
                  await new Promise(r => setTimeout(r, 1500));
                } else {
                  console.error(`❌ Failed to destroy duplicate session ${sid}:`, err.message);
                  break;
                }
              }
            }
          }
      
          if (connectedNumbers[number] === sid) {
            delete connectedNumbers[number];
          }
      
          delete sessions[sid];
          console.log(`🔥 Removed duplicate session ${sid} for number ${number}`);
        }
      }
      

      sessions[sessionId].whatsappNumber = number;
      connectedNumbers[number] = sessionId;

      sessions[sessionId].status = 'ready';
      sessions[sessionId].qrCode = '';
      sessions[sessionId].client = client;
      await fs.writeFile(path.join(sessionsDir, `${sessionId}.json`), JSON.stringify(config, null, 2));
      console.log(`✅ Bot online for session ${sessionId} (${number})`);

      // 🔍 Print full list of sessions and connected numbers
      console.log('🧾 Current Active Sessions:');
      Object.entries(sessions).forEach(([sid, sess]) => {
        const num = sess.whatsappNumber || 'Not Connected';
        const stat = sess.status || 'unknown';
        console.log(`🔹 Session ID: ${sid} | WhatsApp: ${num} | Status: ${stat}`);
      });
	  
      console.log('📞 Connected Numbers Map:');
      Object.entries(connectedNumbers).forEach(([num, sid]) => {
        console.log(`🔸 WhatsApp: ${num} => Session ID: ${sid}`);
      });
    
    } catch (err) {
      console.error('Client ready error:', err);
    }
});

  // Keep your original message and disconnect logic intact (unchanged)
  client.on('message', async (msg) => {
    try {
      if (msg.from === msg.to || msg.isStatus) return;

      const session = sessions[sessionId];
      if (!session?.botActive) {
        console.log(`🛑 Bot is paused for session ${sessionId}. Ignoring message from ${msg.from}.`);
        return; // Skip reply if bot is turned off
      }
  

      const replyWithDelay = async (reply, delayMs = 1000, isAudio = false) => {
        await new Promise(resolve => setTimeout(resolve, delayMs));
        if (isAudio && config.elevenLabsApiKey && config.elevenLabsVoiceId) {
          const audioOutputPath = path.join(AUDIO_DOWNLOAD_PATH, `reply_${Date.now()}.mp3`);
          const audioGenerated = await generateElevenLabsAudio(reply, audioOutputPath, config.elevenLabsApiKey, config.elevenLabsVoiceId);
          if (audioGenerated) {
            try {
              const media = MessageMedia.fromFilePath(audioGenerated);
              await client.sendMessage(msg.from, media, { sendAudioAsVoice: true });
            } finally {
              await fs.unlink(audioOutputPath).catch(() => {});
            }
          } else {
            await msg.reply(reply);
          }
        } else {
          await msg.reply(reply);
        }
      };

      if (msg.hasMedia && (msg.type === 'audio' || msg.type === 'ptt')) {
        const media = await msg.downloadMedia();
        if (media?.data) {
          const extension = media.mimetype.split('/')[1].split(';')[0];
          const filePath = path.join(AUDIO_DOWNLOAD_PATH, `audio_${Date.now()}.${extension}`);
          await fs.writeFile(filePath, Buffer.from(media.data, 'base64'));
          const text = await transcribeAudiousingdeepgram(filePath, config.deepgramApiKey);
          const reply = await geminiApi(text, msg.from, config);
          console.log(`Audio message from ${msg.from} message:${text}`);
          console.log(`Ai is repling for audio msg to ${msg.from} message:${reply}`);
          await replyWithDelay(reply, 1500, true);
        }
      } else if (msg.type === 'chat') {
        console.log(`message from ${msg.from} message:${msg.body}`);
        const reply = await geminiApi(msg.body, msg.from, config);
        console.log(`Ai is repling to ${msg.from} message:${reply}`);
        await replyWithDelay(reply, 1000);
      } else if (msg.type === 'call_log' && msg.body.toLowerCase().includes('missed')) {
        const excuse = 'Missed your call because I was busy chasing phuchkas! 😜';
        await client.sendMessage(msg.from, excuse);
        console.log(`📞 Replied to missed call from ${msg.from}: ${excuse}`);
      }
    } catch (err) {
      console.error(`Message error for session ${sessionId}:`, err);
    }
  });


  client.on('disconnected', async (reason) => {
    console.warn(`❌ Disconnected for session ${sessionId}: ${reason}`);
    const disconnectedNumber = sessions[sessionId]?.whatsappNumber;
    if (disconnectedNumber && connectedNumbers[disconnectedNumber] === sessionId) {
        delete connectedNumbers[disconnectedNumber];
    }
    sessions[sessionId].status = 'disconnected';
    delete sessions[sessionId].client;
    await fs.writeFile(path.join(sessionsDir, `${sessionId}.json`), JSON.stringify(config, null, 2));

    delete sessions[sessionId]; // Delete the session object from memory

    console.log(`Session ${sessionId} marked as disconnected and removed from memory.`);
  });

  client.initialize();
  return client;
}

// API Endpoints
app.post('/api/start-bot', async (req, res) => {
  const sessionId = req.body.sessionId || uuidv4();
  const config = { ...req.body, sessionId };
  try {
   
    // Validate required fields
    const requiredFields = [
      { key: 'geminiApiKey', name: 'Gemini API Key' },
      { key: 'deepgramApiKey', name: 'Deepgram API Key' },
      { key: 'googleSheetsId', name: 'Google Sheets ID' },
      { key: 'prompt', name: 'Prompt' },
    ];
  
    for (const field of requiredFields) {
      if (!config[field.key] || typeof config[field.key] !== 'string' || config[field.key].trim() === '') {
        return res.status(400).json({ error: `${field.name} is required and must be a non-empty string` });
      }
    }
  
    // Validate optional ElevenLabs fields (both or neither)
    const hasElevenLabsApiKey = config.elevenLabsApiKey && typeof config.elevenLabsApiKey === 'string' && config.elevenLabsApiKey.trim() !== '';
    const hasElevenLabsVoiceId = config.elevenLabsVoiceId && typeof config.elevenLabsVoiceId === 'string' && config.elevenLabsVoiceId.trim() !== '';
    if (hasElevenLabsApiKey !== hasElevenLabsVoiceId) {
      return res.status(400).json({ error: 'Both ElevenLabs API Key and Voice ID must be provided together, or neither' });
    }
      
    await fs.writeFile(path.join(sessionsDir, `${sessionId}.json`), JSON.stringify(config, null, 2));
    sessions[sessionId] = { config, status: 'connecting', qrCode: '', conversationHistory: {}, botActive: true };
    initializeWhatsAppClient(sessionId, config);
    res.json({ sessionId });
  } catch (err) {
    console.error('Start bot error:', err.message);
    res.status(500).json({ error: 'Failed to save configuration' });
  }
});

app.get('/api/status/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  const session = sessions[sessionId];
  if (session) {
    res.json({ status: session.status, qrCode: session.qrCode });
  } else {
    res.status(404).json({ error: 'Session not found' });
  }
});

app.get('/api/check-session/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  try {
    const configPath = path.join(sessionsDir, `${sessionId}.json`);
    if (!await fs.access(configPath).then(() => true).catch(() => false)) {
      return res.status(404).json({ error: 'Session not found' });
    }
    const config = JSON.parse(await fs.readFile(configPath));
    const session = sessions[sessionId];
    let isConnected = false;
    if (session?.client) {
      try {
        isConnected = await session.client.getState() === 'CONNECTED';
      } catch (err) {
        isConnected = false;
      }
    }
    res.json({
      config,
      isConnected,
      qrCode: session?.qrCode || '',
      status: session?.status || 'disconnected',
    });
  } catch (err) {
    res.status(500).json({ error: 'Error checking session' });
  }
});

app.post('/api/disconnect/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  const session = sessions[sessionId];

  if (!session || !session.client) {
    console.warn(`⚠️ Session ${sessionId} not found or already disconnected.`);
    return res.status(404).json({ error: 'Session or client not found' });
  }

  try {
    await new Promise(resolve => setTimeout(resolve, 1000)); // slight delay for safety

    for (let i = 0; i < 3; i++) {
      try {
        await session.client.destroy();
        console.log(`✅ Session ${sessionId} client destroyed.`);
        break;
      } catch (err) {
        if (err.code === 'EBUSY' && i < 2) {
          console.warn(`🔁 Retry destroy (${i + 1}) for session ${sessionId}`);
          await new Promise(r => setTimeout(r, 1500));
        } else {
          throw err;
        }
      }
    }

    session.status = 'disconnected';
    delete session.client;

    const number = session.whatsappNumber;
    if (number && connectedNumbers[number] === sessionId) {
      delete connectedNumbers[number];
    }

    await fs.writeFile(
      path.join(sessionsDir, `${sessionId}.json`),
      JSON.stringify(session.config, null, 2)
    );

    res.json({ success: true });
  } catch (err) {
    console.error(`❌ Error while disconnecting session ${sessionId}:`, err.message);
    if (err.code === 'EBUSY') {
      res.status(500).json({ error: 'File is locked. Try again later.' });
    } else {
      res.status(500).json({ error: 'Failed to disconnect session.' });
    }
  }
});


// Turn bot ON
app.post('/api/bot-on/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  const session = sessions[sessionId];
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  session.botActive = true;
  res.json({ success: true, message: 'Bot is now active (responding).' });
});

// Turn bot OFF
app.post('/api/bot-off/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  const session = sessions[sessionId];
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  session.botActive = false;
  res.json({ success: true, message: 'Bot is now paused (not responding).' });
});

app.get('/api/bot-status/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  const session = sessions[sessionId];
  if (!session) {
      return res.status(404).json({ error: 'Session not found' });
  }
  res.json({ sessionId: sessionId, botActive: session.botActive });
});

// Cleanup inactive sessions
setInterval(async () => {
  const files = await fs.readdir(sessionsDir);
  for (const file of files) {
    const sessionId = file.replace('.json', '');
    if (!sessions[sessionId]) {
      await fs.unlink(path.join(sessionsDir, file)).catch(() => {});
      for (const number in connectedNumbers) {
        if (connectedNumbers[number] === sessionId) {
          delete connectedNumbers[number];
          break;
        }
      }      
      console.log(`Cleaned up inactive session ${sessionId}`);
    }
  }
}, 24 * 60 * 60 * 1000); // Every 24 hours


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌐 Server running on port ${PORT}`));
