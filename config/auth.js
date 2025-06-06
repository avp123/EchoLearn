const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/echolearn';
const SESSION_SECRET = process.env.SESSION_SECRET || 'your-session-secret';

if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
  console.error("❌ ERROR: Google OAuth credentials are not set in .env");
  process.exit(1);
}

module.exports = {
  google: {
    clientID: GOOGLE_CLIENT_ID,
    clientSecret: GOOGLE_CLIENT_SECRET,
    callbackURL: "/auth/google/callback"
  },
  mongodb: {
    uri: MONGO_URI
  },
  session: {
    secret: SESSION_SECRET
  }
}; 