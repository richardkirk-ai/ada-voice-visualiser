require('dotenv').config();
const twilio = require('twilio');
const fs = require('fs');

const client = twilio(process.env.TWILIO_API_KEY_SID, process.env.TWILIO_API_KEY_SECRET, {
  accountSid: process.env.TWILIO_ACCOUNT_SID,
});

async function setup() {
  console.log('Creating TwiML App for Ada Voice Visualiser...');

  const app = await client.applications.create({
    friendlyName: 'Ada Voice Visualiser',
    voiceUrl: 'https://placeholder.ngrok.io/twiml',
    voiceMethod: 'POST',
  });

  console.log(`\n✅ TwiML App created: ${app.sid}`);
  console.log('\nAdd this to your .env file:');
  console.log(`TWILIO_TWIML_APP_SID=${app.sid}`);
  console.log('\nOnce ngrok is running, update the Voice URL in the Twilio console:');
  console.log('https://console.twilio.com/us1/develop/voice/twiml-apps');
  console.log('\nSet Voice URL to: https://YOUR-NGROK-URL/twiml');
}

setup().catch(console.error);
