/**
 * Arabic101 Realtime Chat Extension (v3.3.0)
 * Fixed: Chrome AudioContext Autoplay policy warning resolved with clean audio handling.
 */
(function () {
  'use strict';
  if (window.__a101Chat) return;
  window.__a101Chat = true;

  const role = location.pathname.toLowerCase().includes('/management') ? 'management' : (location.pathname.toLowerCase().includes('/teacher') ? 'teacher' : 'student');
  const base = 'https://dashboard.arabic101.org';
  const api = {
    chats: base + '/' + role + '/chat/loadMoreChats',
    msgs: base + '/' + role + '/chat/loadMessages',
    send: base + '/' + role + '/chat/message/store',
    read: base + '/' + role + '/chat/read'
  };

  let activeChat = { id: '', name: 'Chat', img: base + '/storage/uploads/1762346132_logo-small.png', bio: 'Arabic101', members: '' };
  let lastUnread = 0, lastMsgSig = '', lastChatSig = '', isFirst = true, myMemberId = null;
  let lastKnownMsgCountPerChat = {};

  // Request Notification permission quietly
  if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
    Notification.requestPermission().catch(() => {});
  }

  // 1. WhatsApp Avatar Colors Generator
  const nameColors = ['#0ea5e9', '#ec4899', '#f59e0b', '#10b981', '#8b5cf6', '#06b6d4', '#f97316', '#3b82f6'];
  function getSenderColor(name) {
    if (!name) return '#0ea5e9';
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return nameColors[Math.abs(hash) % nameColors.length];
  }

  function getInitials(name) {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.substring(0, 2).toUpperCase();
  }

  // 2. Strict CSS Isolation & Compact Bubble Styles
  const style = document.createElement('style');
  style.textContent = `
    #a101-root, #a101-root * { box-sizing: border-box !important; }
    #a101-root { position:fixed; bottom:20px; right:20px; z-index:999999; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; font-size:13px; display:flex; flex-direction:column; align-items:flex-end; gap:8px; }
    
    .a101-card { width:350px; height:520px; max-height:520px; border-radius:16px; overflow:hidden; box-shadow:0 12px 36px rgba(0,0,0,0.28); display:flex; flex-direction:column; background:var(--bg,#fff); color:var(--text,#0f172a); border:1px solid var(--border,#cbd5e1); }
    .a101-card.body-win { width:390px; height:560px; max-height:560px; }
    .a101-head { background:#0f172a; color:#fff; padding:9px 12px; display:flex; align-items:center; justify-content:space-between; flex:0 0 auto !important; height:auto !important; }
    .a101-head h6 { margin:0; font-size:13.5px; font-weight:600; color:#fff; line-height:1.2; }
    .a101-head small { color:#94a3b8; font-size:10px; line-height:1.2; display:block; }
    
    /* Scroll Messages Area */
    #a101-msgs {
      flex: 1 1 auto !important;
      height: 100% !important;
      max-height: 100% !important;
      overflow-y: auto !important;
      overflow-x: hidden !important;
      padding: 10px !important;
      background: var(--chat-bg,#f1f5f9) !important;
      display: block !important;
    }
    
    #a101-contacts {
      flex: 1 1 auto !important;
      height: 100% !important;
      overflow-y: auto !important;
      padding: 0 !important;
      background: var(--bg,#fff) !important;
      display: block !important;
    }
    
    .a101-item { padding:8px 10px; display:flex; align-items:center; gap:10px; cursor:pointer; border-bottom:1px solid var(--border,#f1f5f9); background:var(--bg,#fff); color:var(--text,#0f172a); }
    .a101-item:hover { background:var(--hover,#f8fafc); }
    
    /* STRICT NON-STRETCH MESSAGE ROW */
    .a101-msg-row {
      display: flex !important;
      width: 100% !important;
      height: auto !important;
      min-height: 0 !important;
      max-height: none !important;
      flex: 0 0 auto !important;
      flex-grow: 0 !important;
      flex-shrink: 0 !important;
      margin-bottom: 6px !important;
      align-items: flex-end !important;
      clear: both !important;
    }
    .a101-msg-row.is-out { justify-content: flex-end !important; }
    .a101-msg-row.is-in { justify-content: flex-start !important; }
    
    /* WhatsApp Avatars */
    .a101-avatar { width:24px !important; height:24px !important; min-width:24px !important; max-height:24px !important; border-radius:50% !important; display:inline-flex !important; align-items:center !important; justify-content:center !important; font-size:9.5px !important; font-weight:700 !important; color:#fff !important; margin-right:6px !important; margin-bottom:2px !important; flex:0 0 24px !important; }
    .a101-avatar-out { width:24px !important; height:24px !important; min-width:24px !important; max-height:24px !important; border-radius:50% !important; display:inline-flex !important; align-items:center !important; justify-content:center !important; font-size:9.5px !important; font-weight:700 !important; color:#fff !important; margin-left:6px !important; margin-bottom:2px !important; flex:0 0 24px !important; background:#2563eb !important; }
    
    /* COMPACT WHATSAPP BUBBLE */
    .a101-bubble {
      display: inline-block !important;
      position: relative !important;
      max-width: 76% !important;
      width: auto !important;
      height: auto !important;
      min-height: 0 !important;
      max-height: none !important;
      flex: 0 0 auto !important;
      flex-grow: 0 !important;
      padding: 5px 9px !important;
      font-size: 12.5px !important;
      line-height: 1.35 !important;
      word-break: break-word !important;
      white-space: normal !important;
    }
    
    .a101-in { background:var(--in-bg,#fff) !important; color:var(--text,#0f172a) !important; border:1px solid var(--in-b,#e2e8f0) !important; border-radius:10px 10px 10px 2px !important; box-shadow:0 1px 2px rgba(0,0,0,0.04) !important; }
    .a101-out { background:#2563eb !important; color:#fff !important; border-radius:10px 10px 2px 10px !important; box-shadow:0 1.5px 3px rgba(37,99,235,0.25) !important; }
    
    .a101-sender { font-size:10.5px !important; font-weight:700 !important; margin-bottom:2px !important; display:block !important; line-height:1.2 !important; }
    .a101-time { font-size:9px !important; float:right !important; margin-left:8px !important; margin-top:2px !important; opacity:0.75 !important; }
    
    .a101-foot { padding:8px 10px; background:var(--bg,#fff); border-top:1px solid var(--border,#e2e8f0); display:flex; gap:6px; align-items:center; flex:0 0 auto !important; }
    .a101-input { flex:1; border:1px solid var(--border,#cbd5e1); background:var(--input-bg,#f8fafc); color:var(--text,#0f172a); padding:6px 12px; border-radius:20px; outline:none; font-size:12px; }
    .a101-input:focus { border-color:#2563eb; background:var(--bg,#fff); }
    .a101-btn-send { width:30px; height:30px; border-radius:50%; background:#2563eb; color:#fff; border:none; display:flex; align-items:center; justify-content:center; cursor:pointer; flex:0 0 30px !important; }
    .a101-dock-btn { border:none; border-radius:24px; padding:7px 14px; font-weight:600; font-size:12px; cursor:pointer; display:flex; align-items:center; gap:6px; box-shadow:0 4px 12px rgba(0,0,0,0.15); }
    
    /* Dark Theme Variables */
    .a101-dark { --bg:#161b22; --text:#f0f6fc; --border:#30363d; --chat-bg:#0d1117; --hover:#1f242c; --in-bg:#21262d; --in-b:#30363d; --input-bg:#0d1117; }
  `;
  document.head.appendChild(style);

  // 3. Audio Notification System (Clean HTML5 Audio, No Autoplay Warnings)
  const soundUrl = base + '/mn-notify.wav';
  function playAlert(senderName, msgText) {
    try {
      const audio = new Audio(soundUrl);
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          // Silent fallback without triggering DevTools warning logs
        });
      }
    } catch (e) {}

    // Native desktop notification when user is in another tab
    if (document.hidden && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      try {
        const n = new Notification(senderName ? senderName + ' (Arabic101)' : 'Arabic101 Chat', {
          body: msgText || 'New message received',
          icon: activeChat.img || base + '/storage/uploads/1762346132_logo-small.png'
        });
        n.onclick = () => {
          window.focus();
          setWindow('body');
          n.close();
        };
      } catch (e) {}
    }
  }

  function getCsrf() {
    return document.querySelector('meta[name="csrf-token"]')?.content ||
           document.querySelector('input[name="_token"]')?.value ||
           window.chatRealtimeConfig?.csrfToken || '';
  }

  function postData(url, data) {
    const fd = new FormData();
    fd.append('_token', getCsrf());
    Object.entries(data).forEach(([k, v]) => fd.append(k, v));
    return fetch(url, { method: 'POST', headers: { 'X-Requested-With': 'XMLHttpRequest' }, credentials: 'same-origin', body: fd });
  }

  // 4. Floating UI Elements
  const root = document.createElement('div');
  root.id = 'a101-root';
  root.innerHTML = `
    <!-- Menu Window -->
    <div id="a101-menu" class="a101-card" style="display:none;">
      <div class="a101-head">
        <div style="display:flex;align-items:center;gap:8px;">
          <img src="${base}/storage/uploads/1762346132_logo-small.png" width="20" height="20" style="border-radius:50%;">
          <h6>Arabic101 Chats</h6>
        </div>
        <span id="a101-close-menu" style="cursor:pointer;font-size:18px;line-height:1;">&times;</span>
      </div>
      <div style="padding:8px 10px;border-bottom:1px solid var(--border,#cbd5e1);flex:0 0 auto;">
        <input type="text" id="a101-search" class="a101-input" placeholder="Search contacts..." style="width:100%;box-sizing:border-box;">
      </div>
      <div id="a101-contacts">
        <div style="padding:24px;text-align:center;color:#64748b;">Loading chats...</div>
      </div>
    </div>

    <!-- Conversation Window -->
    <div id="a101-body" class="a101-card body-win" style="display:none;">
      <div class="a101-head">
        <div style="display:flex;align-items:center;gap:8px;max-width:260px;overflow:hidden;">
          <img id="a101-head-img" src="${activeChat.img}" width="28" height="28" style="border-radius:50%;flex-shrink:0;">
          <div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
            <h6 id="a101-head-name">${activeChat.name}</h6>
            <small id="a101-head-members" style="text-overflow:ellipsis;white-space:nowrap;overflow:hidden;max-width:220px;">${activeChat.members || activeChat.bio}</small>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:6px;">
          <button id="a101-btn-groups" style="background:rgba(255,255,255,0.15);border:none;color:#fff;border-radius:12px;padding:3px 8px;font-size:11px;cursor:pointer;">Groups</button>
          <span id="a101-close-body" style="cursor:pointer;font-size:18px;line-height:1;">&times;</span>
        </div>
      </div>
      <div id="a101-msgs">
        <div style="padding:24px;text-align:center;color:#64748b;font-size:12px;">Select a conversation</div>
      </div>
      <form id="a101-send-form" class="a101-foot">
        <input type="text" id="a101-msg-input" class="a101-input" placeholder="Type a message..." autocomplete="off">
        <button type="submit" class="a101-btn-send">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
        </button>
      </form>
    </div>

    <!-- Dock Toggle Buttons -->
    <div style="display:flex;gap:8px;align-items:center;">
      <button id="a101-dock-body" class="a101-dock-btn" style="background:#1e293b;color:#fff;display:none;">
        <span style="width:8px;height:8px;border-radius:50%;background:#10b981;"></span>
        <span id="a101-dock-label" style="max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">Chat</span>
      </button>
      <button id="a101-dock-menu" class="a101-dock-btn" style="background:#2563eb;color:#fff;">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>
        <span>Chat</span>
        <span id="a101-badge" style="display:none;background:#ef4444;color:#fff;border-radius:10px;padding:1px 6px;font-size:10px;">0</span>
      </button>
    </div>
  `;
  document.body.appendChild(root);

  const menuEl = document.getElementById('a101-menu');
  const bodyEl = document.getElementById('a101-body');
  const msgsEl = document.getElementById('a101-msgs');
  const dockBodyBtn = document.getElementById('a101-dock-body');
  const badgeEl = document.getElementById('a101-badge');

  function checkTheme() {
    const isDark = document.documentElement.getAttribute('data-bs-theme') === 'dark' || document.body.classList.contains('dark-theme');
    menuEl.classList.toggle('a101-dark', isDark);
    bodyEl.classList.toggle('a101-dark', isDark);
  }

  function setWindow(win) {
    checkTheme();
    menuEl.style.display = win === 'menu' ? 'flex' : 'none';
    bodyEl.style.display = win === 'body' ? 'flex' : 'none';
    if (win === 'body' && activeChat.id) {
      dockBodyBtn.style.display = 'flex';
      if (!document.hidden && document.hasFocus()) {
        markRead(activeChat.id);
      }
      loadMsgs(activeChat.id);
    }
  }

  window.addEventListener('focus', () => {
    if (bodyEl.style.display !== 'none' && activeChat.id) {
      markRead(activeChat.id);
    }
  });

  document.getElementById('a101-dock-menu').onclick = () => setWindow(menuEl.style.display === 'none' ? 'menu' : 'none');
  document.getElementById('a101-dock-body').onclick = () => setWindow(bodyEl.style.display === 'none' ? 'body' : 'none');
  document.getElementById('a101-close-menu').onclick = () => setWindow('none');
  document.getElementById('a101-close-body').onclick = () => setWindow('none');
  document.getElementById('a101-btn-groups').onclick = () => setWindow('menu');

  // 5. Mark Read API
  async function markRead(chatId) {
    if (!chatId) return;
    postData(api.read, { chat_id: chatId }).catch(() => {});
  }

  // 6. Resolve Accurate Sender Name & Load Messages
  let isFetchingMsgs = false;
  async function loadMsgs(chatId) {
    if (!chatId || isFetchingMsgs) return;
    isFetchingMsgs = true;
    try {
      const res = await postData(api.msgs, { chat_id: chatId, offset: 0 });
      if (!res.ok) return;
      const data = await res.json();
      
      if (data.member?.id) myMemberId = data.member.id;

      const membersText = data.chat?.members || data.members_text || document.getElementById('group-members-under-title')?.textContent?.trim();
      if (membersText) {
        activeChat.members = membersText;
        const subEl = document.getElementById('a101-head-members');
        if (subEl) subEl.textContent = membersText;
      }

      if (!Array.isArray(data.items)) return;

      const items = data.items.sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
      const previousCount = lastKnownMsgCountPerChat[chatId];
      const currentCount = items.length;
      lastKnownMsgCountPerChat[chatId] = currentCount;

      // Check if new incoming message arrived in active chat
      if (typeof previousCount === 'number' && currentCount > previousCount) {
        const latestMsg = items[items.length - 1];
        const isMe = (myMemberId && latestMsg.member_id == myMemberId) || latestMsg.is_me === true;
        
        if (!isMe && (document.hidden || !document.hasFocus() || bodyEl.style.display === 'none')) {
          const senderName = resolveSenderName(latestMsg, false);
          playAlert(senderName, latestMsg.text);
        } else if (!isMe && !document.hidden && document.hasFocus() && bodyEl.style.display !== 'none') {
          markRead(chatId);
        }
      }

      const sig = chatId + '_' + items.length + '_' + (items[items.length - 1]?.id || '');
      if (sig !== lastMsgSig) {
        lastMsgSig = sig;
        renderMsgs(items);
      }
    } catch (e) {
    } finally {
      isFetchingMsgs = false;
    }
  }

  function resolveSenderName(m, isMe) {
    if (isMe) return 'You';
    return m.member?.user?.name || 
           m.member?.name || 
           m.user?.name || 
           (m.member?.user?.first_name ? (m.member.user.first_name + ' ' + (m.member.user.last_name || '')) : '') || 
           m.sender_name || 
           'Member';
  }

  function renderMsgs(items) {
    if (!items.length) {
      msgsEl.innerHTML = '<div style="padding:24px;text-align:center;color:#64748b;font-size:12px;">No messages yet. Send one below!</div>';
      return;
    }
    msgsEl.innerHTML = items.map(m => {
      const isMe = (myMemberId && m.member_id == myMemberId) || m.is_me === true;
      const sender = resolveSenderName(m, isMe);
      const color = getSenderColor(sender);
      const initials = getInitials(sender);
      const time = new Date(m.created_at || Date.now()).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
      const safeText = document.createElement('div');
      safeText.textContent = m.text || '';
      
      return `<div class="a101-msg-row ${isMe ? 'is-out' : 'is-in'}">${!isMe ? `<div class="a101-avatar" style="background:${color};">${initials}</div>` : ''}<div class="a101-bubble ${isMe ? 'a101-out' : 'a101-in'}">${!isMe ? `<span class="a101-sender" style="color:${color} !important;">${sender}</span>` : ''}<span>${safeText.innerHTML}</span><span class="a101-time">${time}</span></div>${isMe ? `<div class="a101-avatar-out">ME</div>` : ''}</div>`;
    }).join('');
    msgsEl.scrollTop = msgsEl.scrollHeight;
  }

  // 7. Fast Send Message
  document.getElementById('a101-send-form').onsubmit = async (e) => {
    e.preventDefault();
    const input = document.getElementById('a101-msg-input');
    const text = input.value.trim();
    if (!text || !activeChat.id) return;
    input.value = '';

    // Optimistic append
    const time = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    const row = document.createElement('div');
    row.className = 'a101-msg-row is-out';
    row.innerHTML = `<div class="a101-bubble a101-out"><span>${text.replace(/</g, '&lt;')}</span><span class="a101-time">${time} · sending...</span></div><div class="a101-avatar-out">ME</div>`;
    msgsEl.appendChild(row);
    msgsEl.scrollTop = msgsEl.scrollHeight;

    await postData(api.send, { chat_id: activeChat.id, text });
    setTimeout(() => loadMsgs(activeChat.id), 250);
  };

  // 8. Load & Deduplicate Group Contacts
  let isFetchingChats = false;
  async function loadChats() {
    if (isFetchingChats) return;
    isFetchingChats = true;
    try {
      let raw = Array.from(document.querySelectorAll('#chat-list .chat-contact-list-item, #outer-chat-list .chat-contact-list-item'));
      if (!raw.length) {
        const res = await postData(api.chats, { page: 0, channel_type: '', search: '' });
        if (res.ok) {
          const d = await res.json();
          if (d?.html) {
            const parser = new DOMParser();
            raw = Array.from(parser.parseFromString('<div>' + d.html + '</div>', 'text/html').querySelectorAll('.chat-contact-list-item, li[data-chat_id]'));
          }
        }
      }

      const seen = new Set();
      const chats = [];
      let totalUnread = 0;

      raw.forEach(el => {
        const id = el.getAttribute('data-chat_id') || el.id?.replace(/^(inner_|outer_)/, '');
        if (!id || seen.has(id)) return;
        seen.add(id);

        const isOpenAndFocused = bodyEl.style.display !== 'none' && activeChat.id === id && !document.hidden && document.hasFocus();
        const badge = el.querySelector('.group-seen');
        const unread = isOpenAndFocused ? 0 : (parseInt(badge?.textContent || el.getAttribute('data-unread_count') || '0', 10) || 0);
        totalUnread += unread;

        chats.push({
          id,
          name: el.querySelector('.chat-title, .chat-contact-name, h6')?.textContent?.trim() || 'Group',
          img: el.querySelector('img')?.src || base + '/storage/uploads/1762346132_logo-small.png',
          bio: el.getAttribute('data-chat_bio') || 'Arabic101',
          members: el.getAttribute('data-members') || '',
          unread
        });
      });

      const sig = chats.map(c => c.id + ':' + c.unread).join('|');
      if (sig !== lastChatSig && chats.length) {
        lastChatSig = sig;
        if (!activeChat.id && chats[0]) activeChat = chats[0];
        renderContacts(chats);
      }

      if (!isFirst && totalUnread > lastUnread) {
        playAlert('Arabic101 Chat', 'You have new unread messages');
      }
      isFirst = false;
      lastUnread = totalUnread;

      badgeEl.textContent = totalUnread > 99 ? '99+' : totalUnread;
      badgeEl.style.display = totalUnread > 0 ? 'inline-block' : 'none';
    } catch (e) {
    } finally {
      isFetchingChats = false;
    }
  }

  function renderContacts(chats) {
    const listEl = document.getElementById('a101-contacts');
    listEl.innerHTML = chats.map(c => `
      <div class="a101-item" data-id="${c.id}">
        <img src="${c.img}" width="32" height="32" style="border-radius:50%;object-fit:cover;flex-shrink:0;">
        <div style="flex:1;min-width:0;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <strong style="font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${c.name}</strong>
            ${c.unread > 0 ? `<span style="background:#2563eb;color:#fff;border-radius:10px;padding:0 6px;font-size:10px;font-weight:700;">${c.unread}</span>` : ''}
          </div>
          <div style="font-size:10.5px;color:#64748b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${c.members || c.bio}</div>
        </div>
      </div>
    `).join('');

    listEl.querySelectorAll('.a101-item').forEach(item => {
      item.onclick = () => {
        const id = item.getAttribute('data-id');
        const c = chats.find(x => x.id === id);
        if (!c) return;
        activeChat = c;
        document.getElementById('a101-head-name').textContent = c.name;
        document.getElementById('a101-dock-label').textContent = c.name;
        document.getElementById('a101-head-img').src = c.img;
        document.getElementById('a101-head-members').textContent = c.members || c.bio || 'Arabic101';
        setWindow('body');
      };
    });
  }

  // Filter contacts
  document.getElementById('a101-search').oninput = (e) => {
    const q = e.target.value.toLowerCase().trim();
    document.querySelectorAll('#a101-contacts .a101-item').forEach(el => {
      el.style.display = el.textContent.toLowerCase().includes(q) ? 'flex' : 'none';
    });
  };

  // 9. 3-Second Background Loop
  function sync() {
    checkTheme();
    loadChats();
    if (activeChat.id) {
      loadMsgs(activeChat.id);
    }
  }

  sync();
  setInterval(sync, 3000);
})();
