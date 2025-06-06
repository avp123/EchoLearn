// server.js
require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const path = require('path');
const passport = require('passport');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const mongoose = require('mongoose');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const config = require('./config/auth');
const User = require('./models/User');

const app = express();
const PORT = process.env.PORT || 3000;

// Connect to MongoDB
mongoose.connect(config.mongodb.uri)
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// Load your ElevenLabs API key from .env
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
if (!ELEVENLABS_API_KEY) {
  console.error("❌ ERROR: ELEVENLABS_API_KEY is not set in .env");
  process.exit(1);
}

// Base URL for the Convai endpoints
const API_BASE_URL = "https://api.elevenlabs.io/v1/convai";

// Enable CORS with credentials
app.use(cors({
  origin: process.env.CLIENT_URL || "http://localhost:3000",
  credentials: true
}));

// Session configuration
app.use(session({
  secret: config.session.secret,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: config.mongodb.uri }),
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// Passport configuration
passport.use(new GoogleStrategy(config.google,
  async (accessToken, refreshToken, profile, done) => {
    try {
      // Find or create user
      let user = await User.findOne({ googleId: profile.id });
      
      if (!user) {
        user = await User.create({
          googleId: profile.id,
          email: profile.emails[0].value,
          name: profile.displayName
        });
      }
      
      return done(null, user);
    } catch (err) {
      return done(err, null);
    }
  }
));

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

// Auth middleware to protect routes
const isAuthenticated = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: 'Not authenticated' });
};

// Serve static files from /docs
app.use(express.static(path.join(__dirname, 'docs')));

// Auth routes
app.get('/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

app.get('/auth/google/callback',
  passport.authenticate('google', {
    successRedirect: '/',
    failureRedirect: '/login'
  })
);

app.get('/auth/logout', (req, res) => {
  req.logout(() => {
    res.redirect('/');
  });
});

app.get('/auth/user', (req, res) => {
  if (!req.user) {
    return res.status(401).json(null);
  }
  res.json({
    googleId: req.user.googleId,
    name: req.user.name,
    email: req.user.email
  });
});

// Protected API routes
app.get('/api/conversations', isAuthenticated, async (req, res) => {
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
    // Filter conversations for the current user
    const userConversations = req.user.conversations || [];
    const userConversationIds = new Set(userConversations.map(c => c.conversationId));
    
    const filteredConversations = data.conversations.filter(conv => 
      userConversationIds.has(conv.conversation_id)
    );
    
    return res.json(filteredConversations || []);
  } catch (err) {
    console.error("Server error (list):", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Endpoint to save a new conversation
app.post('/api/conversations', isAuthenticated, async (req, res) => {
  try {
    const { conversationId } = req.body;
    
    // Add conversation to user's list
    await User.findByIdAndUpdate(req.user.id, {
      $addToSet: {
        conversations: {
          conversationId,
          startTime: new Date()
        }
      }
    });
    
    res.json({ success: true });
  } catch (err) {
    console.error("Error saving conversation:", err);
    res.status(500).json({ error: "Failed to save conversation" });
  }
});

app.get('/api/conversations/:id', isAuthenticated, async (req, res) => {
  const convoId = req.params.id;
  
  // Check if user has access to this conversation
  const userConversations = req.user.conversations || [];
  if (!userConversations.some(c => c.conversationId === convoId)) {
    return res.status(403).json({ error: "Unauthorized access to this conversation" });
  }

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
    console.log("ElevenLabs transcript response:", data);
    const transcript = data.transcript || [];
    return res.json(transcript);
  } catch (err) {
    console.error("Server error (get):", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Server listening on port ${PORT}`);
  console.log(`👉 Open http://localhost:${PORT} in your browser (for testing)`);
});
