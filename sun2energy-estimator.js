/*! Sun2Energy solar savings estimator — vanilla JS embed for Webflow + GHL inbound webhook.
 * Mount: <div data-s2e-estimator data-webhook="…" data-getaddress-key="…"></div>
 */
(function () {
  'use strict';

  // ── Model assumptions (best-guess UK figures — tune here) ──────────────────
  var C = {
    importPrice: 0.245,       // £/kWh grid electricity
    exportPrice: 0.15,        // £/kWh Smart Export Guarantee
    yieldPerKwp: 900,         // kWh per kWp per year, UK average south-facing
    house: { terrace: 3.0, semi: 3.6, detached: 4.8 },             // typical system size, kWp
    occupantStep: 0.08,       // +8% system size per occupant above 2
    roof: { south: 1.0, ew: 0.85, north: 0.6, unsure: 0.9 },
    shade: { none: 1.0, some: 0.85, heavy: 0.65, unsure: 0.9 },
    ev: { have: 2, plan: 1, none: 0 },                               // each step adds 10% self-use
    selfUseSolar: 0.30,       // share of generation used in the home, solar only
    batteryUplift: 0.35,      // extra self-use with a battery
    selfUseCap: 0.85,
    batteryTariffBonus: 150,  // £/yr from charging on cheap overnight rates
    costPerKwp: 1400,         // £ installed, panels + inverter
    batteryCost: 3500,        // £ installed
    priceInflation: 0.03,     // electricity price rise per year
    degradation: 0.005,       // panel output loss per year
    years: 25
  };

  var STEPS = [
    { key: 'house', label: 'House type', type: 'options', title: 'Which type of house do you have?',
      options: [{ v: 'terrace', label: 'Terrace' }, { v: 'semi', label: 'Semi-detached' }, { v: 'detached', label: 'Detached' }] },
    { key: 'occupants', label: 'Occupants', type: 'occupants', title: 'How many people live here?' },
    { key: 'own', label: 'Ownership', type: 'options', title: 'Do you own your home?',
      options: [{ v: 'yes', label: 'Yes, I own it' }, { v: 'no', label: 'No, we rent' }] },
    { key: 'bill', label: 'Monthly bill', type: 'bill', title: "What's your monthly electricity bill?" },
    { key: 'roof', label: 'Roof direction', type: 'options', title: 'Which way does your roof face?',
      options: [{ v: 'south', label: 'South', sub: 'Best for solar' }, { v: 'ew', label: 'East / West' }, { v: 'north', label: 'North' }, { v: 'unsure', label: 'Not sure', sub: "We'll check for you" }] },
    { key: 'shade', label: 'Shading', type: 'options', title: 'How much shade is on your roof?',
      options: [{ v: 'none', label: 'Minimal / none' }, { v: 'some', label: 'Some shading' }, { v: 'heavy', label: 'Heavily shaded' }, { v: 'unsure', label: 'Not sure' }] },
    { key: 'ev', label: 'Electric vehicle', type: 'options', title: 'Do you have an electric vehicle?',
      options: [{ v: 'have', label: 'I have one' }, { v: 'plan', label: 'I plan to get one' }, { v: 'none', label: "I don't have one" }] },
    { key: 'timing', label: 'Timing', type: 'options', title: 'How soon would you like to go solar?',
      options: [{ v: 'asap', label: 'As soon as possible' }, { v: '3-6', label: 'In 3–6 months' }, { v: '6-12', label: 'In 6–12 months' }, { v: 'unsure', label: 'Not sure yet' }] },
    { key: 'address', label: 'Address', type: 'address', title: "What's your address?" },
    { key: 'name', label: 'Name', type: 'name', title: 'Almost there.' },
    { key: 'contact', label: 'Contact', type: 'contact', title: 'Last step' }
  ];

  var CSS = '\
.s2e{--teal:#03636a;--teal-d:#024f55;--ink:#0b3a3e;--ink-d:#03363a;--yellow:#ecff54;--yellow-d:#dcf03c;--cyan:#dff4f6;--line:rgba(3,99,106,.35);--mute:#5d7f82;--track:#d3e9eb;font-family:Archivo,system-ui,sans-serif;color:var(--ink);background:#fff;font-size:15px;line-height:1.5;-webkit-font-smoothing:antialiased;text-align:left}\
.s2e *,.s2e *::before,.s2e *::after{box-sizing:border-box}\
.s2e h1,.s2e h2,.s2e p{margin:0;font-family:inherit;color:inherit;letter-spacing:-.015em}\
.s2e h1{font-weight:800;font-size:clamp(30px,4.2vw,42px);line-height:1.05;text-wrap:pretty;max-width:20ch}\
.s2e a{color:var(--teal);text-underline-offset:3px}.s2e a:hover{color:var(--teal-d)}\
.s2e button{font-family:inherit;color:inherit;border-radius:0;-webkit-appearance:none;appearance:none}\
.s2e :focus{outline:none}.s2e :focus-visible{outline:2px solid var(--teal);outline-offset:2px}\
.s2e-head{display:flex;align-items:center;gap:16px;padding:16px 24px;border-bottom:2px solid var(--line)}\
.s2e-brand{font-weight:800;font-size:22px;letter-spacing:.02em;margin-right:auto;height:40px;width:180px;display:flex;align-items:center;position:relative}.s2e-brand span span{color:var(--teal)}\
.s2e-brand svg{position:absolute;inset:0;width:100%!important;height:100%!important}.s2e-lottie .s2e-logo-txt{visibility:hidden}\
.s2e-time{font-size:13px;display:flex;align-items:center;gap:6px}\
.s2e-prog{height:6px;background:var(--teal-d)}.s2e-prog i{display:block;height:6px;background:var(--yellow);transition:width .3s}\
.s2e-grid{display:flex;flex-wrap:wrap;gap:2px;background:var(--line);min-height:560px}\
.s2e-side{--line:rgba(255,255,255,.35);flex:1 1 280px;max-width:100%;background:var(--teal);color:#fff;padding:32px 24px;display:flex;flex-direction:column;gap:32px}\
.s2e-main{flex:2 1 520px;max-width:100%;background:#fff;padding:32px 24px;display:flex;flex-direction:column;gap:24px}\
.s2e-kick{font-size:11px;letter-spacing:.1em;text-transform:uppercase;display:flex;align-items:center;gap:8px}\
.s2e-kick b{width:10px;height:10px;background:var(--yellow);display:inline-block}\
.s2e-side-title{font-weight:800;font-size:28px;line-height:1.1;color:var(--yellow);text-wrap:pretty}\
.s2e-stats{display:flex;flex-direction:column;border-top:2px solid var(--line)}\
.s2e-stats div{display:flex;gap:12px;align-items:baseline;padding:12px 0;border-bottom:1px solid var(--line);font-size:14px}\
.s2e-stats strong{font-weight:800;font-size:20px;min-width:72px}\
.s2e-steps{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:2px}\
.s2e-steps li{display:flex;gap:12px;align-items:center;font-size:13px;padding:3px 0;color:#a9cdd0}\
.s2e-steps li.done{color:#fff}.s2e-steps li.cur{color:var(--yellow);font-weight:800}\
.s2e-steps .n{width:22px;font-variant-numeric:tabular-nums}.s2e-steps .l{flex:1}.s2e-steps .v{text-align:right}\
.s2e-count{display:flex;align-items:center;gap:16px;font-size:11px;letter-spacing:.1em;text-transform:uppercase}.s2e-count i{flex:1;height:2px;background:var(--line)}\
.s2e-opts{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:2px;background:var(--line);border:2px solid var(--line)}\
.s2e-opt{all:unset;box-sizing:border-box;cursor:pointer;min-height:148px;padding:16px;display:flex;flex-direction:column;justify-content:space-between;gap:24px;background:#fff;color:var(--ink);transition:background .12s}\
.s2e-opt:hover{background:var(--cyan)}.s2e-opt.sel,.s2e-opt.sel:hover{background:var(--yellow);color:var(--ink-d)}\
.s2e-opt:focus-visible{outline:2px solid var(--teal);outline-offset:-4px}\
.s2e-opt .top{display:flex;justify-content:space-between;font-size:12px;font-variant-numeric:tabular-nums}\
.s2e-opt .lab{display:block;font-weight:800;font-size:22px;line-height:1.1}\
.s2e-opt .sub{display:block;font-size:13px;opacity:.75;min-height:20px;margin-top:4px}\
.s2e-hint{font-size:13px;color:var(--mute)}\
.s2e-stepper{display:flex;align-items:stretch;border:2px solid var(--line);width:max-content;max-width:100%}\
.s2e-stepper button{all:unset;cursor:pointer;width:72px;display:grid;place-items:center;font-size:28px}\
.s2e-stepper button:hover{background:var(--cyan)}.s2e-stepper button:first-child{border-right:2px solid var(--line)}.s2e-stepper button:last-child{border-left:2px solid var(--line)}\
.s2e-stepper .val{min-width:160px;padding:16px 24px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}\
.s2e-big{font-weight:800;font-size:64px;line-height:1;font-variant-numeric:tabular-nums}\
.s2e-bill{display:flex;flex-direction:column;gap:16px;border-top:2px solid var(--line);padding-top:24px;max-width:640px}\
.s2e-bill .row{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap}.s2e-bill .s2e-big{font-size:72px}\
.s2e input[type=range]{width:100%;accent-color:var(--teal)}\
.s2e-ends{display:flex;justify-content:space-between;font-size:12px}\
.s2e-form{display:flex;flex-direction:column;gap:24px;max-width:560px}\
.s2e-pair{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px}\
.s2e-field label{display:block;font-size:12px;margin-bottom:5px;color:rgba(11,58,62,.75)}\
.s2e-input{width:100%;min-height:52px;padding:6px 12px;font:inherit;font-size:16px;color:var(--ink);background:#f2fafb;border:1px solid var(--line);border-radius:0;caret-color:var(--teal);margin:0}\
.s2e-input:hover{border-color:rgba(3,99,106,.6)}.s2e-input:focus{border-color:var(--teal);outline:2px solid var(--teal);outline-offset:0}\
.s2e-tel{display:flex}.s2e-tel span{display:flex;align-items:center;padding:0 12px;border:1px solid var(--line);border-right:0;font-size:14px;background:#f2fafb}\
.s2e-addr{position:relative}\
.s2e-sugg{position:absolute;left:0;right:0;top:100%;z-index:20;margin:0;padding:0;list-style:none;background:#fff;border:2px solid var(--teal);border-top:0;max-height:280px;overflow:auto;box-shadow:0 12px 32px rgba(3,54,58,.18)}\
.s2e-sugg li{padding:12px;font-size:14px;cursor:pointer;border-bottom:1px solid var(--line)}.s2e-sugg li:last-child{border-bottom:0}\
.s2e-sugg li:hover,.s2e-sugg li.act{background:var(--cyan)}\
.s2e-sugg .msg{cursor:default;color:var(--mute)}.s2e-sugg .msg:hover{background:#fff}\
.s2e-consent{display:flex;gap:10px;align-items:flex-start;font-size:13px;cursor:pointer}\
.s2e-consent input{position:absolute;opacity:0;width:0;height:0}\
.s2e-box{width:18px;height:18px;flex:none;border:2px solid var(--line);display:grid;place-items:center;color:#fff;margin-top:1px}\
.s2e-consent input:checked+.s2e-box{background:var(--teal);border-color:var(--teal)}.s2e-box svg{display:none}.s2e-consent input:checked+.s2e-box svg{display:block}\
.s2e-consent input:focus-visible+.s2e-box{outline:2px solid var(--teal);outline-offset:2px}\
.s2e-hp{position:absolute!important;left:-9999px!important;width:1px;height:1px;overflow:hidden}\
.s2e-nav{display:flex;gap:12px;align-items:center;margin-top:auto;padding-top:24px;border-top:2px solid var(--line)}\
.s2e-back{all:unset;cursor:pointer;min-height:48px;padding:0 12px;font-weight:800;font-size:14px;display:flex;align-items:center}.s2e-back:hover{background:var(--cyan)}\
.s2e-next{all:unset;cursor:pointer;margin-left:auto;min-height:52px;min-width:200px;padding:0 16px;display:flex;align-items:center;justify-content:space-between;gap:12px;font-weight:800;font-size:16px;background:var(--yellow);color:var(--ink-d)}\
.s2e-next:hover{background:var(--yellow-d)}.s2e-next:active{background:#cde22a}.s2e-next[disabled]{opacity:.45;cursor:not-allowed}\
.s2e-next:focus-visible{outline:2px solid var(--teal);outline-offset:2px}\
.s2e-panel{border:2px solid var(--line);display:flex;flex-direction:column}\
.s2e-panel-h{display:flex;flex-wrap:wrap;gap:12px;align-items:baseline;justify-content:space-between;padding:16px;border-bottom:2px solid var(--line)}\
.s2e-panel-h strong{font-weight:800;font-size:20px}.s2e-panel-h span{font-size:13px;display:flex;align-items:center;gap:8px}\
.s2e-sw{width:12px;height:12px;display:inline-block}\
.s2e-bars{display:flex;flex-direction:column;gap:16px;padding:24px 16px}\
.s2e-bar{display:grid;grid-template-columns:minmax(110px,150px) minmax(0,1fr);gap:16px;align-items:center}\
.s2e-bar .l{display:flex;flex-direction:column;gap:2px}.s2e-bar .l b{font-size:13px;font-weight:600}.s2e-bar .l span{font-size:12px;color:var(--mute)}\
.s2e-bar .t{display:flex;align-items:center;gap:12px;min-width:0}\
.s2e-bar .w{flex:1;min-width:0}.s2e-bar .v{min-width:84px;text-align:right}\
.s2e-bar .f{height:48px;width:0;max-width:100%;border:2px solid transparent;transition:width .9s cubic-bezier(.2,.8,.2,1)}\
.s2e-bar .v{font-weight:800;font-size:22px;white-space:nowrap;font-variant-numeric:tabular-nums}\
.s2e-kpis{display:flex;flex-wrap:wrap;gap:2px;background:var(--line);border-top:2px solid var(--line)}\
.s2e-kpis div{flex:1 1 160px;background:#fff;padding:16px;display:flex;flex-direction:column;gap:4px}\
.s2e-kpis div.hi{background:var(--yellow);color:var(--ink-d)}\
.s2e-kpis span{font-size:12px}.s2e-kpis strong{font-weight:800;font-size:40px;line-height:1}\
.s2e-cols{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px;align-items:end;height:220px;padding:24px 16px 0}\
.s2e-col{display:flex;flex-direction:column;justify-content:flex-end;gap:8px;height:100%}\
.s2e-col b{font-size:13px;font-weight:800;font-variant-numeric:tabular-nums}\
.s2e-col i{display:block;height:0;transition:height .9s cubic-bezier(.2,.8,.2,1)}\
.s2e-axis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px;padding:8px 16px 16px;border-top:2px solid var(--line);font-size:12px}\
.s2e-next-steps{background:var(--teal);color:#fff;padding:24px;display:flex;flex-direction:column;gap:8px}\
.s2e-next-steps p{font-weight:800;font-size:25px;line-height:1.15;color:var(--yellow);max-width:28ch}\
.s2e-ghost{all:unset;cursor:pointer;min-height:48px;padding:0 24px;border:1px solid var(--line);font-weight:800;font-size:14px;display:inline-flex;align-items:center}.s2e-ghost:hover{background:var(--cyan)}\
.s2e-foot{display:flex;flex-wrap:wrap;gap:16px;align-items:center;padding:16px 24px;border-top:2px solid var(--line);font-size:13px}.s2e-foot span{margin-right:auto}\
.s2e-tick{display:none;overflow:hidden;background:var(--teal);color:#fff;border-bottom:2px solid var(--line)}\
.s2e-tick-run{display:flex;width:max-content;animation:s2e-tick 22s linear infinite}\
.s2e-tick-run span{display:flex;align-items:center;gap:10px;padding:10px 20px;font-size:13px;font-weight:600;white-space:nowrap}\
.s2e-tick-run b{width:8px;height:8px;background:var(--yellow);display:inline-block}\
@keyframes s2e-tick{to{transform:translateX(-50%)}}\
@media (prefers-reduced-motion:reduce){.s2e-tick-run{animation:none}}\
@media (max-width:767px){.s2e-tick{display:block}.s2e-stats{display:none}.s2e-side{order:2;padding:24px 20px;gap:24px}.s2e-steps{display:none}.s2e-main{padding:24px 20px}.s2e-head{padding:12px 20px}\
.s2e-opts{grid-template-columns:1fr}.s2e-opt{min-height:0;flex-direction:row-reverse;align-items:center;justify-content:space-between;gap:12px;padding:18px 16px}.s2e-opt .top span:first-child{display:none}.s2e-opt .sub{min-height:0}\
.s2e-bill .s2e-big{font-size:56px}.s2e-kpis strong{font-size:32px}.s2e-cols{gap:6px;height:180px}.s2e-col b{font-size:11px}.s2e-axis{gap:6px;font-size:11px}.s2e-bar{grid-template-columns:1fr}.s2e-next{min-width:0;flex:1}}';

  var ICON_CHECK = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="square"><path d="M4 12l5 5L20 6"/></svg>';
  var ICON_CLOCK = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M10 2h4"/></svg>';

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(n) { return Math.round(n).toLocaleString('en-GB'); }
  function pad(i) { return (i < 9 ? '0' : '') + (i + 1); }
  function optLabel(key, v) { var s = STEPS.find(function (x) { return x.key === key; }); var o = s && s.options && s.options.find(function (x) { return x.v === v; }); return o ? o.label : ''; }

  function calc(a) {
    var kwp = C.house[a.house] * (1 + (a.occupants - 2) * C.occupantStep);
    var gen = kwp * C.yieldPerKwp * C.roof[a.roof] * C.shade[a.shade];
    var spend = a.bill * 12;
    var usage = spend / C.importPrice;
    var share = C.selfUseSolar + C.ev[a.ev] * 0.10;
    function saving(sh) { var self = Math.min(gen * sh, usage * 0.9); return self * C.importPrice + (gen - self) * C.exportPrice; }
    var solar = saving(share);
    var battery = saving(Math.min(C.selfUseCap, share + C.batteryUplift)) + C.batteryTariffBonus;
    var cost = kwp * C.costPerKwp + C.batteryCost;
    var cum = [], total = 0, payback = null;
    for (var y = 0; y < C.years; y++) {
      var yr = battery * Math.pow(1 + C.priceInflation, y) * Math.pow(1 - C.degradation, y);
      if (payback === null && total + yr >= cost) payback = y + (cost - total) / yr;
      total += yr; cum.push(total);
    }
    return {
      kwp: kwp, gen: gen, spend: spend, solar: solar, battery: battery, cost: cost, lifetime: total,
      payback: payback === null ? C.years : payback, cum: cum,
      solarPct: Math.min(100, Math.round(solar / spend * 100)), batteryPct: Math.min(100, Math.round(battery / spend * 100))
    };
  }

  function captureTracking() {
    var keys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid', 'msclkid'];
    var stored = {};
    try { stored = JSON.parse(sessionStorage.getItem('s2e_tracking') || '{}'); } catch (e) {}
    var q = new URLSearchParams(location.search);
    keys.forEach(function (k) { if (q.get(k)) stored[k] = q.get(k); });
    if (!stored.landing_page) stored.landing_page = location.href;
    if (!stored.referrer && document.referrer) stored.referrer = document.referrer;
    try { sessionStorage.setItem('s2e_tracking', JSON.stringify(stored)); } catch (e) {}
    return stored;
  }

  function fmtPostcode(p) {
    var m = String(p || '').replace(/\s+/g, '').toUpperCase().match(/^([A-Z]{1,2}\d[A-Z\d]?)(\d[A-Z]{2})$/);
    return m ? m[1] + ' ' + m[2] : '';
  }

  function normalisePhone(p) {
    var d = String(p).replace(/\D/g, '');
    if (d.indexOf('44') === 0) d = d.slice(2);
    if (d.indexOf('0') === 0) d = d.slice(1);
    return d.length === 10 ? '+44' + d : null;
  }

  function Estimator(root, opts) {
    this.root = root;
    this.webhook = opts.webhook;
    this.gaKey = opts.getaddressKey;
    this.showHeader = opts.showHeader;
    this.privacy = opts.privacyUrl || 'https://www.sun2energy.co.uk/privacy-policy';
    this.tracking = captureTracking();
    this.started = Date.now();
    this.step = 0; this.rent = false; this.done = false;
    this.a = { house: null, occupants: 3, own: null, bill: 150, roof: null, shade: null, ev: null, timing: null,
      addr1: '', town: '', postcode: '', first: '', last: '', email: '', phone: '', consent: false, hp: '' };
    root.classList.add('s2e');
    root.addEventListener('click', this.onClick.bind(this));
    root.addEventListener('input', this.onInput.bind(this));
    root.addEventListener('change', this.onInput.bind(this));
    root.addEventListener('keydown', this.onKey.bind(this));
    this.logoUrl = opts.logoUrl || 'https://cdn.prod.website-files.com/69c178d185b79a79e4fd75fd/69c2f61a366cf2ab480fa124_SUN2ENERGY%20(1).json';
    root.innerHTML =
      (this.showHeader ? '<header class="s2e-head"><div class="s2e-brand" aria-label="Sun2Energy"><span class="s2e-logo-txt">SUN<span>2</span>ENERGY</span></div><div class="s2e-time">' + ICON_CLOCK + '<span>Takes 60 seconds</span></div></header>' : '') +
      this.ticker() + '<div class="s2e-body"></div>' +
      (this.showHeader ? '<footer class="s2e-foot"><span>© Sun2Energy</span><a href="' + esc(this.privacy) + '" target="_blank" rel="noopener">Privacy policy</a></footer>' : '');
    this.body = root.querySelector('.s2e-body');
    if (this.showHeader) this.loadLogo();
    this.render();
  }

  Estimator.prototype.loadLogo = function () {
    var el = this.root.querySelector('.s2e-brand'), url = this.logoUrl;
    function play() {
      try {
        var anim = window.lottie.loadAnimation({ container: el, renderer: 'svg', loop: false, autoplay: true, path: url });
        anim.addEventListener('DOMLoaded', function () { el.classList.add('s2e-lottie'); });
      } catch (e) {}
    }
    if (window.lottie && window.lottie.loadAnimation) return play();
    var s = document.querySelector('script[data-s2e-lottie]');
    if (!s) {
      s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/lottie-web/5.12.2/lottie_light.min.js';
      s.setAttribute('data-s2e-lottie', '');
      document.head.appendChild(s);
    }
    s.addEventListener('load', play);
  };

  Estimator.prototype.track = function (name, extra) {
    var d = Object.assign({ event: 's2e_' + name, s2e_step: this.done ? 'results' : STEPS[this.step].key }, extra || {});
    if (window.dataLayer) window.dataLayer.push(d);
    this.root.dispatchEvent(new CustomEvent('s2e:' + name, { detail: d, bubbles: true }));
  };

  Estimator.prototype.valid = function () {
    var a = this.a, s = STEPS[this.step];
    switch (s.type) {
      case 'options': return !!a[s.key];
      case 'address': return a.addr1.trim().length > 2 && a.town.trim().length > 1 && !!fmtPostcode(a.postcode);
      case 'name': return !!(a.first.trim() && a.last.trim());
      case 'contact': return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(a.email.trim()) && !!normalisePhone(a.phone) && a.consent;
      default: return true;
    }
  };

  Estimator.prototype.go = function (i) {
    this.step = i; this.rent = false;
    this.render();
    var top = this.root.getBoundingClientRect().top;
    if (top < 0) window.scrollBy({ top: top - 16, behavior: 'smooth' });
    this.track('step');
  };

  Estimator.prototype.next = function () {
    var s = STEPS[this.step];
    if (!this.valid()) return;
    if (s.key === 'own' && this.a.own === 'no') { this.rent = true; this.render(); this.track('renter'); return; }
    if (this.step === STEPS.length - 1) return this.submit();
    this.go(this.step + 1);
  };

  Estimator.prototype.submit = function () {
    this.done = true;
    this.result = calc(this.a);
    this.render();
    var top = this.root.getBoundingClientRect().top;
    if (top < 0) window.scrollBy({ top: top - 16, behavior: 'smooth' });
    this.track('submit');
    if (this.a.hp && Date.now() - this.started < 8000) return; // honeypot filled AND finished implausibly fast — bot
    this.send(this.payload());
  };

  Estimator.prototype.payload = function () {
    var a = this.a, r = this.result, t = this.tracking;
    return {
      source: 'Website solar estimator',
      first_name: a.first.trim(), last_name: a.last.trim(), full_name: (a.first.trim() + ' ' + a.last.trim()).trim(),
      email: a.email.trim(), phone: normalisePhone(a.phone),
      address: [a.addr1.trim(), a.town.trim(), fmtPostcode(a.postcode)].join(', '), address1: a.addr1.trim(), city: a.town.trim(),
      postal_code: fmtPostcode(a.postcode), country: 'GB',
      house_type: optLabel('house', a.house), occupants: a.occupants >= 6 ? '6+' : String(a.occupants),
      home_owner: optLabel('own', a.own), monthly_bill: a.bill,
      roof_direction: optLabel('roof', a.roof), roof_shading: optLabel('shade', a.shade),
      electric_vehicle: optLabel('ev', a.ev), install_timeframe: optLabel('timing', a.timing),
      marketing_consent: a.consent ? 'Yes' : 'No',
      est_system_size_kwp: Math.round(r.kwp * 10) / 10, est_annual_generation_kwh: Math.round(r.gen),
      est_annual_spend: Math.round(r.spend), est_solar_saving: Math.round(r.solar), est_battery_saving: Math.round(r.battery),
      est_bill_reduction_pct: r.batteryPct, est_25yr_saving: Math.round(r.lifetime), est_payback_years: Math.round(r.payback * 10) / 10,
      est_system_cost: Math.round(r.cost),
      utm_source: t.utm_source || '', utm_medium: t.utm_medium || '', utm_campaign: t.utm_campaign || '',
      utm_term: t.utm_term || '', utm_content: t.utm_content || '', gclid: t.gclid || '', fbclid: t.fbclid || '', msclkid: t.msclkid || '',
      landing_page: t.landing_page || '', referrer: t.referrer || '', page_url: location.href,
      submitted_at: new Date().toISOString()
    };
  };

  Estimator.prototype.send = function (data) {
    var self = this, url = this.webhook;
    if (!url) { console.warn('[s2e] No data-webhook set — payload:', data); return; }
    fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data), keepalive: true })
      .then(function (res) { self.track(res.ok ? 'sent' : 'send_error', { status: res.status }); })
      .catch(function () {
        // CORS blocked the JSON request — resend as a simple form post the browser allows cross-origin.
        var body = new URLSearchParams();
        Object.keys(data).forEach(function (k) { body.append(k, data[k] == null ? '' : data[k]); });
        fetch(url, { method: 'POST', mode: 'no-cors', body: body, keepalive: true })
          .then(function () { self.track('sent', { mode: 'no-cors' }); })
          .catch(function (e) { self.track('send_error', { error: String(e) }); });
      });
  };

  // ── getAddress.io autocomplete ─────────────────────────────────────────────
  Estimator.prototype.lookup = function (term) {
    var self = this, list = this.root.querySelector('.s2e-sugg');
    clearTimeout(this._t);
    if (!this.gaKey || !list) return;
    if (term.trim().length < 3) { list.hidden = true; return; }
    this._t = setTimeout(function () {
      var seq = ++self._seq || (self._seq = 1);
      var t = term.trim(), pc = t.replace(/\s+/g, '').toUpperCase().match(/^([A-Z]{1,2}\d[A-Z\d]?)(\d[A-Z]{2})$/);
      if (pc) t = pc[1] + ' ' + pc[2]; // full postcode: format it and return every address on it
      // Ideal Postcodes autocomplete (UK, Royal Mail PAF). Suggestions are free; resolving one is a paid lookup.
      fetch('https://api.ideal-postcodes.co.uk/v1/autocomplete/addresses?api_key=' + encodeURIComponent(self.gaKey) + '&query=' + encodeURIComponent(t) + '&limit=' + (pc ? 50 : 8))
        .then(function (r) { if (!r.ok) return r.text().then(function (t) { throw r.status + ' ' + t; }); return r.json(); })
        .then(function (j) {
          if (seq !== self._seq) return;
          var s = ((j.result && j.result.hits) || []).map(function (x) { return { address: x.suggestion, id: x.id }; });
          self._sugg = s; self._act = -1;
          list.innerHTML = s.length
            ? s.map(function (x, i) { return '<li role="option" data-act="pick" data-i="' + i + '">' + esc(x.address) + '</li>'; }).join('')
            : '<li class="msg">No matches — keep typing, or enter your full address.</li>';
          list.hidden = false;
        })
        .catch(function (e) { console.warn('[s2e] getAddress lookup failed', e); list.hidden = true; });
    }, 220);
  };

  Estimator.prototype.pick = function (i) {
    var self = this, s = this._sugg && this._sugg[i], list = this.root.querySelector('.s2e-sugg'), inp = this.root.querySelector('#s2e-address');
    if (!s) return;
    list.hidden = true;
    inp.value = s.address; this.a.address = s.address; this.a.addr = null;
    this.syncNext();
    fetch('https://api.ideal-postcodes.co.uk/v1/autocomplete/addresses/' + encodeURIComponent(s.id) + '/gbr?api_key=' + encodeURIComponent(this.gaKey))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        var a = j && j.result;
        if (!a) return;
        var d = { line_1: a.line_1, town_or_city: a.post_town, county: a.county, postcode: a.postcode, latitude: a.latitude, longitude: a.longitude,
          uprn: a.uprn, formatted_address: [a.line_1, a.line_2, a.line_3, a.post_town] };
        self.a.addr = d;
        var full = (d.formatted_address || []).filter(Boolean).join(', ');
        if (full) { self.a.address = full + (d.postcode ? ', ' + d.postcode : ''); inp.value = self.a.address; }
      }).catch(function () {});
  };

  // ── Events ─────────────────────────────────────────────────────────────────
  Estimator.prototype.onClick = function (e) {
    var el = e.target.closest('[data-act]');
    if (!el || !this.root.contains(el)) return;
    var act = el.getAttribute('data-act'), s = STEPS[this.step], self = this;
    if (act === 'opt') {
      this.a[s.key] = el.getAttribute('data-v');
      this.root.querySelectorAll('.s2e-opt').forEach(function (b) { b.classList.toggle('sel', b === el); b.querySelector('.mk').textContent = b === el ? '✓' : '→'; });
      this.track('answer', { s2e_answer: this.a[s.key] });
      setTimeout(function () { self.next(); }, 200);
    }
    else if (act === 'occ-') { this.a.occupants = Math.max(1, this.a.occupants - 1); this.render(); }
    else if (act === 'occ+') { this.a.occupants = Math.min(6, this.a.occupants + 1); this.render(); }
    else if (act === 'next') this.next();
    else if (act === 'back') { if (this.rent) { this.rent = false; this.render(); } else this.go(Math.max(0, this.step - 1)); }
    else if (act === 'pick') this.pick(+el.getAttribute('data-i'));
  };

  Estimator.prototype.onInput = function (e) {
    var f = e.target.getAttribute('data-f');
    if (!f) return;
    if (f === 'consent') this.a.consent = e.target.checked;
    else if (f === 'bill') {
      this.a.bill = +e.target.value;
      this.root.querySelector('[data-o=bill]').textContent = '£' + this.a.bill + (this.a.bill >= 500 ? '+' : '');
      this.root.querySelector('[data-o=billyr]').textContent = fmt(this.a.bill * 12);
    }
    else {
      this.a[f] = e.target.value;
      if (f === 'postcode' && e.type === 'change' && fmtPostcode(e.target.value)) { e.target.value = this.a.postcode = fmtPostcode(e.target.value); }
    }
    this.syncNext();
  };

  Estimator.prototype.onKey = function (e) {
    var list = this.root.querySelector('.s2e-sugg');
    if (list && !list.hidden && this._sugg && this._sugg.length && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === 'Escape')) {
      e.preventDefault();
      if (e.key === 'Escape') { list.hidden = true; return; }
      if (e.key === 'Enter') { if (this._act >= 0) this.pick(this._act); return; }
      this._act = Math.max(0, Math.min(this._sugg.length - 1, this._act + (e.key === 'ArrowDown' ? 1 : -1)));
      list.querySelectorAll('li').forEach(function (li, i) { li.classList.toggle('act', i === this._act); }, this);
      return;
    }
    if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'checkbox') { e.preventDefault(); this.next(); }
  };

  Estimator.prototype.syncNext = function () {
    var b = this.root.querySelector('[data-act=next]');
    if (b) b.disabled = !this.valid();
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  Estimator.prototype.render = function () {
    var pct = this.done ? 100 : (this.step / STEPS.length) * 100;
    this.body.innerHTML =
      '<div class="s2e-prog"><i style="width:' + pct + '%"></i></div>' +
      '<div class="s2e-grid">' + this.side() + '<section class="s2e-main">' + this.main() + '</section></div>';
    var f = this.root.querySelector('.s2e-main input:not([type=checkbox]):not([type=range]):not(.s2e-hp input)');
    if (f && window.matchMedia('(min-width:768px)').matches) f.focus({ preventScroll: true });
    if (this.done) {
      var root = this.root;
      requestAnimationFrame(function () { requestAnimationFrame(function () {
        root.querySelectorAll('[data-w]').forEach(function (el) { el.style.width = el.getAttribute('data-w'); });
        root.querySelectorAll('[data-h]').forEach(function (el) { el.style.height = el.getAttribute('data-h'); });
      }); });
    }
  };

  Estimator.prototype.ticker = function () {
    var pts = ['15+ years engineering experience', '1,000+ solar installs', '66% average saving on energy bills', 'Free home visit'];
    var run = pts.map(function (p) { return '<span><b></b>' + p + '</span>'; }).join('');
    return '<div class="s2e-tick" aria-label="' + pts.join(', ') + '"><div class="s2e-tick-run" aria-hidden="true">' + run + run + '</div></div>';
  };

  Estimator.prototype.side = function () {
    var a = this.a, step = this.step, done = this.done;
    var items = STEPS.map(function (s, i) {
      var cls = done || i < step ? 'done' : (i === step ? 'cur' : '');
      var v = '';
      if (done) {
        v = s.type === 'options' ? optLabel(s.key, a[s.key]) : s.key === 'occupants' ? (a.occupants >= 6 ? '6+' : a.occupants) : s.key === 'bill' ? '£' + a.bill + '/mo' : '✓';
      } else if (i < step) v = '✓';
      return '<li class="' + cls + '"><span class="n">' + pad(i) + '</span><span class="l">' + esc(s.label) + '</span><span class="v">' + esc(v) + '</span></li>';
    }).join('');
    return '<aside class="s2e-side">' +
      '<div style="display:flex;flex-direction:column;gap:8px"><div class="s2e-kick"><b></b>Solar savings estimate</div><div class="s2e-side-title">' + (done ? 'Your home, at a glance.' : 'Find out how much you could save.') + '</div></div>' +
      '<div class="s2e-stats"><div><strong>15+</strong>years engineering experience</div><div><strong>1,000+</strong>solar installs completed</div><div><strong>66%</strong>average saving on energy bills</div></div>' +
      '<ol class="s2e-steps">' + items + '</ol></aside>';
  };

  Estimator.prototype.nav = function (label) {
    var s = STEPS[this.step];
    var showNext = s.type !== 'options' || !!this.a[s.key];
    return '<div class="s2e-nav">' +
      (this.step > 0 ? '<button type="button" class="s2e-back" data-act="back">← Back</button>' : '') +
      (showNext ? '<button type="button" class="s2e-next" data-act="next"' + (this.valid() ? '' : ' disabled') + '><span>' + (label || 'Continue') + '</span><span>→</span></button>' : '') +
      '</div>';
  };

  Estimator.prototype.main = function () {
    var a = this.a, s = STEPS[this.step];
    if (this.done) return this.results();
    if (this.rent) return '<div class="s2e-form"><h1>Sorry, we can\'t help this time.</h1><p style="font-size:16px">We can only install solar panels for homeowners. If you picked the wrong answer, go back and change it.</p><div><button type="button" class="s2e-ghost" data-act="back">← Go back</button></div></div>';
    var head = '<div class="s2e-count"><span>Step ' + (this.step + 1) + ' of ' + STEPS.length + '</span><i></i></div>';
    var body = '', label;
    if (s.type === 'options') {
      body = '<div style="display:flex;flex-direction:column;gap:24px"><h1>' + esc(s.title) + '</h1><div class="s2e-opts" role="radiogroup">' +
        s.options.map(function (o, i) {
          var sel = a[s.key] === o.v;
          return '<button type="button" role="radio" aria-checked="' + sel + '" class="s2e-opt' + (sel ? ' sel' : '') + '" data-act="opt" data-v="' + o.v + '">' +
            '<span class="top"><span>' + pad(i) + '</span><span class="mk">' + (sel ? '✓' : '→') + '</span></span>' +
            '<span><span class="lab">' + esc(o.label) + '</span><span class="sub">' + esc(o.sub || '') + '</span></span></button>';
        }).join('') + '</div><p class="s2e-hint">Pick one to continue.</p></div>';
    } else if (s.type === 'occupants') {
      body = '<div style="display:flex;flex-direction:column;gap:24px"><h1>' + s.title + '</h1><div class="s2e-stepper">' +
        '<button type="button" data-act="occ-" aria-label="Fewer people">−</button>' +
        '<div class="val"><span class="s2e-big">' + (a.occupants >= 6 ? '6+' : a.occupants) + '</span><span style="font-size:13px">' + (a.occupants === 1 ? 'person' : 'people') + '</span></div>' +
        '<button type="button" data-act="occ+" aria-label="More people">+</button></div></div>';
    } else if (s.type === 'bill') {
      body = '<div style="display:flex;flex-direction:column;gap:24px"><h1>' + s.title + '</h1><div class="s2e-bill">' +
        '<div class="row"><span class="s2e-big" data-o="bill">£' + a.bill + (a.bill >= 500 ? '+' : '') + '</span><span style="font-size:14px">per month · £<span data-o="billyr">' + fmt(a.bill * 12) + '</span> a year</span></div>' +
        '<input type="range" min="50" max="500" step="10" value="' + a.bill + '" data-f="bill" aria-label="Monthly electricity bill">' +
        '<div class="s2e-ends"><span>£50</span><span>£500+</span></div></div></div>';
    } else if (s.type === 'address') {
      body = '<div class="s2e-form"><h1>' + s.title + '</h1>' +
        '<div class="s2e-field"><label for="s2e-addr1">House number and street</label><input id="s2e-addr1" class="s2e-input" data-f="addr1" autocomplete="address-line1" placeholder="e.g. 12 High Street" value="' + esc(a.addr1) + '"></div>' +
        '<div class="s2e-pair">' +
        '<div class="s2e-field"><label for="s2e-town">Town or city</label><input id="s2e-town" class="s2e-input" data-f="town" autocomplete="address-level2" value="' + esc(a.town) + '"></div>' +
        '<div class="s2e-field"><label for="s2e-postcode">Postcode</label><input id="s2e-postcode" class="s2e-input" data-f="postcode" autocomplete="postal-code" autocapitalize="characters" placeholder="e.g. SK7 1GP" value="' + esc(a.postcode) + '"></div>' +
        '</div><p class="s2e-hint">We use this to check your roof on satellite imagery.</p></div>';
    } else if (s.type === 'name') {
      body = '<div class="s2e-form"><div style="display:flex;flex-direction:column;gap:8px"><h1>Almost there.</h1><p style="font-size:16px">Who should we send your estimate to?</p></div><div class="s2e-pair">' +
        '<div class="s2e-field"><label for="s2e-first">First name</label><input id="s2e-first" class="s2e-input" data-f="first" autocomplete="given-name" value="' + esc(a.first) + '"></div>' +
        '<div class="s2e-field"><label for="s2e-last">Last name</label><input id="s2e-last" class="s2e-input" data-f="last" autocomplete="family-name" value="' + esc(a.last) + '"></div></div></div>';
    } else if (s.type === 'contact') {
      label = 'See my estimate';
      body = '<div class="s2e-form"><div style="display:flex;flex-direction:column;gap:8px"><h1>Last step, ' + esc(a.first.trim() || 'there') + '.</h1><p style="font-size:16px">Your figures appear on the next screen.</p></div>' +
        '<div class="s2e-field"><label for="s2e-email">Email address</label><input id="s2e-email" type="email" class="s2e-input" data-f="email" autocomplete="email" value="' + esc(a.email) + '"></div>' +
        '<div class="s2e-field"><label for="s2e-phone">Mobile number</label><div class="s2e-tel"><span>+44</span><input id="s2e-phone" type="tel" class="s2e-input" data-f="phone" autocomplete="tel-national" placeholder="07700 900123" value="' + esc(a.phone) + '"></div></div>' +
        '<div class="s2e-hp" aria-hidden="true"><label>Leave this field empty<input type="text" name="s2e_hp_x9" tabindex="-1" autocomplete="new-password" data-f="hp"></label></div>' +
        '<label class="s2e-consent"><input type="checkbox" data-f="consent"' + (a.consent ? ' checked' : '') + '><span class="s2e-box">' + ICON_CHECK + '</span>' +
        '<span>I agree to the <a href="' + esc(this.privacy) + '" target="_blank" rel="noopener">privacy policy</a> and to Sun2Energy contacting me about my estimate.</span></label></div>';
    }
    return head + body + this.nav(label);
  };

  Estimator.prototype.results = function () {
    var a = this.a, r = this.result, name = esc(a.first.trim() || 'there');
    var bars = [
      { l: 'Today', n: 'No solar', v: r.spend, bg: 'var(--track)', bd: 'var(--track)' },
      { l: 'With solar', n: '−£' + fmt(r.solar) + ' a year', v: Math.max(0, r.spend - r.solar), bg: 'var(--teal)', bd: 'var(--teal)' },
      { l: 'Solar + battery', n: '−£' + fmt(r.battery) + ' a year', v: Math.max(0, r.spend - r.battery), bg: 'var(--yellow)', bd: 'var(--teal)' }
    ].map(function (b) {
      return '<div class="s2e-bar"><div class="l"><b>' + b.l + '</b><span>' + b.n + '</span></div><div class="t"><div class="w"><div class="f" data-w="' + Math.max(3, b.v / r.spend * 100) + '%" style="background:' + b.bg + ';border-color:' + b.bd + '"></div></div><span class="v">£' + fmt(b.v) + '</span></div></div>';
    }).join('');
    var marks = [5, 10, 15, 20, 25], max = r.cum[C.years - 1];
    var cols = marks.map(function (y) {
      return '<div class="s2e-col"><b>£' + fmt(r.cum[y - 1]) + '</b><i data-h="' + (r.cum[y - 1] / max * 82) + '%" style="background:' + (y >= r.payback ? 'var(--teal)' : 'var(--track)') + '"></i></div>';
    }).join('');
    return '<div style="display:flex;flex-direction:column;gap:24px">' +
      '<div style="display:flex;flex-direction:column;gap:8px;max-width:640px"><div class="s2e-kick" style="color:var(--teal)">Your estimate</div><h1>' + name + ', solar + battery could save you £' + fmt(r.battery) + ' a year.</h1></div>' +
      '<div class="s2e-panel"><div class="s2e-panel-h"><strong>Your yearly electricity bill</strong><span>Based on £' + a.bill + '/month today</span></div><div class="s2e-bars">' + bars + '</div>' +
      '<div class="s2e-kpis"><div class="hi"><span>Bill cut by</span><strong>' + r.batteryPct + '%</strong></div><div><span>Saved over 25 years</span><strong>£' + fmt(r.lifetime) + '</strong></div><div><span>Pays for itself in</span><strong>' + r.payback.toFixed(1) + ' yrs</strong></div></div></div>' +
      '<div class="s2e-panel"><div class="s2e-panel-h"><strong>Savings add up</strong><span><i class="s2e-sw" style="background:var(--teal)"></i>Paid back<i class="s2e-sw" style="background:var(--track);margin-left:8px"></i>Paying back</span></div>' +
      '<div class="s2e-cols">' + cols + '</div><div class="s2e-axis">' + marks.map(function (y) { return '<span>Year ' + y + '</span>'; }).join('') + '</div></div>' +
      '<p style="font-size:14px;max-width:640px;text-wrap:pretty">Estimated ' + (Math.round(r.kwp * 10) / 10) + ' kWp system generating around ' + fmt(r.gen) + ' kWh a year. These figures are based on your answers — in 9 out of 10 cases a free home visit improves them, because the right equipment specification makes a big difference to long-term savings.</p>' +
      '<div class="s2e-next-steps"><div class="s2e-kick">Next steps</div><p>We\'ll be in touch within 1–2 working days to arrange your free home visit.</p></div></div>';
  };

  // ── Boot ───────────────────────────────────────────────────────────────────
  function injectAssets() {
    if (document.getElementById('s2e-css')) return;
    var f = document.createElement('link');
    f.rel = 'stylesheet'; f.href = 'https://fonts.googleapis.com/css2?family=Archivo:wght@400;600;800&display=swap';
    document.head.appendChild(f);
    var st = document.createElement('style'); st.id = 's2e-css'; st.textContent = CSS;
    document.head.appendChild(st);
  }

  // data-getaddress-key may be one token, or "host=token, host=token" to use a different domain token per site.
  function pickKey(v) {
    if (!v || v.indexOf('=') < 0) return v;
    var host = location.hostname.replace(/^www\./, ''), first = null, hit = null;
    v.split(',').forEach(function (pair) {
      var p = pair.split('='), k = (p[0] || '').trim().replace(/^www\./, ''), t = (p[1] || '').trim();
      if (!t) return; if (!first) first = t; if (k === host) hit = t;
    });
    return hit || first;
  }

  function mount(el, opts) {
    if (el.__s2e) return el.__s2e;
    injectAssets();
    opts = opts || {};
    var d = el.dataset;
    el.__s2e = new Estimator(el, {
      webhook: opts.webhook || d.webhook,
      getaddressKey: pickKey(opts.addressKey || d.addressKey || opts.getaddressKey || d.getaddressKey),
      privacyUrl: opts.privacyUrl || d.privacyUrl,
      logoUrl: opts.logoUrl || d.logoUrl,
      showHeader: (opts.showHeader != null ? opts.showHeader : d.showHeader) !== 'false' && opts.showHeader !== false
    });
    return el.__s2e;
  }

  window.S2EEstimator = { mount: mount, config: C, calc: calc };
  function boot() { document.querySelectorAll('[data-s2e-estimator]').forEach(function (el) { mount(el); }); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
