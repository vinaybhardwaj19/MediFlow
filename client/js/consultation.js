/**
 * consultation.js — Exhibition-ready WebRTC video consultation + real-time chat.
 * Features: lobby preview, screen share, call timer, typing indicators,
 * file attachments, connection quality, fullscreen, PiP, sound effects.
 */
import { toastError, toastSuccess, toastInfo } from './toast.js';
import { getState } from './store.js';
import { getToken } from './api.js';

// ── State ──────────────────────────────────────────────────────────────────────
let socket, localStream, peerConnection, currentRoomId, screenStream;
let lobbyStream = null;
let callTimerInterval = null;
let callStartTime = null;
let typingTimeout = null;
let isScreenSharing = false;
let isChatOpen = true;
let unreadCount = 0;
const myUserId = () => getState('user')?._id || getState('user')?.id || 'anonymous';
const myName = () => {
  const u = getState('user');
  return u ? `${u.firstName} ${u.lastName}` : 'You';
};
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

// ── Audio cues (tiny inline base64 beeps) ──────────────────────────────────────
const audioCtx = () => new (window.AudioContext || window.webkitAudioContext)();
function playTone(freq, dur) {
  try {
    const ctx = audioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value = freq; gain.gain.value = 0.08;
    osc.start(); osc.stop(ctx.currentTime + dur);
  } catch {}
}
const playJoinSound = () => { playTone(880, 0.1); setTimeout(() => playTone(1100, 0.15), 120); };
const playLeaveSound = () => { playTone(440, 0.15); setTimeout(() => playTone(330, 0.2), 120); };
const playMsgSound = () => playTone(660, 0.06);

// ── Init ───────────────────────────────────────────────────────────────────────
export function initConsultation() {
  // Lobby controls
  document.getElementById('lobby-mic-btn')?.addEventListener('click', toggleLobbyMic);
  document.getElementById('lobby-cam-btn')?.addEventListener('click', toggleLobbyCam);
  document.getElementById('join-room-btn')?.addEventListener('click', joinRoom);

  // In-room controls
  document.getElementById('btn-hang')?.addEventListener('click', hangUp);
  document.getElementById('btn-mic')?.addEventListener('click', toggleMic);
  document.getElementById('btn-cam')?.addEventListener('click', toggleCam);
  document.getElementById('btn-screen')?.addEventListener('click', toggleScreenShare);
  document.getElementById('btn-fullscreen')?.addEventListener('click', toggleFullscreen);
  document.getElementById('btn-pip')?.addEventListener('click', togglePiP);
  document.getElementById('btn-chat-toggle')?.addEventListener('click', toggleChat);
  document.getElementById('chat-close-btn')?.addEventListener('click', () => toggleChat());

  // Chat
  document.getElementById('chat-send')?.addEventListener('click', sendChatMsg);
  document.getElementById('chat-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMsg(); }
  });
  document.getElementById('chat-input')?.addEventListener('input', emitTyping);
  document.getElementById('chat-file-input')?.addEventListener('change', handleFileAttach);

  // Start lobby preview
  startLobbyPreview();
}

// ══════════════════════════════════════════════════════════════════════════════
//  LOBBY — Camera/mic preview before joining
// ══════════════════════════════════════════════════════════════════════════════

async function startLobbyPreview() {
  try {
    lobbyStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    const video = document.getElementById('lobby-preview-video');
    if (video) video.srcObject = lobbyStream;
    document.getElementById('lobby-preview-overlay')?.classList.add('hidden');
    startAudioMeter(lobbyStream);
  } catch {
    document.getElementById('lobby-preview-overlay')?.classList.remove('hidden');
  }
}

function startAudioMeter(stream) {
  try {
    const ctx = audioCtx();
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    src.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    const bar = document.getElementById('lobby-audio-bar');
    function tick() {
      if (!lobbyStream) return;
      analyser.getByteFrequencyData(data);
      const avg = data.reduce((a, b) => a + b, 0) / data.length;
      const pct = Math.min(100, (avg / 128) * 100);
      if (bar) bar.style.width = pct + '%';
      requestAnimationFrame(tick);
    }
    tick();
  } catch {}
}

