/* stdout.chat — #void in the browser, read-only.
   History: GET https://api.stdout.chat/void?n=50 with Accept: application/json.
   Live:    GET /void/stream as a fetch() body (a native EventSource cannot send
            Accept: application/json and would get the text rendering instead).
   Every piece of room text is UGC — built with textContent only, never innerHTML.
   Budget per visitor IP on the API: 30 reads/min, 3 open streams; so one stream
   per tab, aborted while the tab is hidden, history re-fetched on resume. */
(function () {
  'use strict';
  var API = 'https://api.stdout.chat';
  var N = 50;
  var feed = document.getElementById('vf-lines');
  if (!feed || typeof fetch !== 'function' || typeof ReadableStream === 'undefined') return;
  var elTopic = document.getElementById('vf-topic');
  var elStatus = document.getElementById('vf-status');
  var elTyping = document.getElementById('vf-typing');
  var elQuiet = document.getElementById('vf-quiet');
  var elMeta = document.getElementById('vf-meta');
  var seen = Object.create(null);     // id -> row element
  var lastTs = 0;                     // newest message ts (ms)
  var typers = Object.create(null);   // nick -> timeout
  var ctrl = null, backoff = 1000, watchdog = null, quietTimer = null, closed = false;

  function setStatus(text, kind) {
    if (!elStatus) return;
    elStatus.textContent = text;
    elStatus.className = 'vf-status' + (kind ? ' is-' + kind : '');
  }
  function hhmm(ts) {
    var d = new Date(ts); if (isNaN(d)) return '';
    var h = d.getHours(), m = d.getMinutes();
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }
  function ago(ms) {
    var s = Math.max(0, Math.round((Date.now() - ms) / 1000));
    if (s < 60) return 'just now';
    var m = Math.round(s / 60); if (m < 60) return m + ' min ago';
    var h = Math.round(m / 60); if (h < 24) return h + ' h ago';
    return Math.round(h / 24) + ' d ago';
  }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function nickOf(m) { return (m.username == null || m.username === '') ? 'anon' : String(m.username); }
  function medal(top) { return top === 1 ? '👑 ' : top === 2 ? '🥈 ' : top === 3 ? '🥉 ' : ''; }

  function renderReactions(row, reactions) {
    var old = row.querySelector('.vl-rx'); if (old) old.remove();
    if (!reactions || !reactions.length) return;
    var rx = el('span', 'vl-rx');
    reactions.forEach(function (pair) {
      if (!pair || !pair.length) return;
      rx.appendChild(el('span', 'vl-r', String(pair[0]) + ' ' + String(pair[1])));
    });
    row.appendChild(rx);
  }
  function renderRow(m) {
    var row = el('div', 'vl');
    row.setAttribute('data-id', String(m.id));
    row.appendChild(el('span', 'vl-t', hhmm(m.ts)));
    var nick = el('span', 'vl-n', medal(m.top) + nickOf(m));
    if (m.tag) nick.title = '#' + String(m.tag);
    row.appendChild(nick);
    var body = el('span', 'vl-x');
    if (m.reply) {
      var q = el('span', 'vl-q');
      q.textContent = m.reply.gone ? '↳ (removed) ' : '↳ ' + (m.reply.username || 'anon') + ': ' + (m.reply.text || '') + ' ';
      body.appendChild(q);
    }
    body.appendChild(document.createTextNode(String(m.text || '')));
    row.appendChild(body);
    renderReactions(row, m.reactions);
    return row;
  }
  function nearBottom() {
    var box = feed.parentNode;
    return box.scrollHeight - box.scrollTop - box.clientHeight < 80;
  }
  function add(m, live) {
    if (!m || m.id == null || seen[m.id]) return;
    var stick = live ? nearBottom() : true;
    var row = renderRow(m);
    seen[m.id] = row;
    feed.appendChild(row);
    var ts = Date.parse(m.ts); if (ts && ts > lastTs) lastTs = ts;
    clearTyping(nickOf(m));
    if (stick) feed.parentNode.scrollTop = feed.parentNode.scrollHeight;
    quiet();
  }
  function quiet() {
    if (!elQuiet) return;
    clearTimeout(quietTimer);
    var n = Object.keys(seen).length;
    if (!n) { elQuiet.textContent = 'nothing in the last 24 hours · be the first line from the app'; elQuiet.hidden = false; return; }
    var idle = Date.now() - lastTs;
    if (idle > 20 * 60 * 1000) { elQuiet.textContent = 'quiet right now · last line ' + ago(lastTs); elQuiet.hidden = false; }
    else elQuiet.hidden = true;
    quietTimer = setTimeout(quiet, 60 * 1000);
  }
  function meta(d) {
    if (!elMeta) return;
    var parts = [];
    // honest numbers only: a head-count below 10 says "empty" louder than silence does
    if (typeof d.count === 'number' && d.count >= 10) parts.push(d.count + ' in room');
    if (typeof d.msgs_24h === 'number' && d.msgs_24h > 0) parts.push(d.msgs_24h + (d.msgs_24h === 1 ? ' line' : ' lines') + ' today');
    if (d.top_week && d.top_week.length) {
      parts.push('top this week · ' + d.top_week.slice(0, 3).map(function (t) { return medal(t.rank) + (t.nick || 'anon'); }).join(' '));
    }
    elMeta.textContent = parts.join(' · ');
  }
  function topic(t) {
    if (!elTopic) return;
    t = (t == null) ? '' : String(t).trim();
    elTopic.textContent = t ? '/topic: ' + t : '';
    elTopic.hidden = !t;
  }
  function showTyping(nick) {
    if (!elTyping) return;
    clearTimeout(typers[nick]);
    typers[nick] = setTimeout(function () { clearTyping(nick); }, 3500);
    paintTyping();
  }
  function clearTyping(nick) {
    if (!typers[nick]) return;
    clearTimeout(typers[nick]); delete typers[nick]; paintTyping();
  }
  function paintTyping() {
    if (!elTyping) return;
    var names = Object.keys(typers);
    elTyping.textContent = names.length === 0 ? '' : names.length === 1 ? names[0] + ' is typing…' :
      names.length === 2 ? names[0] + ' and ' + names[1] + ' are typing…' : names.length + ' people are typing…';
    elTyping.hidden = !names.length;
  }

  function load() {
    return fetch(API + '/void?n=' + N, { headers: { Accept: 'application/json' } })
      .then(function (r) {
        if (r.status === 429) throw new Error('rate');
        if (r.status === 503) throw new Error('closed');
        if (!r.ok) throw new Error('http ' + r.status);
        return r.json();
      })
      .then(function (d) {
        topic(d.topic);
        meta(d);
        (d.messages || []).forEach(function (m) { add(m, false); });
        feed.parentNode.scrollTop = feed.parentNode.scrollHeight;
        quiet();
      });
  }

  function handle(ev) {
    var data = ev.data;
    if (ev.event === 'bye') { closeStream(); schedule(0); return; }
    var j; try { j = JSON.parse(data); } catch (e) { return; }
    switch (ev.event) {
      case 'msg': case 'message': add(j, true); break;
      case 'react': if (j && seen[j.id]) renderReactions(seen[j.id], j.reactions); break;
      case 'hide': if (j && seen[j.id]) { seen[j.id].remove(); delete seen[j.id]; quiet(); } break;
      case 'topic': topic(j && j.topic); break;
      case 'typing': if (j && j.username) showTyping(String(j.username)); break;
      default: break;
    }
  }

  // minimal SSE parser: event / data / id lines, blank line dispatches, ':' comments ignored
  function parser(onEvent) {
    var buf = '', event = '', data = [];
    return function (chunk) {
      buf += chunk;
      var i;
      while ((i = buf.indexOf('\n')) !== -1) {
        var line = buf.slice(0, i); buf = buf.slice(i + 1);
        if (line.charCodeAt(line.length - 1) === 13) line = line.slice(0, -1);
        if (line === '') { if (data.length) onEvent({ event: event || 'message', data: data.join('\n') }); event = ''; data = []; continue; }
        if (line.charCodeAt(0) === 58) continue;
        var c = line.indexOf(':'), f = c === -1 ? line : line.slice(0, c), v = c === -1 ? '' : line.slice(c + 1);
        if (v.charCodeAt(0) === 32) v = v.slice(1);
        if (f === 'event') event = v; else if (f === 'data') data.push(v);
      }
    };
  }

  function kick() {
    clearTimeout(watchdog);
    watchdog = setTimeout(function () { closeStream(); schedule(1000); }, 60 * 1000); // pings come every 15 s
  }
  function closeStream() {
    clearTimeout(watchdog);
    if (ctrl) { try { ctrl.abort(); } catch (e) {} ctrl = null; }
  }
  var pending = null;
  function schedule(ms) {
    clearTimeout(pending);
    if (closed || document.hidden) return;
    pending = setTimeout(stream, ms);
  }
  function stream() {
    if (closed || document.hidden || ctrl) return;
    ctrl = new AbortController();
    var mine = ctrl;
    setStatus('connecting…', 'wait');
    fetch(API + '/void/stream?replay=0', { headers: { Accept: 'application/json' }, signal: mine.signal })
      .then(function (r) {
        if (r.status === 503) { setStatus('the room is closed right now', 'off'); throw new Error('closed'); }
        if (!r.ok || !r.body) throw new Error('http ' + r.status);
        backoff = 1000;
        setStatus('live', 'live');
        kick();
        var feedChunk = parser(handle), dec = new TextDecoder(), reader = r.body.getReader();
        return (function pump() {
          return reader.read().then(function (res) {
            if (res.done) return;
            kick();
            feedChunk(dec.decode(res.value, { stream: true }));
            return pump();
          });
        })();
      })
      .then(function () { if (ctrl === mine) { ctrl = null; schedule(500); } })
      .catch(function (e) {
        if (ctrl === mine) ctrl = null;
        if (mine.signal.aborted) return;
        if (!document.hidden) setStatus(String(e && e.message) === 'closed' ? 'the room is closed right now · retrying in a minute' : 'reconnecting…', 'wait');
        var wait = String(e && e.message) === 'closed' ? 60000 : backoff;
        backoff = Math.min(backoff * 2, 30000);
        schedule(wait);
      });
  }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { closeStream(); clearTimeout(pending); setStatus('paused · tab in background', 'off'); }
    else { load().catch(function () {}).then(function () { schedule(0); }); }
  });
  window.addEventListener('pagehide', function () { closed = true; closeStream(); });

  setStatus('loading the last 24 hours…', 'wait');
  load()
    .then(function () { schedule(0); })
    .catch(function (e) {
      var m = String(e && e.message);
      setStatus(m === 'closed' ? 'the room is closed right now' : m === 'rate' ? 'too many reads from this address · try again in a minute' : "can't reach the room · retrying", 'off');
      pending = setTimeout(function () { load().then(function () { schedule(0); }).catch(function () { schedule(15000); }); }, m === 'rate' ? 60000 : 15000);
    });

  var cta = document.querySelectorAll('[data-va="void_web_cta"]');
  for (var i = 0; i < cta.length; i++) cta[i].addEventListener('click', function () { if (window.va) window.va('event', { name: 'void_web_cta' }); });
})();
