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

async function typewriter(el, text) {
  el.textContent = '';
  el.classList.add('typing');
  for (let i = 0; i < text.length; i += 1) {
    el.textContent += text[i];
    await new Promise((r) => setTimeout(r, 6));
  }
  el.classList.remove('typing');
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const message = input.value.trim();
  if (!message) return;

  addMessage(message, 'user');
  input.value = '';

  const aiEl = addMessage('Düşünüyorum...', 'ai');
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session-id': sessionId
      },
      body: JSON.stringify({ message, mode: mode.value })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Bilinmeyen hata');
    await typewriter(aiEl, data.reply);
  } catch (err) {
    aiEl.textContent = `Hata: ${err.message}`;
  }
});

resetBtn.addEventListener('click', async () => {
  await fetch('/api/reset', { method: 'POST', headers: { 'x-session-id': sessionId } });
  chat.innerHTML = '';
  addMessage('Yeni sohbet başlatıldı.', 'ai');
});