function toggleLobbyMic() {
  const track = lobbyStream?.getAudioTracks()[0];
  if (!track) return;
  track.enabled = !track.enabled;
  const btn = document.getElementById('lobby-mic-btn');
  if (btn) { btn.textContent = track.enabled ? '🎙️' : '🔇'; btn.className = `lobby-ctrl-btn ${track.enabled ? 'on' : 'off'}`; }
}

function toggleLobbyCam() {
  const track = lobbyStream?.getVideoTracks()[0];
  if (!track) return;
  track.enabled = !track.enabled;
  const btn = document.getElementById('lobby-cam-btn');
  const overlay = document.getElementById('lobby-preview-overlay');
  if (btn) { btn.textContent = track.enabled ? '📷' : '🚫'; btn.className = `lobby-ctrl-btn ${track.enabled ? 'on' : 'off'}`; }
  if (overlay) overlay.classList.toggle('hidden', track.enabled);
}

// ══════════════════════════════════════════════════════════════════════════════
//  JOIN ROOM — Connect Socket + acquire media
// ══════════════════════════════════════════════════════════════════════════════

async function joinRoom() {
  const roomId = document.getElementById('room-id-input').value.trim();
  const token = document.getElementById('room-token-input').value.trim();
  if (!roomId) { toastError('Room ID required', 'Enter the consultation room ID.'); return; }

  const joinBtn = document.getElementById('join-room-btn');
  const spinner = document.getElementById('join-spinner');
  if (joinBtn) joinBtn.disabled = true;
  if (spinner) spinner.classList.remove('hidden');

  currentRoomId = roomId;
  document.getElementById('room-id-display').textContent = roomId.slice(0, 8) + '...';

  // Use lobby stream or acquire new one
  try {
    if (lobbyStream && lobbyStream.active) {
      localStream = lobbyStream;
      lobbyStream = null;
    } else {
      localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    }
    document.getElementById('local-video').srcObject = localStream;
  } catch (err) {
    toastError('Camera/Mic blocked', 'Joining without media. Please click the camera icon in your address bar to unblock permissions.');
    localStream = null;
  }

  // Switch views
  document.getElementById('pre-room').classList.add('hidden');
  document.getElementById('in-room').classList.remove('hidden');
  setStatus('⏳ Connecting...');

  // Connect Socket.IO
  if (!window.io) { toastError('Socket.IO not loaded', ''); return; }
  const authToken = token || getToken() || 'anonymous';
  socket = window.io(window.location.origin, {
    auth: { token: authToken },
    transports: ['websocket', 'polling'],
  });

  socket.on('connect', () => {
    setStatus('✅ Connected');
    socket.emit('room:join', { roomId, userName: myName() });
    startCallTimer();
    socket.emit('call:started', { roomId });
  });

  socket.on('connect_error', e => {
    setStatus('❌ Failed');
    toastError('Connection failed', e.message);
  });

  // Participants
  socket.on('room:participants', ({ participants }) => {
    updateParticipantCount(participants.length + 1);
    if (participants.length > 0) {
      hideWaiting();
      startCall(true);
    }
  });

  socket.on('room:peer_joined', ({ name, role, participantCount }) => {
    playJoinSound();
    toastSuccess('Joined', `${name || role} joined the consultation`);
    updateParticipantCount(participantCount);
    hideWaiting();
    startCall(true);
  });

  socket.on('room:peer_left', ({ participantCount }) => {
    playLeaveSound();
    setStatus('📵 Peer left');
    document.getElementById('remote-video').srcObject = null;
    showWaiting();
    if (participantCount !== undefined) updateParticipantCount(participantCount);
    document.getElementById('remote-name-overlay').style.display = 'none';
  });

  // WebRTC signaling
  socket.on('webrtc:offer', async ({ offer }) => { await handleOffer(offer); });
  socket.on('webrtc:answer', async ({ answer }) => {
    try { await peerConnection?.setRemoteDescription(answer); } catch {}
  });
  socket.on('webrtc:ice_candidate', async ({ candidate }) => {
    try { await peerConnection?.addIceCandidate(candidate); } catch {}
  });

  // Screen share
  socket.on('screen:start', ({ name }) => {
    const badge = document.getElementById('screen-share-badge');
    document.getElementById('screen-share-who').textContent = name;
    badge?.classList.remove('hidden');
  });
  socket.on('screen:stop', () => {
    document.getElementById('screen-share-badge')?.classList.add('hidden');
  });

  // Chat
  socket.on('chat:history', ({ messages }) => {
    const container = document.getElementById('chat-messages');
    // Keep the welcome message
    messages.forEach(msg => appendChatMessage(msg));
    container.scrollTop = container.scrollHeight;
  });
  socket.on('chat:message', (msg) => {
    appendChatMessage(msg);
    if (msg.senderId !== myUserId() && msg.type !== 'system') {
      playMsgSound();
      if (!isChatOpen) {
        unreadCount++;
        const dot = document.getElementById('chat-unread-dot');
        if (dot) { dot.classList.remove('hidden'); dot.textContent = unreadCount; }
      }
    }
  });
  socket.on('chat:typing', ({ name, isTyping }) => {
    const wrap = document.getElementById('chat-typing-wrap');
    const nameEl = document.getElementById('chat-typing-name');
    if (nameEl) nameEl.textContent = name;
    wrap?.classList.toggle('hidden', !isTyping);
  });
  socket.on('chat:react', ({ messageId, emoji }) => {
    const el = document.querySelector(`[data-msg-id="${messageId}"] .msg-reactions`);
    if (el) { const span = document.createElement('span'); span.textContent = emoji; el.appendChild(span); }
  });

  // Call lifecycle
  socket.on('call:ended', ({ durationFormatted }) => {
    toastInfo('Call ended', `Duration: ${durationFormatted}`);
  });
}

