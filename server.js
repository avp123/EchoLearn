const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: 'https://your-username.github.io' // ← replace with your actual GitHub Pages URL
}));

const API_KEY = process.env.ELEVENLABS_API_KEY;
const BASE_URL = 'https://api.elevenlabs.io/v1';

app.get('/api/conversations', async (req, res) => {
  try {
    const response = await fetch(`${BASE_URL}/conversations`, {
      headers: {
        'xi-api-key': API_KEY
      }
    });
    const data = await response.json();
    res.json(data.conversations || []);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

app.get('/api/conversations/:id', async (req, res) => {
  try {
    const response = await fetch(`${BASE_URL}/conversations/${req.params.id}`, {
      headers: {
        'xi-api-key': API_KEY
      }
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch conversation details' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
