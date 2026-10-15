/**
 * Gemini Aura - Main Frontend Logic
 * Supports streaming, multi-turn chat, sessions, markdown, code copy, and Supabase cloud sync.
 */

(() => {
  'use strict';

  // -------------------------------------------------------------------------
  // Preset Personas
  // -------------------------------------------------------------------------
  const PERSONA_PROMPTS = {
    helpful: 'You are Gemini Aura, an intelligent, helpful, and friendly AI assistant powered by Google Gemini. Provide clear, accurate, and insightful answers with markdown formatting.',
    coder: 'You are a Senior Full-Stack Software Architect and Principal Engineer. Provide idiomatic, clean, secure, and production-ready code with concise explanations, modern best practices, and edge-case awareness.',
    concise: 'You are an ultra-concise expert. Answer directly and precisely with no fluff, filler words, or repetitive preamble. Use bullet points and brief code snippets when applicable.',
    tutor: 'You are an encouraging and insightful Socratic tutor. Guide the user step by step, explain complex concepts using simple analogies, and verify understanding.',
    creative: 'You are an inventive creative director and startup strategist. Generate bold, novel, and high-impact ideas with actionable execution angles and fresh perspectives.'
  };

  const PERSONA_LABELS = {
    helpful: 'Default Assistant',
    coder: 'Senior Full-Stack Engineer',
    concise: 'Concise Explainer',
    tutor: 'Socratic Tutor',
    creative: 'Creative Strategist'
  };

  // -------------------------------------------------------------------------
  // Application State
  // -------------------------------------------------------------------------
  const state = {
    sessions: [],
    currentSessionId: null,
    isGenerating: false,
    abortController: null,
    backendOnline: false,
    backendHasKey: false,
    supabaseOnline: false,
    supabaseClient: null,
    config: {
      apiKey: localStorage.getItem('gemini_custom_key') || '',
      backendUrl: localStorage.getItem('gemini_backend_url') || 'http://localhost:5000',
      streaming: localStorage.getItem('gemini_streaming') !== 'false',
      customSystemPrompt: localStorage.getItem('gemini_custom_system_prompt') || '',
      supabaseUrl: localStorage.getItem('supabase_url') || '',
      supabaseAnonKey: localStorage.getItem('supabase_anon_key') || ''
    }
  };

  // -------------------------------------------------------------------------
  // DOM Elements
  // -------------------------------------------------------------------------
  const elements = {
    // Layout & Navigation
    sidebar: document.getElementById('sidebar'),
    sidebarToggleBtn: document.getElementById('sidebar-toggle-btn'),
    mobileSidebarToggle: document.getElementById('mobile-sidebar-toggle'),
    newChatBtn: document.getElementById('new-chat-btn'),
    chatHistoryList: document.getElementById('chat-history-list'),
    clearAllHistoryBtn: document.getElementById('clear-all-history-btn'),

    // Meta displays
    currentChatTitle: document.getElementById('current-chat-title'),
    activeModelDisplay: document.getElementById('active-model-display'),
    activePersonaDisplay: document.getElementById('active-persona-display'),
    keyPillBtn: document.getElementById('key-pill-btn'),
    keyStatusText: document.getElementById('key-status-text'),
    supabasePillBtn: document.getElementById('supabase-pill-btn'),
    supabaseStatusText: document.getElementById('supabase-status-text'),
    syncSupabaseBtn: document.getElementById('sync-supabase-btn'),
    statusDot: document.getElementById('status-dot'),
    statusText: document.getElementById('status-text'),

    // Selectors
    modelSelector: document.getElementById('model-selector'),
    personaSelector: document.getElementById('persona-selector'),
    temperatureSlider: document.getElementById('temperature-slider'),
    temperatureVal: document.getElementById('temperature-val'),

    // Chat Containers
    chatMessagesContainer: document.getElementById('chat-messages-container'),
    welcomeHero: document.getElementById('welcome-hero'),
    messagesList: document.getElementById('messages-list'),

    // Actions
    exportChatBtn: document.getElementById('export-chat-btn'),
    clearCurrentChatBtn: document.getElementById('clear-current-chat-btn'),

    // Input & Form
    promptForm: document.getElementById('prompt-form'),
    promptInput: document.getElementById('prompt-input'),
    sendBtn: document.getElementById('send-btn'),
    stopGenBtn: document.getElementById('stop-generation-btn'),
    charCount: document.getElementById('char-count'),
    streamingStatusLabel: document.getElementById('streaming-status-label'),
    apiKeyBanner: document.getElementById('api-key-banner'),
    bannerSetKeyBtn: document.getElementById('banner-set-key-btn'),

    // Modal
    settingsModal: document.getElementById('settings-modal'),
    openSettingsBtn: document.getElementById('open-settings-modal-btn'),
    closeSettingsBtn: document.getElementById('close-settings-modal-btn'),
    geminiApiKeyInput: document.getElementById('gemini-api-key-input'),
    toggleKeyVisibilityBtn: document.getElementById('toggle-key-visibility-btn'),
    backendUrlInput: document.getElementById('backend-url-input'),
    streamingToggle: document.getElementById('streaming-toggle'),
    customSystemPromptInput: document.getElementById('custom-system-prompt'),
    supabaseUrlInput: document.getElementById('supabase-url-input'),
    supabaseAnonKeyInput: document.getElementById('supabase-anon-key-input'),
    testSupabaseBtn: document.getElementById('test-supabase-btn'),
    loadSupabaseChatsBtn: document.getElementById('load-supabase-chats-btn'),
    clearApiKeyBtn: document.getElementById('clear-api-key-btn'),
    saveSettingsBtn: document.getElementById('save-settings-btn'),

    // Toasts
    toastContainer: document.getElementById('toast-container')
  };

  // -------------------------------------------------------------------------
  // Markdown Configuration
  // -------------------------------------------------------------------------
  function setupMarkdown() {
    if (typeof marked !== 'undefined') {
      marked.setOptions({
        breaks: true,
        gfm: true,
        highlight: (code, lang) => {
          if (typeof hljs !== 'undefined' && lang && hljs.getLanguage(lang)) {
            try {
              return hljs.highlight(code, { language: lang }).value;
            } catch (err) {
              console.error(err);
            }
          }
          if (typeof hljs !== 'undefined') {
            try {
              return hljs.highlightAuto(code).value;
            } catch (err) {
              console.error(err);
            }
          }
          return escapeHtml(code);
        }
      });
    }
  }

  function renderMarkdown(content) {
    if (typeof marked !== 'undefined') {
      try {
        let html = marked.parse(content);
        html = enhanceCodeBlocks(html);
        return html;
      } catch (e) {
        console.error('Markdown parse error:', e);
        return escapeHtml(content).replace(/\n/g, '<br>');
      }
    }
    return escapeHtml(content).replace(/\n/g, '<br>');
  }

  function enhanceCodeBlocks(html) {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;

    const preElements = tempDiv.querySelectorAll('pre');
    preElements.forEach((pre) => {
      const codeElem = pre.querySelector('code');
      if (!codeElem) return;

      const classList = codeElem.className || '';
      const match = classList.match(/language-(\w+)/);
      const language = match ? match[1] : 'code';

      const container = document.createElement('div');
      container.className = 'code-block-container';

      const header = document.createElement('div');
      header.className = 'code-block-header';
      header.innerHTML = `
        <span class="code-lang">${language}</span>
        <button class="copy-code-btn" type="button">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
          <span>Copy</span>
        </button>
      `;

      pre.parentNode.insertBefore(container, pre);
      container.appendChild(header);
      container.appendChild(pre);

      const copyBtn = header.querySelector('.copy-code-btn');
      copyBtn.addEventListener('click', () => {
        const rawCode = codeElem.innerText;
        navigator.clipboard.writeText(rawCode).then(() => {
          copyBtn.innerHTML = `
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="2.5">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            <span style="color:#10B981;">Copied!</span>
          `;
          setTimeout(() => {
            copyBtn.innerHTML = `
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
              <span>Copy</span>
            `;
          }, 2000);
        }).catch(() => {
          showToast('Failed to copy code', 'error');
        });
      });
    });

    return tempDiv.innerHTML;
  }

  function escapeHtml(string) {
    const entityMap = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    };
    return String(string).replace(/[&<>"']/g, s => entityMap[s]);
  }

  // -------------------------------------------------------------------------
  // Session Storage & Management
  // -------------------------------------------------------------------------
  function loadSessions() {
    try {
      const raw = localStorage.getItem('gemini_chat_sessions');
      state.sessions = raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.error('Failed to load sessions:', e);
      state.sessions = [];
    }

    if (state.sessions.length === 0) {
      createNewSession();
    } else {
      switchSession(state.sessions[0].id);
    }
  }

  function saveSessions() {
    try {
      localStorage.setItem('gemini_chat_sessions', JSON.stringify(state.sessions));
    } catch (e) {
      console.error('Failed to save sessions:', e);
    }
    renderHistoryList();
  }

  function createNewSession() {
    let initialModel = elements.modelSelector.value;
    if (!initialModel || initialModel === 'gemini-2.5-flash') {
      initialModel = 'gemini-3.8-flash';
    }

    const newSession = {
      id: 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      title: 'New Conversation',
      messages: [],
      createdAt: new Date().toISOString(),
      model: initialModel,
      persona: elements.personaSelector.value,
      temperature: parseFloat(elements.temperatureSlider.value)
    };

    state.sessions.unshift(newSession);
    saveSessions();
    switchSession(newSession.id);
    elements.promptInput.focus();
  }

  function switchSession(sessionId) {
    state.currentSessionId = sessionId;
    const session = getCurrentSession();
    if (!session) return;

    // Migrate deprecated models to modern Gemini 3.8 Flash
    if (!session.model || session.model === 'gemini-2.5-flash') {
      session.model = 'gemini-3.8-flash';
    } else if (session.model === 'gemini-2.5-pro') {
      session.model = 'gemini-3.8-pro';
    }

    if (session.model) elements.modelSelector.value = session.model;
    if (session.persona) elements.personaSelector.value = session.persona;
    if (typeof session.temperature === 'number') {
      elements.temperatureSlider.value = session.temperature;
      elements.temperatureVal.textContent = session.temperature.toFixed(1);
    }

    updateHeaderMeta();
    renderMessages();
    renderHistoryList();

    elements.sidebar.classList.remove('mobile-open');
  }

  function getCurrentSession() {
    return state.sessions.find(s => s.id === state.currentSessionId) || state.sessions[0];
  }

  function deleteSession(sessionId, event) {
    if (event) event.stopPropagation();

    // If Supabase is connected, optionally delete from cloud too
    if (state.supabaseOnline) {
      fetch(`${state.config.backendUrl.replace(/\/$/, '')}/api/supabase/sessions/${sessionId}`, {
        method: 'DELETE'
      }).catch(err => console.warn('Supabase session delete warning:', err));
    }

    state.sessions = state.sessions.filter(s => s.id !== sessionId);
    if (state.sessions.length === 0) {
      createNewSession();
    } else if (state.currentSessionId === sessionId) {
      switchSession(state.sessions[0].id);
    } else {
      saveSessions();
    }
    showToast('Conversation deleted', 'info');
  }

  function clearAllSessions() {
    if (confirm('Are you sure you want to delete all conversation history?')) {
      state.sessions = [];
      localStorage.removeItem('gemini_chat_sessions');
      createNewSession();
      showToast('All chat history cleared', 'info');
    }
  }

  function clearCurrentChat() {
    const session = getCurrentSession();
    if (!session || session.messages.length === 0) return;

    if (confirm('Clear messages in this conversation?')) {
      session.messages = [];
      session.title = 'New Conversation';
      saveSessions();
      renderMessages();
      updateHeaderMeta();
      showToast('Current conversation cleared', 'info');
    }
  }

  // -------------------------------------------------------------------------
  // Rendering UI
  // -------------------------------------------------------------------------
  function renderHistoryList() {
    const list = elements.chatHistoryList;
    list.innerHTML = '';

    if (state.sessions.length === 0) {
      list.innerHTML = `<div class="history-empty-notice">No conversations yet</div>`;
      return;
    }

    state.sessions.forEach(session => {
      const item = document.createElement('div');
      item.className = `history-item ${session.id === state.currentSessionId ? 'active' : ''}`;
      item.innerHTML = `
        <span class="history-title-text" title="${escapeHtml(session.title)}">${escapeHtml(session.title)}</span>
        <button class="history-delete-btn" title="Delete conversation" aria-label="Delete conversation">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      `;

      item.addEventListener('click', () => switchSession(session.id));
      const deleteBtn = item.querySelector('.history-delete-btn');
      deleteBtn.addEventListener('click', (e) => deleteSession(session.id, e));

      list.appendChild(item);
    });
  }

  function renderMessages() {
    const session = getCurrentSession();
    if (!session || session.messages.length === 0) {
      elements.welcomeHero.classList.remove('hidden');
      elements.messagesList.innerHTML = '';
      return;
    }

    elements.welcomeHero.classList.add('hidden');
    elements.messagesList.innerHTML = '';

    session.messages.forEach(msg => {
      appendMessageToDOM(msg.role, msg.text, msg.timestamp, false);
    });

    scrollToBottom();
  }

  function appendMessageToDOM(role, text, timestamp = new Date().toISOString(), isStreaming = false) {
    elements.welcomeHero.classList.add('hidden');

    const row = document.createElement('article');
    row.className = `message-row ${role}`;
    row.id = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;

    const formattedTime = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const avatarHtml = role === 'assistant' 
      ? `✨` 
      : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`;

    const bubbleContent = role === 'assistant' ? renderMarkdown(text) : escapeHtml(text).replace(/\n/g, '<br>');

    row.innerHTML = `
      <div class="message-avatar" aria-hidden="true">${avatarHtml}</div>
      <div class="message-content-wrapper">
        <div class="message-meta">
          <span>${role === 'assistant' ? 'Gemini Aura' : 'You'}</span>
          <span>•</span>
          <time datetime="${timestamp}">${formattedTime}</time>
        </div>
        <div class="message-bubble" id="${row.id}-bubble">
          ${bubbleContent}${isStreaming ? '<span class="streaming-cursor"></span>' : ''}
        </div>
        <div class="message-actions">
          <button class="bubble-action-btn copy-msg-btn" title="Copy message text">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            <span>Copy</span>
          </button>
        </div>
      </div>
    `;

    elements.messagesList.appendChild(row);

    const copyBtn = row.querySelector('.copy-msg-btn');
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(text).then(() => {
        showToast('Message copied to clipboard', 'success');
      });
    });

    scrollToBottom();
    return row;
  }

  function updateHeaderMeta() {
    const session = getCurrentSession();
    if (!session) return;

    elements.currentChatTitle.textContent = session.title || 'New Conversation';
    
    const selectedModel = elements.modelSelector.options[elements.modelSelector.selectedIndex]?.text || elements.modelSelector.value;
    elements.activeModelDisplay.textContent = selectedModel.split('(')[0].trim();

    const personaKey = elements.personaSelector.value;
    elements.activePersonaDisplay.textContent = PERSONA_LABELS[personaKey] || 'Default Assistant';
  }

  function scrollToBottom() {
    requestAnimationFrame(() => {
      elements.chatMessagesContainer.scrollTop = elements.chatMessagesContainer.scrollHeight;
    });
  }

  // -------------------------------------------------------------------------
  // Sending Chat & Handling Responses
  // -------------------------------------------------------------------------
  async function sendMessage() {
    const rawText = elements.promptInput.value.trim();
    if (!rawText || state.isGenerating) return;

    elements.promptInput.value = '';
    adjustTextareaHeight(elements.promptInput);
    updateCharCount();

    const session = getCurrentSession();
    if (!session) return;

    if (session.messages.length === 0) {
      session.title = rawText.length > 38 ? rawText.substring(0, 38) + '...' : rawText;
      updateHeaderMeta();
    }

    const userMsg = {
      role: 'user',
      text: rawText,
      timestamp: new Date().toISOString()
    };
    session.messages.push(userMsg);
    appendMessageToDOM('user', rawText, userMsg.timestamp, false);
    saveSessions();

    const model = elements.modelSelector.value;
    const persona = elements.personaSelector.value;
    const temperature = parseFloat(elements.temperatureSlider.value);
    const systemInstruction = state.config.customSystemPrompt || PERSONA_PROMPTS[persona] || PERSONA_PROMPTS.helpful;

    const effectiveKey = state.config.apiKey.trim();
    if (!effectiveKey && !state.backendHasKey) {
      elements.apiKeyBanner.classList.remove('hidden');
      openSettingsModal();
      showToast('Please provide your Gemini API key to start chatting.', 'warning');
      return;
    }

    session.model = model;
    session.persona = persona;
    session.temperature = temperature;

    const historyPayload = session.messages.slice(0, -1).map(m => ({
      role: m.role,
      text: m.text
    }));

    setGeneratingState(true);

    if (state.config.streaming) {
      await handleStreamingResponse({
        message: rawText,
        history: historyPayload,
        model,
        systemInstruction,
        temperature,
        session
      });
    } else {
      await handleStandardResponse({
        message: rawText,
        history: historyPayload,
        model,
        systemInstruction,
        temperature,
        session
      });
    }

    // Auto-sync to Supabase if connected
    if (state.supabaseOnline) {
      syncCurrentChatToSupabase(false);
    }
  }

  // Real-time SSE Streaming
  async function handleStreamingResponse({ message, history, model, systemInstruction, temperature, session }) {
    state.abortController = new AbortController();

    const assistantMsg = {
      role: 'assistant',
      text: '',
      timestamp: new Date().toISOString()
    };

    const row = appendMessageToDOM('assistant', '', assistantMsg.timestamp, true);
    const bubble = row.querySelector('.message-bubble');

    const requestHeaders = {
      'Content-Type': 'application/json'
    };
    if (state.config.apiKey) {
      requestHeaders['x-gemini-api-key'] = state.config.apiKey;
    }

    const endpoint = `${state.config.backendUrl.replace(/\/$/, '')}/api/chat/stream`;

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify({
          message,
          history,
          model,
          systemInstruction,
          temperature,
          apiKey: state.config.apiKey || undefined
        }),
        signal: state.abortController.signal
      });

      if (!response.ok) {
        let errMessage = `Server error ${response.status}`;
        try {
          const errData = await response.json();
          errMessage = errData.message || errData.error || errMessage;
        } catch (_) {}
        throw new Error(errMessage);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data:')) continue;

          const dataStr = trimmed.slice(5).trim();
          if (dataStr === '[DONE]') {
            break;
          }

          try {
            const parsed = JSON.parse(dataStr);
            if (parsed.error) {
              throw new Error(parsed.error);
            }
            if (parsed.text) {
              assistantMsg.text += parsed.text;
              bubble.innerHTML = `${renderMarkdown(assistantMsg.text)}<span class="streaming-cursor"></span>`;
              scrollToBottom();
            }
          } catch (jsonErr) {
            console.error('Error parsing SSE line:', line, jsonErr);
          }
        }
      }

      bubble.innerHTML = renderMarkdown(assistantMsg.text);
      session.messages.push(assistantMsg);
      saveSessions();
    } catch (error) {
      if (error.name === 'AbortError') {
        assistantMsg.text += '\n\n*(Generation stopped by user)*';
        bubble.innerHTML = renderMarkdown(assistantMsg.text);
        session.messages.push(assistantMsg);
        saveSessions();
        showToast('Generation cancelled', 'info');
      } else {
        console.error('Stream failure:', error);
        bubble.innerHTML = `
          <div style="color: #FB7185; display:flex; flex-direction:column; gap:6px;">
            <strong>⚠️ Error from Gemini:</strong>
            <span>${escapeHtml(error.message)}</span>
            <small style="color: #94A3B8;">Check your API key and backend connection in Settings.</small>
          </div>
        `;
        showToast(error.message, 'error');
      }
    } finally {
      setGeneratingState(false);
      state.abortController = null;
    }
  }

  // Standard Non-streaming
  async function handleStandardResponse({ message, history, model, systemInstruction, temperature, session }) {
    state.abortController = new AbortController();

    const assistantMsg = {
      role: 'assistant',
      text: '',
      timestamp: new Date().toISOString()
    };

    const row = appendMessageToDOM('assistant', 'Thinking...', assistantMsg.timestamp, true);
    const bubble = row.querySelector('.message-bubble');

    const requestHeaders = {
      'Content-Type': 'application/json'
    };
    if (state.config.apiKey) {
      requestHeaders['x-gemini-api-key'] = state.config.apiKey;
    }

    const endpoint = `${state.config.backendUrl.replace(/\/$/, '')}/api/chat`;

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify({
          message,
          history,
          model,
          systemInstruction,
          temperature,
          apiKey: state.config.apiKey || undefined
        }),
        signal: state.abortController.signal
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || data.error || `HTTP error ${response.status}`);
      }

      assistantMsg.text = data.reply;
      bubble.innerHTML = renderMarkdown(assistantMsg.text);
      session.messages.push(assistantMsg);
      saveSessions();
    } catch (error) {
      if (error.name === 'AbortError') {
        bubble.innerHTML = '<em>(Request cancelled)</em>';
      } else {
        console.error('Fetch error:', error);
        bubble.innerHTML = `
          <div style="color: #FB7185; display:flex; flex-direction:column; gap:6px;">
            <strong>⚠️ Error from Gemini:</strong>
            <span>${escapeHtml(error.message)}</span>
          </div>
        `;
        showToast(error.message, 'error');
      }
    } finally {
      setGeneratingState(false);
      state.abortController = null;
    }
  }

  function setGeneratingState(isGen) {
    state.isGenerating = isGen;
    elements.sendBtn.disabled = isGen;
    if (isGen) {
      elements.stopGenBtn.classList.remove('hidden');
    } else {
      elements.stopGenBtn.classList.add('hidden');
    }
  }

  function stopGeneration() {
    if (state.abortController) {
      state.abortController.abort();
    }
  }

  // -------------------------------------------------------------------------
  // Backend & Supabase Health Checks
  // -------------------------------------------------------------------------
  async function checkBackendHealth() {
    elements.statusDot.className = 'status-indicator-dot';
    elements.statusText.textContent = 'Checking backend...';

    const healthUrl = `${state.config.backendUrl.replace(/\/$/, '')}/api/health`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const res = await fetch(healthUrl, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        state.backendOnline = true;
        state.backendHasKey = Boolean(data.hasApiKey);

        elements.statusDot.className = 'status-indicator-dot online';
        elements.statusText.textContent = 'Backend Online';

        updateKeyStatusUI();
      } else {
        throw new Error('Non-200 health response');
      }
    } catch (e) {
      state.backendOnline = false;
      elements.statusDot.className = 'status-indicator-dot offline';
      elements.statusText.textContent = 'Backend Offline';
      updateKeyStatusUI();
    }

    // Also check backend config & Supabase status
    checkBackendConfigAndSupabase();
  }

  async function checkBackendConfigAndSupabase() {
    const configUrl = `${state.config.backendUrl.replace(/\/$/, '')}/api/config`;
    try {
      const res = await fetch(configUrl);
      if (res.ok) {
        const configData = await res.json();
        
        // Auto-populate Supabase credentials from backend .ev/.env if user has not overridden them locally
        if (configData.supabaseUrl && !state.config.supabaseUrl) {
          state.config.supabaseUrl = configData.supabaseUrl;
          elements.supabaseUrlInput.value = configData.supabaseUrl;
        }
        if (configData.supabaseAnonKey && !state.config.supabaseAnonKey) {
          state.config.supabaseAnonKey = configData.supabaseAnonKey;
          elements.supabaseAnonKeyInput.value = configData.supabaseAnonKey;
        }

        // Check Supabase connection status
        checkSupabaseStatus();
      }
    } catch (e) {
      console.warn('Config fetch warning:', e.message);
    }
  }

  async function checkSupabaseStatus() {
    const statusUrl = `${state.config.backendUrl.replace(/\/$/, '')}/api/supabase/status`;
    try {
      const res = await fetch(statusUrl);
      if (res.ok) {
        const data = await res.json();
        if (data.connected) {
          state.supabaseOnline = true;
          elements.supabasePillBtn.className = 'key-pill-btn supabase-pill-btn connected';
          elements.supabaseStatusText.textContent = 'Supabase: Synced';
          elements.supabasePillBtn.title = 'Supabase connected! Conversations can be synced to cloud.';
        } else {
          state.supabaseOnline = false;
          elements.supabasePillBtn.className = 'key-pill-btn supabase-pill-btn';
          elements.supabaseStatusText.textContent = 'Supabase: Ready';
          elements.supabasePillBtn.title = data.message || 'Supabase not connected. Click to configure credentials.';
        }
      }
    } catch (e) {
      state.supabaseOnline = false;
      elements.supabasePillBtn.className = 'key-pill-btn supabase-pill-btn';
      elements.supabaseStatusText.textContent = 'Supabase: Offline';
    }
  }

  function updateKeyStatusUI() {
    const hasCustomKey = Boolean(state.config.apiKey && state.config.apiKey.trim());
    const isReady = hasCustomKey || state.backendHasKey;

    if (isReady) {
      elements.keyPillBtn.classList.add('configured');
      elements.keyStatusText.textContent = hasCustomKey ? 'Custom Key Active' : 'Server Key Active';
      elements.apiKeyBanner.classList.add('hidden');
    } else {
      elements.keyPillBtn.classList.remove('configured');
      elements.keyStatusText.textContent = 'API Key Required';
      elements.apiKeyBanner.classList.remove('hidden');
    }
  }

  // -------------------------------------------------------------------------
  // Supabase Cloud Actions (Sync & Load)
  // -------------------------------------------------------------------------
  async function syncCurrentChatToSupabase(notify = true) {
    const session = getCurrentSession();
    if (!session) return;

    if (session.messages.length === 0) {
      if (notify) showToast('No messages in this chat to sync.', 'warning');
      return;
    }

    try {
      const syncUrl = `${state.config.backendUrl.replace(/\/$/, '')}/api/supabase/sync`;
      const res = await fetch(syncUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        if (notify) showToast('Conversation synced to Supabase cloud! ☁️', 'success');
        elements.supabasePillBtn.classList.add('connected');
        elements.supabaseStatusText.textContent = 'Supabase: Synced';
      } else {
        if (notify) showToast(data.message || 'Supabase sync failed. Check .ev credentials.', 'error');
      }
    } catch (e) {
      if (notify) showToast('Supabase sync error: ' + e.message, 'error');
    }
  }

  async function loadChatsFromSupabase() {
    try {
      const url = `${state.config.backendUrl.replace(/\/$/, '')}/api/supabase/sessions`;
      const res = await fetch(url);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Failed to fetch sessions from Supabase');
      }

      if (!data.sessions || data.sessions.length === 0) {
        showToast('No saved conversations found in Supabase.', 'info');
        return;
      }

      // Merge cloud sessions with local sessions
      const existingIds = new Set(state.sessions.map(s => s.id));
      let addedCount = 0;

      data.sessions.forEach(cloudSession => {
        if (!existingIds.has(cloudSession.id)) {
          state.sessions.push(cloudSession);
          addedCount++;
        }
      });

      saveSessions();
      renderHistoryList();
      showToast(`Loaded ${addedCount} conversation(s) from Supabase! ☁️`, 'success');
    } catch (e) {
      showToast('Error loading Supabase chats: ' + e.message, 'error');
    }
  }

  async function testSupabaseConnection() {
    elements.testSupabaseBtn.disabled = true;
    elements.testSupabaseBtn.textContent = 'Testing...';

    try {
      const statusUrl = `${state.config.backendUrl.replace(/\/$/, '')}/api/supabase/status`;
      const res = await fetch(statusUrl);
      const data = await res.json();

      if (data.connected) {
        showToast('Supabase connection verified successfully! ✅', 'success');
        elements.supabasePillBtn.className = 'key-pill-btn supabase-pill-btn connected';
        elements.supabaseStatusText.textContent = 'Supabase: Synced';
      } else {
        showToast(data.message || 'Connection check failed. Verify .ev credentials and SQL tables.', 'warning');
      }
    } catch (e) {
      showToast('Connection test error: ' + e.message, 'error');
    } finally {
      elements.testSupabaseBtn.disabled = false;
      elements.testSupabaseBtn.textContent = 'Test Supabase Connection';
    }
  }

  // -------------------------------------------------------------------------
  // Export Chat
  // -------------------------------------------------------------------------
  function exportChat() {
    const session = getCurrentSession();
    if (!session || session.messages.length === 0) {
      showToast('No messages to export', 'warning');
      return;
    }

    let md = `# ${session.title}\n`;
    md += `*Exported from Gemini Aura on ${new Date().toLocaleString()}*\n`;
    md += `*Model: ${session.model} | Persona: ${session.persona}*\n\n---\n\n`;

    session.messages.forEach(msg => {
      const sender = msg.role === 'assistant' ? '🤖 Gemini Aura' : '👤 User';
      const time = new Date(msg.timestamp).toLocaleTimeString();
      md += `### ${sender} (${time})\n\n${msg.text}\n\n`;
    });

    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${session.title.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase() || 'gemini_chat'}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast('Conversation exported as Markdown', 'success');
  }

  // -------------------------------------------------------------------------
  // Settings Modal Handlers
  // -------------------------------------------------------------------------
  function openSettingsModal() {
    elements.geminiApiKeyInput.value = state.config.apiKey;
    elements.backendUrlInput.value = state.config.backendUrl;
    elements.streamingToggle.checked = state.config.streaming;
    elements.customSystemPromptInput.value = state.config.customSystemPrompt;
    elements.supabaseUrlInput.value = state.config.supabaseUrl;
    elements.supabaseAnonKeyInput.value = state.config.supabaseAnonKey;
    elements.settingsModal.classList.remove('hidden');
  }

  function closeSettingsModal() {
    elements.settingsModal.classList.add('hidden');
  }

  function saveSettings() {
    const newKey = elements.geminiApiKeyInput.value.trim();
    const newUrl = elements.backendUrlInput.value.trim() || 'http://localhost:5000';
    const newStreaming = elements.streamingToggle.checked;
    const newPrompt = elements.customSystemPromptInput.value.trim();
    const newSupabaseUrl = elements.supabaseUrlInput.value.trim();
    const newSupabaseKey = elements.supabaseAnonKeyInput.value.trim();

    state.config.apiKey = newKey;
    state.config.backendUrl = newUrl;
    state.config.streaming = newStreaming;
    state.config.customSystemPrompt = newPrompt;
    state.config.supabaseUrl = newSupabaseUrl;
    state.config.supabaseAnonKey = newSupabaseKey;

    localStorage.setItem('gemini_custom_key', newKey);
    localStorage.setItem('gemini_backend_url', newUrl);
    localStorage.setItem('gemini_streaming', String(newStreaming));
    localStorage.setItem('gemini_custom_system_prompt', newPrompt);
    localStorage.setItem('supabase_url', newSupabaseUrl);
    localStorage.setItem('supabase_anon_key', newSupabaseKey);

    elements.streamingStatusLabel.textContent = newStreaming ? 'Stream Mode On' : 'Stream Mode Off';

    updateKeyStatusUI();
    closeSettingsModal();
    checkBackendHealth();
    showToast('Settings saved successfully', 'success');
  }

  function clearStoredKey() {
    elements.geminiApiKeyInput.value = '';
    state.config.apiKey = '';
    localStorage.removeItem('gemini_custom_key');
    updateKeyStatusUI();
    showToast('Stored API key cleared', 'info');
  }

  // -------------------------------------------------------------------------
  // Toast Notifications
  // -------------------------------------------------------------------------
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    let iconSvg = '';
    if (type === 'success') {
      iconSvg = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>';
    } else if (type === 'error') {
      iconSvg = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F43F5E" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>';
    } else {
      iconSvg = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#818CF8" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';
    }

    toast.innerHTML = `${iconSvg}<span>${escapeHtml(message)}</span>`;
    elements.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(40px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3200);
  }

  // -------------------------------------------------------------------------
  // Textarea auto-sizing & event listeners
  // -------------------------------------------------------------------------
  function adjustTextareaHeight(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 180)}px`;
  }

  function updateCharCount() {
    const len = elements.promptInput.value.length;
    elements.charCount.textContent = `${len} / 20000`;
  }

  function setupEventListeners() {
    elements.promptForm.addEventListener('submit', (e) => {
      e.preventDefault();
      sendMessage();
    });

    elements.promptInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    elements.promptInput.addEventListener('input', () => {
      adjustTextareaHeight(elements.promptInput);
      updateCharCount();
    });

    elements.stopGenBtn.addEventListener('click', stopGeneration);
    elements.newChatBtn.addEventListener('click', createNewSession);

    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        createNewSession();
      }
    });

    elements.sidebarToggleBtn.addEventListener('click', () => {
      elements.sidebar.classList.toggle('collapsed');
    });

    elements.mobileSidebarToggle.addEventListener('click', () => {
      elements.sidebar.classList.toggle('mobile-open');
    });

    elements.clearAllHistoryBtn.addEventListener('click', clearAllSessions);
    elements.clearCurrentChatBtn.addEventListener('click', clearCurrentChat);
    elements.exportChatBtn.addEventListener('click', exportChat);

    // Supabase buttons
    elements.syncSupabaseBtn.addEventListener('click', () => syncCurrentChatToSupabase(true));
    elements.supabasePillBtn.addEventListener('click', openSettingsModal);
    elements.testSupabaseBtn.addEventListener('click', testSupabaseConnection);
    elements.loadSupabaseChatsBtn.addEventListener('click', loadChatsFromSupabase);

    document.querySelectorAll('.prompt-starter-card').forEach(card => {
      card.addEventListener('click', () => {
        const prompt = card.getAttribute('data-prompt');
        if (prompt) {
          elements.promptInput.value = prompt;
          adjustTextareaHeight(elements.promptInput);
          updateCharCount();
          sendMessage();
        }
      });
    });

    elements.modelSelector.addEventListener('change', () => {
      const session = getCurrentSession();
      if (session) session.model = elements.modelSelector.value;
      saveSessions();
      updateHeaderMeta();
    });

    elements.personaSelector.addEventListener('change', () => {
      const session = getCurrentSession();
      if (session) session.persona = elements.personaSelector.value;
      saveSessions();
      updateHeaderMeta();
    });

    elements.temperatureSlider.addEventListener('input', () => {
      const val = parseFloat(elements.temperatureSlider.value);
      elements.temperatureVal.textContent = val.toFixed(1);
      const session = getCurrentSession();
      if (session) session.temperature = val;
      saveSessions();
    });

    elements.openSettingsBtn.addEventListener('click', openSettingsModal);
    elements.keyPillBtn.addEventListener('click', openSettingsModal);
    elements.bannerSetKeyBtn.addEventListener('click', openSettingsModal);
    elements.closeSettingsBtn.addEventListener('click', closeSettingsModal);
    elements.saveSettingsBtn.addEventListener('click', saveSettings);
    elements.clearApiKeyBtn.addEventListener('click', clearStoredKey);

    elements.toggleKeyVisibilityBtn.addEventListener('click', () => {
      const input = elements.geminiApiKeyInput;
      input.type = input.type === 'password' ? 'text' : 'password';
    });

    elements.settingsModal.addEventListener('click', (e) => {
      if (e.target === elements.settingsModal) {
        closeSettingsModal();
      }
    });
  }

  // -------------------------------------------------------------------------
  // Initialization
  // -------------------------------------------------------------------------
  function init() {
    setupMarkdown();
    loadSessions();
    setupEventListeners();
    updateHeaderMeta();
    checkBackendHealth();

    setInterval(checkBackendHealth, 30000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