// ══════════════════════════════════════════════════════════════════════════════
//  WEBRTC — Peer connection management
// ══════════════════════════════════════════════════════════════════════════════

async function startCall(isInitiator) {
  // Only skip if we already have a live connection
  if (peerConnection && ['connecting','connected','new'].includes(peerConnection.connectionState)) return;
  // Close stale connection if any
  if (peerConnection) { try { peerConnection.close(); } catch {} }

  peerConnection = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  if (localStream) localStream.getTracks().forEach(t => peerConnection.addTrack(t, localStream));

  peerConnection.ontrack = e => {
    document.getElementById('remote-video').srcObject = e.streams[0];
    hideWaiting();
    setStatus('🟢 In call');
    document.getElementById('remote-name-overlay').style.display = 'flex';
  };

  peerConnection.onicecandidate = e => {
    if (e.candidate) socket.emit('webrtc:ice_candidate', { roomId: currentRoomId, candidate: e.candidate });
  };

  peerConnection.onconnectionstatechange = () => {
    const state = peerConnection.connectionState;
    if (state === 'connected') { setStatus('🟢 In call'); monitorConnectionQuality(); }
    else if (state === 'disconnected') setStatus('⚠️ Reconnecting...');
    else if (state === 'failed') { setStatus('❌ Connection lost'); toastError('Connection lost', 'Attempting to reconnect...'); }
  };

  if (isInitiator) {
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.emit('webrtc:offer', { roomId: currentRoomId, offer });
  }
}

async function handleOffer(offer) {
  await startCall(false);
  await peerConnection.setRemoteDescription(offer);
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);
  socket.emit('webrtc:answer', { roomId: currentRoomId, answer });
}

// ══════════════════════════════════════════════════════════════════════════════
//  CONTROLS — Mic, Camera, Screen Share, Fullscreen, PiP
// ══════════════════════════════════════════════════════════════════════════════

function toggleMic() {
  const track = localStream?.getAudioTracks()[0];
  if (!track) return;
  track.enabled = !track.enabled;
  const btn = document.getElementById('btn-mic');
  btn.querySelector('.ctrl-icon').textContent = track.enabled ? '🎙️' : '🔇';
  btn.className = `ctrl-btn-v2 ${track.enabled ? 'on' : 'off'}`;
}

function toggleCam() {
  const track = localStream?.getVideoTracks()[0];
  if (!track) return;
  track.enabled = !track.enabled;
  const btn = document.getElementById('btn-cam');
  btn.querySelector('.ctrl-icon').textContent = track.enabled ? '📷' : '🚫';
  btn.className = `ctrl-btn-v2 ${track.enabled ? 'on' : 'off'}`;
}

