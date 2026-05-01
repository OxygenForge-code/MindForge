const chat = document.getElementById('chat');
const form = document.getElementById('chatForm');
const input = document.getElementById('message');
const mode = document.getElementById('mode');
const resetBtn = document.getElementById('resetBtn');

const sessionId = crypto.randomUUID();

function addMessage(text, type = 'ai') {
  const div = document.createElement('div');
  div.className = `msg ${type}`;
  div.textContent = text;
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
  return div;
}

function mapErrorMessage(error, statusCode) {
  if (statusCode === 429) return 'Çok fazla istek gönderdin. Lütfen 1 dakika sonra tekrar dene.';
  if (statusCode === 503) return 'AI servisi şu an yapılandırılmamış. Yönetici GROQ_API_KEY kontrol etmeli.';
  if (statusCode === 502) return 'AI servisi şu an yanıt veremiyor. Birazdan tekrar dene.';
  return error || 'Beklenmeyen bir hata oluştu.';
}

async function typewriter(el, text) {
  el.textContent = '';
  el.classList.add('typing');
  for (let i = 0; i < text.length; i += 1) {
    el.textContent += text[i];
    await new Promise((r) => setTimeout(r, 4));
  }
  el.classList.remove('typing');
}

async function sendMessage(message) {
  setStatus('Yazıyor...');
  sendBtn.disabled = true;
  input.disabled = true;

  const aiEl = addMessage('', 'ai');
  aiEl.classList.add('loading');
  aiEl.innerHTML = `
    <span class="thinking">
      <span class="thinking-label">Düşünüyorum</span>
      <span class="thinking-dot"></span>
      <span class="thinking-dot"></span>
      <span class="thinking-dot"></span>
    </span>
  `;
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session-id': sessionId
      },
      body: JSON.stringify({ message, mode: mode.value })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(mapErrorMessage(data.error, res.status));
    }

    aiEl.classList.remove('loading');
    await typewriter(aiEl, data.reply || 'Yanıt alınamadı.');
    setStatus('Hazır');
  } catch (err) {
    aiEl.classList.remove('loading');
    aiEl.classList.add('error');
    aiEl.textContent = `Hata: ${err.message}`;
    setStatus('Hata');
  } finally {
    sendBtn.disabled = false;
    input.disabled = false;
    input.focus();
  }
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const message = input.value.trim();
  if (!message) return;
  addMessage(message, 'user');
  input.value = '';
  await sendMessage(message);
});

resetBtn.addEventListener('click', async () => {
  try {
    await fetch('/api/reset', { method: 'POST', headers: { 'x-session-id': sessionId } });
    chat.innerHTML = '';
    addMessage('Yeni sohbet başlatıldı. Sana nasıl yardımcı olabilirim?', 'ai');
    setStatus('Hazır');
  } catch (_e) {
    addMessage('Oturum sıfırlanamadı, sayfayı yenileyip tekrar dene.', 'error');
  }
});

addMessage('Merhaba! Ben MindForge. Bir soru sorarak başlayabilirsin.', 'ai');
