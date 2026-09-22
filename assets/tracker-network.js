/* Small, cached requests with per-origin pacing and failure backoff. */
(() => {
  'use strict';
  const cache = new Map(), pending = new Map(), queues = new Map(), next = new Map(), blocked = new Map();
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  let sequence = 0;
  function nasJSONP(url) {
    // NAS explicitly documents JSONP for browser clients; no proxy or CORS bypass service.
    if (url.origin !== 'https://nas.er.usgs.gov' || url.pathname !== '/api/v2/occurrence/search') throw new Error('Unsupported JSONP endpoint');
    return new Promise((resolve, reject) => {
      const callback = `__ljNas${++sequence}`, script = document.createElement('script');
      url.searchParams.set('callback', callback);
      const cleanup = () => {
        clearTimeout(timeout); script.remove();
        // A late response after timeout must be harmless.
        window[callback] = () => {};
        setTimeout(() => { delete window[callback]; }, 60000);
      };
      const timeout = setTimeout(() => { cleanup(); reject(new Error('USGS request timed out')); }, 20000);
      window[callback] = data => { cleanup(); resolve(data); };
      script.onerror = () => { cleanup(); reject(new Error('USGS unavailable')); };
      script.src = url.href; script.referrerPolicy = 'strict-origin-when-cross-origin';
      document.head.append(script);
    });
  }
  async function request(address, ttl = 300000) {
    const url = new URL(address);
    if (url.protocol !== 'https:' || !['api.inaturalist.org','nas.er.usgs.gov'].includes(url.hostname)) throw new Error('Unsupported provider');
    const hit = cache.get(address);
    if (hit && Date.now() - hit.at < ttl) return hit.data;
    if (pending.has(address)) return pending.get(address);
    const origin = url.origin;
    const task = (queues.get(origin) || Promise.resolve()).catch(() => {}).then(async () => {
      if ((blocked.get(origin) || 0) > Date.now()) throw new Error('Provider cooling down; try again later');
      await wait(Math.max(0, (next.get(origin) || 0) - Date.now()));
      next.set(origin, Date.now() + 1100);
      try {
        let data;
        if (url.hostname === 'nas.er.usgs.gov') data = await nasJSONP(url);
        else {
          const response = await fetch(url.href, {signal:AbortSignal.timeout(20000), credentials:'omit'});
          if (!response.ok) {
            if (response.status === 429 || response.status === 503) {
              const header = response.headers.get('Retry-After');
              const retryAt = header && /^\d+$/.test(header) ? Date.now() + Number(header) * 1000 : Date.parse(header);
              blocked.set(origin, Math.max(Date.now() + 60000, Number.isFinite(retryAt) ? retryAt : 0));
            }
            throw new Error(`Provider returned ${response.status}`);
          }
          data = await response.json();
        }
        cache.set(address, {at:Date.now(), data});
        return data;
      } catch (error) {
        blocked.set(origin, Math.max(blocked.get(origin) || 0, Date.now() + 60000));
        throw error;
      }
    });
    queues.set(origin, task); pending.set(address, task);
    try { return await task; } finally { pending.delete(address); }
  }
  window.TrackerNetwork = {request};
})();