async function toggleScreenShare() {
  const btn = document.getElementById('btn-screen');
  if (isScreenSharing) {
    // Stop screen share
    screenStream?.getTracks().forEach(t => t.stop());
    const videoTrack = localStream.getVideoTracks()[0];
    const sender = peerConnection?.getSenders().find(s => s.track?.kind === 'video');
    if (sender && videoTrack) await sender.replaceTrack(videoTrack);
    document.getElementById('local-video').srcObject = localStream;
    socket?.emit('screen:stop', { roomId: currentRoomId });
    document.getElementById('screen-share-badge')?.classList.add('hidden');
    btn.className = 'ctrl-btn-v2';
    isScreenSharing = false;
  } else {
    try {
      screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const screenTrack = screenStream.getVideoTracks()[0];
      const sender = peerConnection?.getSenders().find(s => s.track?.kind === 'video');
      if (sender) await sender.replaceTrack(screenTrack);
      document.getElementById('local-video').srcObject = screenStream;
      socket?.emit('screen:start', { roomId: currentRoomId });
      const badge = document.getElementById('screen-share-badge');
      document.getElementById('screen-share-who').textContent = 'You are';
      badge?.classList.remove('hidden');
      btn.className = 'ctrl-btn-v2 on active-feature';
      isScreenSharing = true;
      screenTrack.onended = () => toggleScreenShare();
    } catch { toastError('Screen share', 'Could not start screen sharing.'); }
  }
}

function toggleFullscreen() {
  const el = document.getElementById('video-main');
  if (!document.fullscreenElement) el?.requestFullscreen?.();
  else document.exitFullscreen?.();
}

async function togglePiP() {
  const video = document.getElementById('remote-video');
  try {
    if (document.pictureInPictureElement) await document.exitPictureInPicture();
    else if (video?.srcObject) await video.requestPictureInPicture();
  } catch { toastError('PiP', 'Picture-in-Picture not supported.'); }
}

function toggleChat() {
  const panel = document.getElementById('chat-panel');
  isChatOpen = !isChatOpen;
  panel?.classList.toggle('chat-hidden', !isChatOpen);
  if (isChatOpen) {
    unreadCount = 0;
    document.getElementById('chat-unread-dot')?.classList.add('hidden');
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  HANG UP
// ══════════════════════════════════════════════════════════════════════════════

function hangUp() {
  socket?.emit('call:ended', { roomId: currentRoomId });
  peerConnection?.close(); peerConnection = null;
  localStream?.getTracks().forEach(t => t.stop());
  screenStream?.getTracks().forEach(t => t.stop());
  socket?.disconnect(); socket = null;
  stopCallTimer();

  document.getElementById('pre-room').classList.remove('hidden');
  document.getElementById('in-room').classList.add('hidden');
  document.getElementById('remote-video').srcObject = null;
  document.getElementById('local-video').srcObject = null;

  // Reset chat
  const msgs = document.getElementById('chat-messages');
  if (msgs) msgs.innerHTML = '<div class="chat-welcome"><div class="chat-welcome-icon">🔒</div><div class="chat-welcome-text">Messages are end-to-end encrypted and auto-deleted after 90 days.</div></div>';

  showWaiting();
  toastSuccess('Call ended', 'Consultation room closed.');
  startLobbyPreview();
}

// ══════════════════════════════════════════════════════════════════════════════
//  CHAT — Messages, typing, files
// ══════════════════════════════════════════════════════════════════════════════

function sendChatMsg() {
  const input = document.getElementById('chat-input');
  const content = input.value.trim();
  if (!content || !socket) return;
  socket.emit('chat:message', { roomId: currentRoomId, content, type: 'text' });
  input.value = '';
  socket.emit('chat:typing', { roomId: currentRoomId, isTyping: false });
}

function emitTyping() {
  if (!socket) return;
  socket.emit('chat:typing', { roomId: currentRoomId, isTyping: true });
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    socket?.emit('chat:typing', { roomId: currentRoomId, isTyping: false });
  }, 2000);
}

function handleFileAttach(e) {
  const file = e.target.files?.[0];
  if (!file || !socket) return;
  if (file.size > 5 * 1024 * 1024) { toastError('File too large', 'Max 5MB allowed.'); return; }

  const reader = new FileReader();
  reader.onload = () => {
    const isImage = file.type.startsWith('image/');
    socket.emit('chat:message', {
      roomId: currentRoomId,
      content: reader.result,
      type: isImage ? 'image' : 'file',
      fileName: file.name,
      fileSize: file.size,
    });
  };
  reader.readAsDataURL(file);
  e.target.value = '';
}

