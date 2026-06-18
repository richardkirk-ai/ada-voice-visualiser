// ── State ──
let device = null;
let activeCall = null;
let audioContext = null;
let analyser = null;
let animFrame = null;
let timerInterval = null;
let callSeconds = 0;
let recognition = null;
let jsonOpen = false;

// ── On load ──
window.addEventListener('DOMContentLoaded', () => {
  loadContext();
  initToken();
});

// ── Twilio token + device setup ──
async function initToken() {
  try {
    const res = await fetch('/token');
    const { token } = await res.json();

    device = new Twilio.Device(token, { codecPreferences: ['opus', 'pcmu'] });

    device.on('ready', () => setStatus('Ready', ''));
    device.on('error', (err) => setStatus('Error', ''));
    device.on('connect', onCallConnected);
    device.on('disconnect', onCallEnded);
  } catch (e) {
    setStatus('Token error — is server running?', '');
  }
}

// ── Call controls ──
async function startCall() {
  if (!device) return;
  setStatus('Connecting…', 'connecting');
  document.getElementById('callBtn').disabled = true;
  document.getElementById('hangupBtn').disabled = false;
  activeCall = device.connect();
}

function endCall() {
  if (device) device.disconnectAll();
}

function onCallConnected(conn) {
  activeCall = conn;
  setStatus('Live', 'active');
  startTimer();
  startWaveform(conn);
  startTranscription();
}

function onCallEnded() {
  activeCall = null;
  setStatus('Call ended', '');
  stopTimer();
  stopWaveform();
  stopTranscription();
  document.getElementById('callBtn').disabled = false;
  document.getElementById('hangupBtn').disabled = true;
}

// ── Status ──
function setStatus(label, state) {
  document.getElementById('statusLabel').textContent = label;
  const dot = document.getElementById('statusDot');
  dot.className = 'status-dot' + (state ? ' ' + state : '');
}

// ── Timer ──
function startTimer() {
  callSeconds = 0;
  const el = document.getElementById('callTimer');
  el.classList.add('active');
  timerInterval = setInterval(() => {
    callSeconds++;
    const m = String(Math.floor(callSeconds / 60)).padStart(2, '0');
    const s = String(callSeconds % 60).padStart(2, '0');
    el.textContent = `${m}:${s}`;
  }, 1000);
}

function stopTimer() {
  clearInterval(timerInterval);
  document.getElementById('callTimer').classList.remove('active');
}

