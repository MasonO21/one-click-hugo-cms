// Mock of the iOS bridge (window.webkit.messageHandlers.np) used by native-mock.js and regressions.js.
/* Everything injected before the game script runs. `cfg` lets each scenario pre-load the fake App Store. */
function initScript(cfg) {
  const BUNDLE = cfg.bundle;
  window.NP_BOOT = { save: cfg.save || null, region: cfg.region || 'US', locale: 'en-US', version: '1.0.0', build: '1', reduceMotion: false, platform: 'ios' };
  const log = window.__log = [];
  const unfinished = new Map(cfg.unfinished ? cfg.unfinished.map(t => [t.id, t]) : []);
  let entitlements = cfg.entitlements || [];
  let nextTx = 5000;
  const kind = s => (s === 'vip_weekly' ? 'autoRenewable' : ['starter', 'pass_premium', 'auto_basic', 'auto_combo', 'auto_upgrade'].includes(s) ? 'nonConsumable' : 'consumable');
  window.__mock = { failProducts: cfg.failProducts || 0, delay: cfg.delay || 0, setEntitlements(e) { entitlements = e; }, tx(s, extra) { const id = String(nextTx++); return Object.assign({ id, originalId: id, productId: BUNDLE + '.' + s, type: kind(s), purchaseDate: Date.now(), expirationDate: null, revoked: false }, extra || {}); }, unfinished, behaviour: cfg.behaviour || 'success' };
  window.webkit = { messageHandlers: { np: { postMessage: async msg => {
    log.push(msg);
    await new Promise(r => setTimeout(r, 5));
    switch (msg.cmd) {
      case 'storefront': return cfg.storefront ? { ok: true, countryCode: cfg.storefront } : { ok: false, error: 'unavailable' };
      case 'products': if (window.__mock.failProducts > 0) { window.__mock.failProducts--; return { ok: false, error: 'offline' }; } return { ok: true, products: msg.ids.filter(id => !(cfg.missing || []).includes(id)).map(id => { const s = id.slice(BUNDLE.length + 1); return { id, displayName: s, displayPrice: (cfg.symbol || '€') + cfg.prices[s], price: cfg.prices[s], currency: cfg.currency || 'EUR', type: kind(s), period: s === 'vip_weekly' ? 'P1W' : null }; }), missing: [] };
      case 'purchase': {
        if (window.__mock.delay) await new Promise(r => setTimeout(r, window.__mock.delay));
        const s = msg.id.slice(BUNDLE.length + 1);
        const b = window.__mock.behaviour;
        if (b === 'cancelled') return { ok: true, status: 'cancelled' };
        if (b === 'pending') return { ok: true, status: 'pending' };
        if (b === 'error') return { ok: false, error: 'network' };
        const tx = window.__mock.tx(s, s === 'vip_weekly' ? { expirationDate: Date.now() + 7 * 864e5 } : {});
        unfinished.set(tx.id, tx);
        if (kind(s) !== 'consumable') entitlements = entitlements.concat([tx]);
        return { ok: true, status: 'success', tx };
      }
      case 'finish': unfinished.delete(msg.txId); return { ok: true };
      case 'unfinished': return { ok: true, transactions: [...unfinished.values()] };
      case 'entitlements': return { ok: true, entitlements };
      case 'restore': return { ok: true, entitlements };
      case 'save': window.__saved = msg.data; return { ok: true };
      case 'wipe': window.__saved = null; return { ok: true };
      case 'openUrl': window.__opened = (window.__opened || []).concat([msg.url]); return { ok: true };
      case 'manageSubscriptions': return { ok: true };
      case 'haptic': return { ok: true };
      default: return { ok: false, error: 'unknown' };
    }
  } } } };
}

module.exports = { initScript };
