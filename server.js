// server.js
require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Load your ElevenLabs API key from .env
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
if (!ELEVENLABS_API_KEY) {
  console.error("❌ ERROR: ELEVENLABS_API_KEY is not set in .env");
  process.exit(1);
}

// Base URL for the Convai endpoints
const API_BASE_URL = "https://api.elevenlabs.io/v1/convai";

// Enable CORS so that GitHub Pages (or any frontend) can fetch from this server
// You can restrict the origin to your GitHub Pages domain if you want:
//   origin: "https://<your-github-username>.github.io"
app.use(cors({
  origin: "*" // ← for simplicity, allow all origins; change to your GH Pages URL if you prefer
}));

// Serve static files from /docs (only if you ever want to test those locally):
app.use(express.static(path.join(__dirname, 'docs')));

// ——————————————————————————————
// 1. LIST ALL CONVERSATIONS
//    GET /api/conversations
// ——————————————————————————————
app.get('/api/conversations', async (req, res) => {
  try {
    const response = await fetch(`${API_BASE_URL}/conversations`, {
      method: 'GET',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
        'Content-Type': 'application/json'
      }
    });
    if (!response.ok) {
      const msg = await response.text();
      console.error("ElevenLabs error (list):", response.status, msg);
      return res.status(response.status).json({ error: msg });
    }

    const data = await response.json();
    // ElevenLabs returns: { "conversations": [ … ], "has_more": false, "next_cursor": null }
    return res.json(data.conversations || []);
  } catch (err) {
    console.error("Server error (list):", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ——————————————————————————————————
// 2. GET A SINGLE CONVERSATION’S TRANSCRIPT
//    GET /api/conversations/:id
// ——————————————————————————————————
app.get('/api/conversations/:id', async (req, res) => {
  const convoId = req.params.id;
  try {
    const response = await fetch(`${API_BASE_URL}/conversations/${convoId}`, {
      method: 'GET',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
        'Content-Type': 'application/json'
      }
    });
    if (!response.ok) {
      const msg = await response.text();
      console.error("ElevenLabs error (get):", response.status, msg);
      return res.status(response.status).json({ error: msg });
    }

    const data = await response.json();
    // The ElevenLabs API returns the transcript directly in the response
    // No need to access data.body.transcript
    console.log("ElevenLabs transcript response:", data); // Add logging to debug
    const transcript = data.transcript || [];
    return res.json(transcript);
  } catch (err) {
    console.error("Server error (get):", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ——————————————————————————————
// 3. START THE SERVER
// ——————————————————————————————
app.listen(PORT, () => {
  console.log(`✅ Server listening on port ${PORT}`);
  console.log(`👉 Open http://localhost:${PORT} in your browser (for testing)`);
});
