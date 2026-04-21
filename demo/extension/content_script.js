(function () {
  const INGEST_URL = 'http://127.0.0.1:4000/api/ingest/comment';
  const BRIDGE_EVENT = 'dundao:bilibili-comment-add';
  const HOOK_FLAG = '__DUNDAO_BILIBILI_REPLY_HOOK__';
  const RESPONSE_PATH_RE = /\/x\/v2\/reply\/(?:reply\/)?add(?:[/?#]|$)/;
  const TITLE_SUFFIX_RE = /_哔哩哔哩_bilibili$/u;

  if (window.__DUNDAO_CONTENT_SCRIPT__) {
    return;
  }
  window.__DUNDAO_CONTENT_SCRIPT__ = true;

  function toInteger(value) {
    const numeric = Number(value);
    return Number.isInteger(numeric) ? numeric : null;
  }

  function sanitizeText(value, fallback = '') {
    return typeof value === 'string' && value.trim() ? value.trim() : fallback;
  }

  function sanitizeAvatar(value) {
    if (typeof value !== 'string' || !value.trim()) {
      return 'https://www.bilibili.com/favicon.ico';
    }

    if (value.startsWith('//')) {
      return `https:${value}`;
    }

    return value.trim();
  }

  function chooseAvatar(...values) {
    for (const value of values) {
      if (typeof value === 'string' && value.trim()) {
        return sanitizeAvatar(value);
      }
    }

    return sanitizeAvatar('');
  }

  function ingestComment(detail) {
    const payload = {
      aid: toInteger(detail?.aid),
      rpid: toInteger(detail?.rpid),
      parent_rpid: toInteger(detail?.parent_rpid),
      content: sanitizeText(detail?.content, '(hooked)'),
      video_title: sanitizeText(detail?.video_title, sanitizeText(document.title, 'Bilibili 视频').replace(TITLE_SUFFIX_RE, '')),
      target_creator_mid: toInteger(detail?.target_creator_mid),
      target_creator_name: sanitizeText(detail?.target_creator_name, 'Bilibili UP'),
      target_creator_avatar: sanitizeAvatar(detail?.target_creator_avatar),
      occurred_at: sanitizeText(detail?.occurred_at, new Date().toISOString()),
    };

    if (!payload.aid || !payload.rpid || !payload.target_creator_mid) {
      console.warn('[Dundao] skip ingest/comment due to incomplete payload', payload);
      return;
    }

    fetch(INGEST_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(async (response) => {
        if (response.ok || response.status === 409) {
          return null;
        }

        let reason = response.statusText;
        try {
          const body = await response.json();
          reason = body?.reason || body?.error || reason;
        } catch {
          // ignore json parse failures
        }
        throw new Error(`HTTP ${response.status}: ${reason}`);
      })
      .catch((error) => {
        console.warn('[Dundao] ingest/comment failed', error);
      });
  }

  window.addEventListener(BRIDGE_EVENT, (event) => {
    ingestComment(event.detail);
  });

  const script = document.createElement('script');
  script.dataset.dundaoBridge = 'reply-hook';
  script.textContent = `(() => {
    const bridgeEvent = ${JSON.stringify(BRIDGE_EVENT)};
    const hookFlag = ${JSON.stringify(HOOK_FLAG)};
    const responsePathRe = ${RESPONSE_PATH_RE.toString()};
    const titleSuffixRe = ${TITLE_SUFFIX_RE.toString()};

    if (window[hookFlag]) {
      return;
    }
    window[hookFlag] = true;

    const originalFetch = window.fetch;
    const xhrProto = window.XMLHttpRequest && window.XMLHttpRequest.prototype;
    const originalOpen = xhrProto && xhrProto.open;
    const originalSend = xhrProto && xhrProto.send;

    function toInteger(value) {
      const numeric = Number(value);
      return Number.isInteger(numeric) ? numeric : null;
    }

    function sanitizeText(value, fallback = '') {
      return typeof value === 'string' && value.trim() ? value.trim() : fallback;
    }

    function sanitizeAvatar(value) {
      if (typeof value !== 'string' || !value.trim()) {
        return 'https://www.bilibili.com/favicon.ico';
      }
      if (value.startsWith('//')) {
        return 'https:' + value;
      }
      return value.trim();
    }

    function chooseAvatar(...values) {
      for (const value of values) {
        if (typeof value === 'string' && value.trim()) {
          return sanitizeAvatar(value);
        }
      }

      return sanitizeAvatar('');
    }

    function safeJsonParse(value) {
      if (typeof value !== 'string' || !value.trim()) {
        return null;
      }
      try {
        return JSON.parse(value);
      } catch {
        return null;
      }
    }

    function toAbsoluteUrl(input) {
      try {
        return new URL(String(input), location.href);
      } catch {
        return null;
      }
    }

    function matchesReplyAdd(url) {
      return Boolean(url && responsePathRe.test(url.pathname));
    }

    function parseRequestBody(body) {
      if (!body) {
        return {};
      }

      if (body instanceof URLSearchParams) {
        return Object.fromEntries(body.entries());
      }

      if (typeof body === 'string') {
        try {
          return Object.fromEntries(new URLSearchParams(body).entries());
        } catch {
          return {};
        }
      }

      if (body instanceof FormData) {
        return Object.fromEntries(body.entries());
      }

      return {};
    }

    function findVideoData(state) {
      if (!state || typeof state !== 'object') {
        return {};
      }

      return state.videoData || state.videoInfo || state.archive || {};
    }

    function findOwner(state, videoData) {
      const owner = videoData?.owner || state?.upData || state?.owner || null;
      if (owner && typeof owner === 'object') {
        return owner;
      }

      const staff = Array.isArray(state?.videoStaffs) ? state.videoStaffs[0] : null;
      if (staff && typeof staff === 'object') {
        return {
          mid: staff.mid ?? staff.staff_mid ?? null,
          name: staff.name ?? staff.title ?? null,
          face: staff.face ?? staff.avatar ?? null,
        };
      }

      return {};
    }

    function getPageContext() {
      const state = window.__INITIAL_STATE__ || window.__initialState__ || {};
      const videoData = findVideoData(state);
      const owner = findOwner(state, videoData);

      const aid =
        toInteger(state.aid) ||
        toInteger(videoData.aid) ||
        toInteger(state.videoId) ||
        toInteger(new URLSearchParams(location.search).get('aid'));

      const title =
        sanitizeText(videoData.title) ||
        sanitizeText(document.title.replace(titleSuffixRe, '')) ||
        'Bilibili 视频';

      const ownerName =
        sanitizeText(owner.name) ||
        sanitizeText(document.querySelector('.up-name')?.textContent) ||
        sanitizeText(document.querySelector('[data-user-name]')?.textContent) ||
        'Bilibili UP';

      const ownerAvatar =
        chooseAvatar(
          owner.face,
          document.querySelector('.up-avatar img')?.src,
          document.querySelector('.bili-avatar img')?.src,
        );

      return {
        aid,
        video_title: title,
        target_creator_mid: toInteger(owner.mid),
        target_creator_name: ownerName,
        target_creator_avatar: ownerAvatar,
      };
    }

    function buildPayload(url, requestData, responseText) {
      const parsed = safeJsonParse(responseText);
      if (!parsed || parsed.code !== 0 || !parsed.data) {
        return null;
      }

      const page = getPageContext();
      const replyData = parsed.data.reply && typeof parsed.data.reply === 'object'
        ? parsed.data.reply
        : parsed.data;
      const request = requestData || {};

      const rpid =
        toInteger(replyData.rpid) ||
        toInteger(parsed.data.rpid) ||
        toInteger(replyData.reply?.rpid);
      const parentRpid =
        toInteger(request.parent) ||
        toInteger(request.root) ||
        toInteger(replyData.parent) ||
        toInteger(replyData.parent_rpid) ||
        null;
      const content =
        sanitizeText(replyData.content?.message) ||
        sanitizeText(replyData.reply?.content?.message) ||
        sanitizeText(request.message) ||
        sanitizeText(request.content) ||
        sanitizeText(document.querySelector('.reply-box-textarea')?.value) ||
        '(hooked)';

      return {
        aid: page.aid,
        rpid,
        parent_rpid: parentRpid,
        content,
        video_title: page.video_title,
        target_creator_mid: page.target_creator_mid,
        target_creator_name: page.target_creator_name,
        target_creator_avatar: page.target_creator_avatar,
        occurred_at: new Date().toISOString(),
      };
    }

    function emitPayload(url, requestData, responseText) {
      try {
        const payload = buildPayload(url, requestData, responseText);
        if (!payload || !payload.aid || !payload.rpid || !payload.target_creator_mid) {
          return;
        }

        window.dispatchEvent(new CustomEvent(bridgeEvent, {
          detail: payload,
        }));
      } catch (error) {
        console.warn('[Dundao] page hook parse failed', error);
      }
    }

    if (typeof originalFetch === 'function') {
      window.fetch = async (...args) => {
        const response = await originalFetch.apply(window, args);

        try {
          const input = args[0];
          const init = args[1] || {};
          const url = toAbsoluteUrl(input && input.url ? input.url : input);
          if (matchesReplyAdd(url)) {
            response.clone().text().then((text) => {
              emitPayload(url, parseRequestBody(init.body), text);
            }).catch((error) => {
              console.warn('[Dundao] fetch clone failed', error);
            });
          }
        } catch (error) {
          console.warn('[Dundao] fetch hook failed', error);
        }

        return response;
      };
    }

    if (xhrProto && typeof originalOpen === 'function' && typeof originalSend === 'function') {
      xhrProto.open = function (method, url) {
        this.__dundaoUrl = toAbsoluteUrl(url);
        return originalOpen.apply(this, arguments);
      };

      xhrProto.send = function (body) {
        this.__dundaoBody = parseRequestBody(body);
        this.addEventListener('load', () => {
          try {
            if (matchesReplyAdd(this.__dundaoUrl)) {
              emitPayload(this.__dundaoUrl, this.__dundaoBody, this.responseText);
            }
          } catch (error) {
            console.warn('[Dundao] xhr hook failed', error);
          }
        }, { once: true });

        return originalSend.apply(this, arguments);
      };
    }
  })();`;

  (document.documentElement || document.head || document.body).appendChild(script);
  script.remove();
})();
// ===== T9: MutationObserver =====
(function () {
  const MARKS_URL = 'http://127.0.0.1:4000/api/marks';
  const FRONTEND_URL = 'http://127.0.0.1:5173';
  const BADGE_STYLE_ID = 'dundao-badge-style';
  const ROOT_SELECTORS = ['#commentapp', '.reply-warp', '.reply-list', '#comment'];
  const REPLY_ITEM_SELECTORS = [
    '[data-rpid]',
    '[data-id]',
    '.reply-item',
    '.reply-wrap',
    '.sub-reply-item',
    '.reply-list-item',
  ];
  const ROOT_POLL_MS = 1000;
  const ROOT_POLL_TIMEOUT_MS = 60000;
  const MARKS_DEBOUNCE_MS = 500;
  const MARKS_CACHE = new Map();
  const WARNED_SHADOW_HOSTS = new WeakSet();

  if (window.__DUNDAO_BADGE_INJECTOR__) {
    return;
  }
  window.__DUNDAO_BADGE_INJECTOR__ = true;

  let pendingRpids = new Set();
  let debounceTimer = null;
  let replyObserver = null;

  function ensureBadgeStyle() {
    if (!document.head || document.getElementById(BADGE_STYLE_ID)) {
      return;
    }

    const style = document.createElement('style');
    style.id = BADGE_STYLE_ID;
    style.textContent = `
      .dundao-badge {
        display: inline-flex;
        align-items: center;
        border: 1px solid #cce4ff;
        border-radius: 4px;
        background: #f0f7ff;
        color: #008ac5;
        cursor: pointer;
        font-size: 12px;
        margin-left: 8px;
        padding: 2px 6px;
        vertical-align: middle;
      }

      .dundao-badge:hover {
        background: #e0efff;
      }

      .dundao-badge.pending {
        border-color: #ffe4b5;
        background: #fffaf0;
        color: #ffa500;
      }
    `;
    document.head.prepend(style);
  }

  function describeRoot(root) {
    if (!root) {
      return 'unknown';
    }

    if (root instanceof ShadowRoot) {
      const host = root.host;
      return `shadowRoot(${host?.id || host?.className || host?.tagName || 'host'})`;
    }

    return root.id || root.className || root.tagName;
  }

  function collectQueryRoots() {
    const roots = [document];
    const walker = document.createTreeWalker(document.documentElement || document.body, NodeFilter.SHOW_ELEMENT);

    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node?.shadowRoot instanceof ShadowRoot) {
        if (!WARNED_SHADOW_HOSTS.has(node)) {
          WARNED_SHADOW_HOSTS.add(node);
          console.warn('[Dundao] detected open shadowRoot near comment tree', node);
        }
        roots.push(node.shadowRoot);
      }
    }

    return roots;
  }

  function getReplyRoot() {
    for (const queryRoot of collectQueryRoots()) {
      for (const selector of ROOT_SELECTORS) {
        const root = queryRoot.querySelector(selector);
        if (root?.shadowRoot instanceof ShadowRoot) {
          if (!WARNED_SHADOW_HOSTS.has(root)) {
            WARNED_SHADOW_HOSTS.add(root);
            console.warn('[Dundao] comment host uses open shadowRoot', root);
          }
          return root.shadowRoot;
        }
        if (root) {
          return root;
        }
      }
    }

    return null;
  }

  function getReplyRpid(replyItem) {
    if (!replyItem || replyItem.nodeType !== 1) {
      return null;
    }

    const source = replyItem.matches?.('[data-rpid], [data-id]')
      ? replyItem
      : replyItem.querySelector?.('[data-rpid], [data-id]');
    const rpid = source?.getAttribute('data-rpid') || source?.getAttribute('data-id');
    return typeof rpid === 'string' && rpid.trim() ? rpid.trim() : null;
  }

  function findReplyItems(node) {
    if (!node || ![1, 11].includes(node.nodeType)) {
      return [];
    }

    const seen = new Set();
    const items = [];
    const add = (item) => {
      if (!item || seen.has(item)) {
        return;
      }
      seen.add(item);
      items.push(item);
    };

    if (node.nodeType === 1 && REPLY_ITEM_SELECTORS.some((selector) => node.matches?.(selector))) {
      add(node);
    }

    for (const selector of REPLY_ITEM_SELECTORS) {
      for (const item of Array.from(node.querySelectorAll?.(selector) || [])) {
        add(item);
      }
    }

    return items;
  }

  function findReplyItemByRpid(rpid) {
    if (!rpid) {
      return null;
    }

    for (const queryRoot of collectQueryRoots()) {
      for (const selector of [
        `[data-rpid="${rpid}"]`,
        `[data-id="${rpid}"]`,
        `.reply-item[data-rpid="${rpid}"]`,
        `.reply-item[data-id="${rpid}"]`,
      ]) {
        const item = queryRoot.querySelector(selector);
        if (item) {
          return item;
        }
      }
    }

    return null;
  }

  function injectBadge(rpid, info, replyItem = null) {
    if (!info?.has_my_comment) {
      return;
    }

    const item = replyItem || findReplyItemByRpid(rpid);
    if (!item) {
      return;
    }

    ensureBadgeStyle();

    const infoArea = item.querySelector('.info') || item.querySelector('.reply-info');
    if (!infoArea) {
      return;
    }

    const parentElement = infoArea;
    if (parentElement.querySelector('.dundao-badge')) {
      return;
    }

    const badge = document.createElement('span');
    badge.className = `dundao-badge${info.fulfilled ? '' : ' pending'}`;
    badge.textContent = info.fulfilled ? '✅ 已答' : '⏳ 等待中';
    badge.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const url = info.card_id
        ? `${FRONTEND_URL}?card_id=${encodeURIComponent(String(info.card_id))}`
        : FRONTEND_URL;
      window.open(url, '_blank', 'noopener,noreferrer');
    });

    parentElement.appendChild(badge);
  }

  function queueReplyItems(node) {
    let queued = false;

    for (const item of findReplyItems(node)) {
      const rpid = getReplyRpid(item);
      if (!rpid) {
        continue;
      }

      if (MARKS_CACHE.has(rpid)) {
        injectBadge(rpid, MARKS_CACHE.get(rpid), item);
        continue;
      }

      pendingRpids.add(rpid);
      queued = true;
    }

    return queued;
  }

  function scheduleFetchMarks() {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      fetchMarks();
    }, MARKS_DEBOUNCE_MS);
  }

  async function fetchMarks() {
    const rpids = Array.from(pendingRpids).filter((rpid) => !MARKS_CACHE.has(rpid));
    pendingRpids.clear();

    if (rpids.length === 0) {
      return;
    }

    try {
      const response = await fetch(`${MARKS_URL}?rpids=${rpids.join(',')}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      const marks = data?.marks && typeof data.marks === 'object' ? data.marks : {};

      for (const rpid of rpids) {
        const info = marks[rpid] || { has_my_comment: false };
        MARKS_CACHE.set(rpid, info);
        injectBadge(rpid, info);
      }
    } catch (error) {
      console.warn('[Dundao] marks fetch failed', error);
    }
  }

  function attachReplyObserver() {
    const root = getReplyRoot();
    if (!root) {
      return false;
    }

    if (replyObserver) {
      return true;
    }

    replyObserver = new MutationObserver((mutations) => {
      let hasQueuedRpid = false;

      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (queueReplyItems(node)) {
            hasQueuedRpid = true;
          }
        }
      }

      if (hasQueuedRpid) {
        scheduleFetchMarks();
      }
    });

    replyObserver.observe(root, { childList: true, subtree: true });

    if (queueReplyItems(root)) {
      scheduleFetchMarks();
    }

    console.log('[Dundao] reply observer attached on', describeRoot(root));
    return true;
  }

  function bootReplyObserver() {
    if (attachReplyObserver()) {
      return;
    }

    const pollId = setInterval(() => {
      if (attachReplyObserver()) {
        clearInterval(pollId);
      }
    }, ROOT_POLL_MS);

    setTimeout(() => {
      clearInterval(pollId);
    }, ROOT_POLL_TIMEOUT_MS);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootReplyObserver, { once: true });
  } else {
    bootReplyObserver();
  }
})();