function appendChatMessage(msg) {
  const container = document.getElementById('chat-messages');
  if (!container) return;
  const isMine = msg.senderId === myUserId();
  const time = msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

  if (msg.type === 'system') {
    const el = document.createElement('div');
    el.className = 'chat-system-msg';
    el.innerHTML = `<span class="system-dot">•</span> ${escapeHtml(msg.content)} <span class="system-time">${time}</span>`;
    container.appendChild(el);
  } else if (msg.type === 'image') {
    const el = document.createElement('div');
    el.className = `chat-msg ${isMine ? 'mine' : 'theirs'}`;
    el.setAttribute('data-msg-id', msg._id || '');
    el.innerHTML = `
      <div class="msg-sender">${isMine ? 'You' : escapeHtml(msg.senderName || msg.senderRole)}</div>
      <img src="${msg.content}" alt="${escapeHtml(msg.fileName || 'image')}" class="chat-image" onclick="window.open(this.src)" />
      <div class="msg-meta"><span class="msg-time">${time}</span></div>
      <div class="msg-reactions"></div>`;
    container.appendChild(el);
  } else if (msg.type === 'file') {
    const el = document.createElement('div');
    el.className = `chat-msg ${isMine ? 'mine' : 'theirs'}`;
    el.setAttribute('data-msg-id', msg._id || '');
    const sizeStr = msg.fileSize ? `(${(msg.fileSize / 1024).toFixed(1)} KB)` : '';
    el.innerHTML = `
      <div class="msg-sender">${isMine ? 'You' : escapeHtml(msg.senderName || msg.senderRole)}</div>
      <div class="chat-file-msg">📄 <a href="${msg.content}" download="${escapeHtml(msg.fileName || 'file')}">${escapeHtml(msg.fileName || 'File')} ${sizeStr}</a></div>
      <div class="msg-meta"><span class="msg-time">${time}</span></div>
      <div class="msg-reactions"></div>`;
    container.appendChild(el);
  } else {
    const el = document.createElement('div');
    el.className = `chat-msg ${isMine ? 'mine' : 'theirs'}`;
    el.setAttribute('data-msg-id', msg._id || '');
    el.innerHTML = `
      <div class="msg-sender">${isMine ? 'You' : escapeHtml(msg.senderName || msg.senderRole)}</div>
      <div class="msg-text">${escapeHtml(msg.content)}</div>
      <div class="msg-meta"><span class="msg-time">${time}</span></div>
      <div class="msg-reactions"></div>`;
    container.appendChild(el);
  }
  container.scrollTop = container.scrollHeight;
}

// ══════════════════════════════════════════════════════════════════════════════
//  UTILITIES
// ══════════════════════════════════════════════════════════════════════════════

function setStatus(text) {
  const el = document.getElementById('connection-status');
  if (el) el.textContent = text;
}

function updateParticipantCount(n) {
  const el = document.getElementById('participant-count');
  if (el) el.textContent = n;
}

function showWaiting() {
  document.getElementById('video-waiting')?.classList.remove('hidden');
}
function hideWaiting() {
  document.getElementById('video-waiting')?.classList.add('hidden');
}

function startCallTimer() {
  callStartTime = Date.now();
  const el = document.getElementById('call-timer');
  callTimerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - callStartTime) / 1000);
    const m = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const s = String(elapsed % 60).padStart(2, '0');
    if (el) el.textContent = `${m}:${s}`;
  }, 1000);
}

function stopCallTimer() {
  clearInterval(callTimerInterval);
  callTimerInterval = null;
  const el = document.getElementById('call-timer');
  if (el) el.textContent = '00:00';
}

function monitorConnectionQuality() {
  setInterval(async () => {
    if (!peerConnection) return;
    try {
      const stats = await peerConnection.getStats();
      let rtt = null;
      stats.forEach(report => {
        if (report.type === 'candidate-pair' && report.state === 'succeeded') rtt = report.currentRoundTripTime;
      });
      const bars = document.querySelectorAll('#call-quality .quality-bar');
      let level = rtt === null ? 2 : rtt < 0.1 ? 4 : rtt < 0.3 ? 3 : rtt < 0.5 ? 2 : 1;
      bars.forEach((b, i) => b.classList.toggle('active', i < level));
    } catch {}
  }, 3000);
}

function escapeHtml(str) {
  if (!str) return '';
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}