// ── Waveform ──
function startWaveform(conn) {
  const canvas = document.getElementById('waveform');
  const ctx = canvas.getContext('2d');

  audioContext = new (window.AudioContext || window.webkitAudioContext)();
  analyser = audioContext.createAnalyser();
  analyser.fftSize = 1024;

  // Try to tap the call's media stream
  try {
    const stream = conn.getLocalStream ? conn.getLocalStream() : null;
    if (stream) {
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
    }
  } catch (e) {
    // Fall back to mic input
    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
    });
  }

  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  const purple = '#6200EA';
  const purpleLight = '#7C4DFF';

  function draw() {
    animFrame = requestAnimationFrame(draw);
    analyser.getByteTimeDomainData(dataArray);

    const w = canvas.width = canvas.offsetWidth;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    // Background glow when active
    const gradient = ctx.createLinearGradient(0, 0, w, 0);
    gradient.addColorStop(0, 'rgba(98,0,234,0)');
    gradient.addColorStop(0.5, 'rgba(98,0,234,0.06)');
    gradient.addColorStop(1, 'rgba(98,0,234,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);

    // Waveform line
    ctx.lineWidth = 2;
    ctx.strokeStyle = purpleLight;
    ctx.shadowBlur = 10;
    ctx.shadowColor = purple;
    ctx.beginPath();

    const sliceWidth = w / bufferLength;
    let x = 0;
    for (let i = 0; i < bufferLength; i++) {
      const v = dataArray[i] / 128.0;
      const y = (v * h) / 2;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      x += sliceWidth;
    }
    ctx.lineTo(w, h / 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  draw();
}

function stopWaveform() {
  if (animFrame) cancelAnimationFrame(animFrame);
  if (audioContext) audioContext.close();

  // Draw flat idle line
  const canvas = document.getElementById('waveform');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#2a2a35';
  ctx.beginPath();
  ctx.moveTo(0, canvas.height / 2);
  ctx.lineTo(canvas.width, canvas.height / 2);
  ctx.stroke();
}

// ── Transcription (Web Speech API) ──
function startTranscription() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return;

  const body = document.getElementById('transcriptBody');
  body.innerHTML = '';

  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = 'en-US';

  let interimEl = null;

  recognition.onresult = (event) => {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const t = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        if (interimEl) { interimEl.remove(); interimEl = null; }
        appendTranscript('You', t, false);
      } else {
        interim += t;
      }
    }
    if (interim) {
      if (!interimEl) {
        interimEl = document.createElement('div');
        interimEl.className = 'transcript-line';
        interimEl.innerHTML = `<span class="transcript-speaker you">You</span><span class="transcript-text interim"></span>`;
        body.appendChild(interimEl);
      }
      interimEl.querySelector('.transcript-text').textContent = interim;
      body.scrollTop = body.scrollHeight;
    }
  };

  recognition.onerror = () => {};
  recognition.onend = () => { if (activeCall) recognition.start(); };
  recognition.start();
}

function stopTranscription() {
  if (recognition) { recognition.stop(); recognition = null; }
}

function appendTranscript(speaker, text, isAda) {
  const body = document.getElementById('transcriptBody');
  const line = document.createElement('div');
  line.className = 'transcript-line';
  line.innerHTML = `
    <span class="transcript-speaker ${isAda ? 'ada' : 'you'}">${speaker}</span>
    <span class="transcript-text">${text}</span>
  `;
  body.appendChild(line);
  body.scrollTop = body.scrollHeight;
}

// ── Customer context ──
async function loadContext() {
  const badge = document.getElementById('contextBadge');
  badge.textContent = 'Fetching…';

  try {
    const res = await fetch('/context');
    const data = await res.json();

    badge.textContent = 'Loaded';
    badge.className = 'context-badge loaded';

    renderContextFields(data);

    const json = JSON.stringify(data, null, 2);
    document.getElementById('jsonBlock').textContent = json;
  } catch (e) {
    badge.textContent = 'Error';
    badge.className = 'context-badge error';
  }
}

function renderContextFields(data) {
  const container = document.getElementById('contextFields');
  container.innerHTML = '';

  // Show top-level fields, skip internal notes
  for (const [key, value] of Object.entries(data)) {
    if (key === '_note') continue;
    const field = document.createElement('div');
    field.className = 'context-field';
    const label = key.replace(/_/g, ' ');
    field.innerHTML = `
      <span class="context-key">${label}</span>
      <span class="context-value">${value}</span>
    `;
    container.appendChild(field);
  }
}

function toggleJson() {
  jsonOpen = !jsonOpen;
  const block = document.getElementById('jsonBlock');
  const toggle = document.querySelector('.json-toggle');
  const label = document.getElementById('jsonToggleLabel');
  block.classList.toggle('visible', jsonOpen);
  toggle.classList.toggle('open', jsonOpen);
  label.textContent = jsonOpen ? 'Hide raw JSON' : 'Show raw JSON';
}

// ── Draw idle waveform on load ──
window.addEventListener('load', () => {
  const canvas = document.getElementById('waveform');
  const ctx = canvas.getContext('2d');
  canvas.width = canvas.offsetWidth;
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#2a2a35';
  ctx.beginPath();
  ctx.moveTo(0, canvas.height / 2);
  ctx.lineTo(canvas.width, canvas.height / 2);
  ctx.stroke();
});
