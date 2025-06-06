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

// Session configuration
app.use(session({
  secret: config.session.secret,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ 
    mongoUrl: config.mongodb.uri,
    touchAfter: 24 * 3600 // time period in seconds
  }),
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: 'none',
    domain: process.env.NODE_ENV === 'production' ? 'echolearn-3uy9.onrender.com' : undefined
  },
  proxy: true
}));

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// Trust proxy - needed for secure cookies on Render
app.set('trust proxy', 1);

// Enable CORS with credentials
app.use(cors({
  origin: process.env.CLIENT_URL || "http://localhost:3000",
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 200
}));

// Add body parsing middleware
app.use(express.json());

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
app.get('/auth/google', (req, res, next) => {
  console.log('Attempting Google authentication...');
  passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
});

app.get('/auth/google/callback', (req, res, next) => {
  console.log('Received Google callback...');
  passport.authenticate('google', {
    successRedirect: process.env.CLIENT_URL || 'http://localhost:3000',
    failureRedirect: '/login'
  })(req, res, next);
});

app.get('/auth/logout', (req, res) => {
  console.log('Logging out user...');
  req.logout(() => {
    res.redirect('/');
  });
});

app.get('/auth/user', (req, res) => {
  console.log('Checking user authentication:', req.user ? 'Authenticated' : 'Not authenticated');
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
    console.log('Fetching conversations for user:', req.user.googleId);
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
    // Get user's conversations from MongoDB
    const user = await User.findById(req.user._id);
    const userConversationIds = new Set(user.conversations.map(c => c.conversationId));
    
    // Filter conversations to only include those saved for this user
    const filteredConversations = data.conversations.filter(conv => 
      userConversationIds.has(conv.conversation_id)
    );
    
    console.log(`Found ${filteredConversations.length} conversations for user ${req.user.googleId}`);
    return res.json(filteredConversations || []);
  } catch (err) {
    console.error("Server error (list):", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Save a new conversation
app.post('/api/conversations', isAuthenticated, async (req, res) => {
  try {
    const { conversationId } = req.body;
    console.log('Saving new conversation:', conversationId, 'for user:', req.user.googleId);
    
    if (!conversationId) {
      return res.status(400).json({ error: 'Conversation ID is required' });
    }

    // Add conversation to user's list
    const user = await User.findByIdAndUpdate(
      req.user._id,
      {
        $addToSet: {
          conversations: {
            conversationId,
            startTime: new Date()
          }
        }
      },
      { new: true }
    );

    console.log('Conversation saved successfully');
    res.json({ success: true, conversationCount: user.conversations.length });
  } catch (err) {
    console.error("Error saving conversation:", err);
    res.status(500).json({ error: "Failed to save conversation" });
  }
});

app.get('/api/conversations/:id', isAuthenticated, async (req, res) => {
  const convoId = req.params.id;
  console.log('Fetching transcript for conversation:', convoId);
  
  try {
    // Verify user has access to this conversation
    const user = await User.findById(req.user._id);
    if (!user.conversations.some(c => c.conversationId === convoId)) {
      console.log('Unauthorized access attempt to conversation:', convoId);
      return res.status(403).json({ error: "Unauthorized access to this conversation" });
    }

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
    console.log("ElevenLabs transcript response received");
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
