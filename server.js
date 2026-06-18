require('dotenv').config();
const express = require('express');
const cors = require('cors');
const twilio = require('twilio');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

const { TWILIO_ACCOUNT_SID, TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET, TWILIO_TWIML_APP_SID, ADA_PHONE_NUMBER, PORT = 3000 } = process.env;

// Generate Twilio access token for the browser client
app.get('/token', (req, res) => {
  const AccessToken = twilio.jwt.AccessToken;
  const VoiceGrant = AccessToken.VoiceGrant;

  const token = new AccessToken(TWILIO_ACCOUNT_SID, TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET, {
    identity: 'ada-demo-user',
    ttl: 3600,
  });

  token.addGrant(new VoiceGrant({
    outgoingApplicationSid: TWILIO_TWIML_APP_SID,
    incomingAllow: false,
  }));

  res.json({ token: token.toJwt() });
});

// TwiML endpoint — tells Twilio to dial the Ada number when browser places a call
app.post('/twiml', (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const dial = twiml.dial({ callerId: ADA_PHONE_NUMBER });
  dial.number(ADA_PHONE_NUMBER);
  res.type('text/xml');
  res.send(twiml.toString());
});

// Proxy Beeceptor request server-side to avoid CORS issues
app.get('/context', async (req, res) => {
  const url = process.env.BEECEPTOR_URL;
  if (!url || url.includes('your-endpoint-here')) {
    return res.json({
      _note: 'Configure BEECEPTOR_URL in .env to load real context',
      name: 'Demo User',
      account_id: 'DEMO-001',
      plan: 'Enterprise',
      language: 'English',
      open_tickets: 2,
      last_contact: '2026-06-10',
      sentiment: 'Neutral',
    });
  }
  try {
    const response = await fetch(url);
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch from Beeceptor', detail: err.message });
  }
});

// Serve static files last so API routes take priority
app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
  console.log(`\n🎙️  Ada Voice Visualiser running at http://localhost:${PORT}`);
  console.log(`\nChecklist:`);
  console.log(`  TwiML App SID : ${TWILIO_TWIML_APP_SID || '❌ Not set — run: node setup-twilio.js'}`);
  console.log(`  Ada number    : ${ADA_PHONE_NUMBER || '❌ Not set in .env'}`);
  console.log(`  Beeceptor URL : ${process.env.BEECEPTOR_URL || '❌ Not set in .env'}`);
  console.log(`\n  If TwiML App is set, make sure ngrok is running and Voice URL is updated.\n`);
});
