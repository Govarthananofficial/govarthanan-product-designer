/*!
 * Visitor tracker — anonymous, first-party, one row per visit.
 *
 * Entirely new build, paired with a from-scratch google-apps-script-analytics.gs
 * deployed into a brand new Google Sheet. No cookies, no cross-site tracking,
 * no permission prompts, no name/email — kept fully separate from the
 * contact form's lead-capture pipeline.
 *
 * ANALYTICS_URL below must be the /exec URL from that new deployment. Until
 * it's set, every call in here silently does nothing.
 *
 * A "visit" is everything one person does in one browser tab, even across
 * several pages. sessionStorage (cleared the instant the tab closes — never
 * a cookie, never long-lived) tracks it and the client tells the backend
 * which moment of the visit a request represents:
 *   phase "start"    — first page of a brand new visit. Backend inserts a row.
 *   phase "continue" — every later page of the SAME visit. Backend updates
 *                      that row's Exit Page / page trail / count, and
 *                      refreshes Device/OS/Location with anything that
 *                      resolved more precisely since.
 *   phase "leave"    — page is being hidden/closed. Backend fills in the
 *                      final Time on Site for that visit's row.
 *   phase "refine"   — fires a moment after "start", once IP-location and
 *                      Client Hints device-model lookups resolve (both are
 *                      async and never ready in time for "start" itself).
 *                      Patches Location/Device/OS in place, even if the
 *                      visitor never loads a second page.
 * A resume-PDF click sends event "download" instead — flips Resume
 * Downloaded to Yes on the same visit's row, no new row.
 */
(function () {
  'use strict';

  var ANALYTICS_URL = 'https://script.google.com/macros/s/AKfycbyHet4FYi5PaLE527o89edrOlX43U5sclFp6G5AbBw2tin6X7xjNEx5yRD6cj6cHyCK/exec';

  // ── Page labels ──────────────────────────────────────────────────────────
  var PAGE_TITLES = {
    '/': 'Home',
    '/index.html': 'Home',
    '/river-rumble-blast-case-study.html': 'River Rumble Blast',
    '/unbond-case-study.html': 'Unbond',
    '/amazon-tracking-redesign.html': 'Amazon Order Tracking',
    '/framestack-pdf.html': 'FrameStack PDF',
    '/sds-motion-forge.html': 'SDS Motion Forge'
  };

  function resolvePageLabel() {
    var path = location.pathname;
    if (PAGE_TITLES[path]) return PAGE_TITLES[path];
    var trimmed = path.replace(/^\//, '').replace(/\.html$/, '');
    return trimmed || 'Home';
  }

  // ── Timestamp — IST, down to the second ────────────────────────────────
  function preciseTimestamp() {
    return new Date().toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
    });
  }

  // ── Browser / device category from the UA string ───────────────────────
  function detectBrowser(ua) {
    if (/edg/i.test(ua)) return 'Edge';
    if (/OPR|Opera/i.test(ua)) return 'Opera';
    if (/chrome|crios/i.test(ua)) return /chromium/i.test(ua) ? 'Chromium' : 'Chrome';
    if (/safari/i.test(ua)) return 'Safari';
    if (/firefox|iceweasel|fxios/i.test(ua)) return 'Firefox';
    if (/msie|trident/i.test(ua)) return 'Internet Explorer';
    return 'Mozilla-compatible';
  }

  function detectCategory(ua) {
    if (/Tablet|iPad|PlayBook|Silk/i.test(ua)) return 'Tablet';
    if (/Mobi|Android|iPhone|iPad|iPod|Windows Phone|IEMobile|BlackBerry/i.test(ua)) return 'Mobile';
    return 'Desktop';
  }

  // ── Android brand from its model code — covers brands dominant in the
  // Indian market; unmatched codes still show the raw code rather than
  // getting dropped. ──
  var ANDROID_BRAND_RULES = [
    [/^SM-/i, 'Samsung'],
    [/^CPH/i, 'Oppo'],
    [/^RMX/i, 'Realme'],
    [/realme/i, 'Realme'],
    [/^V2\d{3}/i, 'vivo'],
    [/^I2\d{3}/i, 'iQOO'],
    [/iqoo/i, 'iQOO'],
    [/redmi/i, 'Redmi'],
    [/poco/i, 'POCO'],
    [/^M(19|20|21|22)\w*/i, 'Xiaomi/Redmi'],
    [/^2\d{5,}/i, 'Xiaomi/Redmi'], // Xiaomi numeric-first codenames, e.g. "2201116SG"
    [/^moto/i, 'Motorola'],
    [/oneplus/i, 'OnePlus'],
    [/^GM\d/i, 'OnePlus'],
    [/^pixel/i, 'Google Pixel'],
    [/^LG-/i, 'LG'],
    [/nokia/i, 'Nokia'],
    [/lenovo/i, 'Lenovo'],
    [/^infinix/i, 'Infinix'],
    [/^tecno/i, 'Tecno'],
    [/^asus/i, 'Asus'],
    [/^nothing/i, 'Nothing']
  ];

  function resolveAndroidDevice(modelCode) {
    for (var i = 0; i < ANDROID_BRAND_RULES.length; i++) {
      if (ANDROID_BRAND_RULES[i][0].test(modelCode)) {
        return ANDROID_BRAND_RULES[i][1] + ' (' + modelCode + ')';
      }
    }
    return 'Android (' + modelCode + ')';
  }

  // ── iPhone model guess by CSS screen size — Apple exposes no API for the
  // exact model (unlike Android's opt-in Client Hints), so this is the
  // standard workaround. Several models share a resolution, hence a group
  // rather than one guaranteed model. ──
  var IPHONE_SIZE_TABLE = [
    ['320x480', 'iPhone 4/4s'],
    ['320x568', 'iPhone 5/5s/5c/SE (1st gen)'],
    ['375x667', 'iPhone 6/6s/7/8/SE (2nd/3rd gen)'],
    ['414x736', 'iPhone 6+/6s+/7+/8+'],
    ['375x812', 'iPhone X/XS/11 Pro/12 mini/13 mini'],
    ['414x896', 'iPhone XR/XS Max/11/11 Pro Max'],
    ['390x844', 'iPhone 12/12 Pro/13/13 Pro/14'],
    ['428x926', 'iPhone 12 Pro Max/13 Pro Max/14 Plus'],
    ['393x852', 'iPhone 14 Pro/15/15 Pro/16'],
    ['430x932', 'iPhone 14 Pro Max/15 Pro Max/15 Plus/16 Plus'],
    ['402x874', 'iPhone 16 Pro'],
    ['440x956', 'iPhone 16 Pro Max']
  ];

  function resolveIphoneModel() {
    var short = Math.min(screen.width, screen.height);
    var long = Math.max(screen.width, screen.height);
    var key = short + 'x' + long;
    for (var i = 0; i < IPHONE_SIZE_TABLE.length; i++) {
      if (IPHONE_SIZE_TABLE[i][0] === key) return IPHONE_SIZE_TABLE[i][1] + ' (~' + key + ')';
    }
    return 'iPhone (' + key + ', unrecognized size)';
  }

  function resolveDeviceLabel(ua) {
    if (/windows phone/i.test(ua)) return 'Windows Phone';
    if (/ipad/i.test(ua)) return 'iPad';
    if (/iphone/i.test(ua)) return resolveIphoneModel();
    if (/android/i.test(ua)) {
      var match = ua.match(/Linux;\s+Android\s+[^;]+;\s+([^)]+)/i);
      return (match && match[1]) ? resolveAndroidDevice(match[1].trim()) : 'Android Device';
    }
    if (/macintosh/i.test(ua) || /mac os x/i.test(ua)) {
      return (navigator.maxTouchPoints && navigator.maxTouchPoints > 2) ? 'iPad (macOS Mode)' : 'Macintosh';
    }
    if (/windows/i.test(ua)) return 'Windows PC';
    if (/linux/i.test(ua)) return 'Linux PC';
    if (/cros/i.test(ua)) return 'ChromeOS Device';
    return 'Generic Device';
  }

  // Kept separate from the device label so both read cleanly on their own
  // (e.g. Device: "Samsung (SM-A536E)", OS: "Android 13").
  function resolveOSLabel(ua) {
    var match;
    if (/iphone|ipad|ipod/i.test(ua)) {
      match = ua.match(/OS (\d+)_(\d+)/);
      return match ? 'iOS ' + match[1] + '.' + match[2] : 'iOS';
    }
    if (/android/i.test(ua)) {
      match = ua.match(/Android\s+([\d.]+)/i);
      return match ? 'Android ' + match[1] : 'Android';
    }
    if (/windows nt 10/i.test(ua)) return 'Windows 10/11';
    if (/windows nt 6\.3/i.test(ua)) return 'Windows 8.1';
    if (/windows nt 6\.2/i.test(ua)) return 'Windows 8';
    if (/windows nt 6\.1/i.test(ua)) return 'Windows 7';
    match = ua.match(/mac os x ([\d_]+)/i);
    if (match) return 'macOS ' + match[1].replace(/_/g, '.');
    return '';
  }

  // Chrome hides the real device model behind a placeholder ("Android 10; K")
  // for privacy unless a site asks via User-Agent Client Hints. This upgrades
  // the resolved device/OS labels in place when that API is available —
  // Chromium-only; Safari/Firefox keep the regex guesses above, and iOS
  // blocks this entirely regardless of browser. Always resolves (never
  // rejects) so callers can safely wait on it alongside other lookups.
  function upgradeDeviceInfo() {
    if (!(navigator.userAgentData && navigator.userAgentData.getHighEntropyValues)) {
      return Promise.resolve();
    }
    return navigator.userAgentData.getHighEntropyValues(['model', 'platformVersion'])
      .then(function (info) {
        if (!info) return;
        if (info.model) currentDeviceLabel = resolveAndroidDevice(info.model);
        if (info.platformVersion && /android/i.test(navigator.userAgent)) {
          currentOSLabel = 'Android ' + info.platformVersion;
        } else if (info.platformVersion && /windows/i.test(navigator.userAgent)) {
          // Chromium's documented mapping: Windows 11 reports platformVersion >= 13.
          var majorVersion = parseInt(info.platformVersion.split('.')[0], 10);
          currentOSLabel = majorVersion >= 13 ? 'Windows 11' : 'Windows 10';
        }
      })
      .catch(function () { /* keep the UA-string-based guesses */ });
  }

  // Some providers return official UN/ISO long-form country names —
  // "United States of America (the)", "Korea (the Republic of)" — instead of
  // the name everyone actually uses. Maps the common ones; anything unmapped
  // just gets a trailing "(the)" stripped off.
  var COUNTRY_NAME_FIXES = {
    'United States of America (the)': 'United States',
    'United States of America': 'United States',
    'United Kingdom of Great Britain and Northern Ireland (the)': 'United Kingdom',
    'Russian Federation (the)': 'Russia',
    'Russian Federation': 'Russia',
    'Korea (the Republic of)': 'South Korea',
    "Korea (the Democratic People's Republic of)": 'North Korea',
    'Iran (Islamic Republic of)': 'Iran',
    'Netherlands (the)': 'Netherlands',
    'Philippines (the)': 'Philippines',
    'Bahamas (the)': 'Bahamas',
    'Gambia (the)': 'Gambia',
    'Niger (the)': 'Niger',
    'Sudan (the)': 'Sudan',
    'Comoros (the)': 'Comoros',
    'Congo (the Democratic Republic of the)': 'DR Congo',
    'Congo (the)': 'Congo',
    'Central African Republic (the)': 'Central African Republic',
    'Dominican Republic (the)': 'Dominican Republic',
    'Marshall Islands (the)': 'Marshall Islands',
    'Cayman Islands (the)': 'Cayman Islands',
    'United Arab Emirates (the)': 'United Arab Emirates',
    'Moldova (the Republic of)': 'Moldova',
    "Lao People's Democratic Republic (the)": 'Laos',
    'Taiwan (Province of China)': 'Taiwan',
    'Viet Nam': 'Vietnam',
    'Syrian Arab Republic': 'Syria'
  };

  function tidyCountryName(name) {
    if (!name) return name;
    if (COUNTRY_NAME_FIXES[name]) return COUNTRY_NAME_FIXES[name];
    return name.replace(/\s*\(the\)\s*$/i, '').trim();
  }

  // ── Location — one accurate text box. NO latitude/longitude anywhere.
  // 5-provider IP lookup fallback chain, tried in order until one returns a
  // usable place name. Never calls navigator.geolocation, so no permission
  // popup ever shows — this is the practical accuracy ceiling for a silent,
  // zero-friction lookup.
  //
  // Two things make the chain resilient rather than just long:
  //   - Every provider gets a hard timeout. Some in-app browsers (Instagram,
  //     LinkedIn, Reddit) run their own network-level tracker filtering that
  //     can silently hang a blocked request forever instead of failing fast —
  //     without a timeout, that stalls the whole chain and even the later,
  //     un-blocked providers never get tried.
  //   - 5 providers across 5 different domains means one provider being
  //     blocked, rate-capped (BigDataCloud's free tier is only 50/day), or
  //     down doesn't sink the whole lookup — it just falls through to the
  //     next.
  var currentLocation = 'Unknown Location';
  var LOCATION_TIMEOUT_MS = 4000;

  var LOCATION_PROVIDERS = [
    {
      url: 'https://api.bigdatacloud.net/data/reverse-geocode-client',
      parse: function (data) {
        var country = tidyCountryName(data.countryName);
        var place = data.locality || data.city;
        var areaPart = (data.city && data.locality && data.locality !== data.city)
          ? data.locality + ', ' + data.city
          : place;
        if (data.postcode) areaPart = areaPart ? areaPart + ' ' + data.postcode : data.postcode;
        return [areaPart, data.principalSubdivision, country].filter(Boolean).join(', ');
      }
    },
    {
      url: 'https://ipapi.co/json/',
      parse: function (data) {
        var country = tidyCountryName(data.country_name);
        var areaPart = data.postal ? (data.city ? data.city + ' ' + data.postal : data.postal) : data.city;
        return [areaPart, data.region, country].filter(Boolean).join(', ');
      }
    },
    {
      url: 'https://ipwho.is/',
      parse: function (data) {
        if (!data || data.success === false) return '';
        var country = tidyCountryName(data.country);
        var areaPart = data.postal ? (data.city ? data.city + ' ' + data.postal : data.postal) : data.city;
        return [areaPart, data.region, country].filter(Boolean).join(', ');
      }
    },
    {
      url: 'https://ipinfo.io/json',
      parse: function (data) {
        var country = tidyCountryName(data.country);
        var areaPart = data.postal ? (data.city ? data.city + ' ' + data.postal : data.postal) : data.city;
        return [areaPart, data.region, country].filter(Boolean).join(', ');
      }
    },
    {
      url: 'https://get.geojs.io/v1/ip/geo.json',
      parse: function (data) {
        var country = tidyCountryName(data.country);
        return [data.city, data.region, country].filter(Boolean).join(', ');
      }
    }
  ];

  function withTimeout(promise, ms) {
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () { reject(new Error('location lookup timed out')); }, ms);
      promise.then(
        function (v) { clearTimeout(timer); resolve(v); },
        function (e) { clearTimeout(timer); reject(e); }
      );
    });
  }

  function tryLocationProvider(index) {
    if (index >= LOCATION_PROVIDERS.length) return Promise.resolve();
    var provider = LOCATION_PROVIDERS[index];
    return withTimeout(
      fetch(provider.url).then(function (res) { return res.ok ? res.json() : Promise.reject(); }),
      LOCATION_TIMEOUT_MS
    )
      .then(function (data) {
        var text = provider.parse(data);
        if (text) currentLocation = text;
        else return tryLocationProvider(index + 1);
      })
      .catch(function () { return tryLocationProvider(index + 1); });
  }

  function fetchAccurateLocation() {
    return tryLocationProvider(0);
  }

  // ── Traffic source — where the visit actually came from.
  //
  // Priority order:
  //   1. ?utm_source=… or ?src=… on the URL — the ONLY fully reliable signal.
  //      Tag links shared on WhatsApp/Instagram/etc. with this (e.g.
  //      "?utm_source=whatsapp"), because those apps typically strip the
  //      referrer entirely when opening a link in the system browser.
  //   2. In-app browser sniffing — Instagram, Facebook, and LinkedIn's own
  //      in-app browsers add a recognizable token to the User-Agent, so taps
  //      inside those apps are identifiable even with no referrer.
  //   3. document.referrer domain — covers Google, direct social-site visits
  //      (e.g. clicking through from linkedin.com/feed on desktop), YouTube.
  //   4. "Direct / None" — no referrer and no UTM tag; most WhatsApp/
  //      Instagram-DM taps land here without tagging (#1). ──
  var SOURCE_ALIASES = {
    instagram: 'Instagram', ig: 'Instagram',
    linkedin: 'LinkedIn',
    whatsapp: 'WhatsApp', wa: 'WhatsApp',
    facebook: 'Facebook', fb: 'Facebook',
    twitter: 'Twitter/X', x: 'Twitter/X',
    google: 'Google',
    youtube: 'YouTube',
    tiktok: 'TikTok',
    reddit: 'Reddit',
    pinterest: 'Pinterest',
    telegram: 'Telegram',
    email: 'Email', newsletter: 'Email'
  };

  var REFERRER_HOST_RULES = [
    [/(^|\.)google\./i, 'Google'],
    [/(^|\.)bing\.com$/i, 'Bing'],
    [/(^|\.)duckduckgo\.com$/i, 'DuckDuckGo'],
    [/(^|\.)yahoo\./i, 'Yahoo'],
    [/(^|\.)instagram\.com$/i, 'Instagram'],
    [/(^|\.)facebook\.com$/i, 'Facebook'],
    [/^fb\.me$/i, 'Facebook'],
    [/(^|\.)linkedin\.com$/i, 'LinkedIn'],
    [/^lnkd\.in$/i, 'LinkedIn'],
    [/(^|\.)twitter\.com$/i, 'Twitter/X'],
    [/(^|\.)x\.com$/i, 'Twitter/X'],
    [/^t\.co$/i, 'Twitter/X'],
    [/(^|\.)whatsapp\.com$/i, 'WhatsApp'],
    [/^wa\.me$/i, 'WhatsApp'],
    [/(^|\.)youtube\.com$/i, 'YouTube'],
    [/^youtu\.be$/i, 'YouTube'],
    [/(^|\.)reddit\.com$/i, 'Reddit'],
    [/(^|\.)pinterest\./i, 'Pinterest'],
    [/^t\.me$/i, 'Telegram'],
    [/(^|\.)telegram\.org$/i, 'Telegram'],
    [/(^|\.)github\.com$/i, 'GitHub'],
    [/(^|\.)behance\.net$/i, 'Behance'],
    [/(^|\.)dribbble\.com$/i, 'Dribbble']
  ];

  function readUrlParam(name) {
    var match = location.search.match(new RegExp('[?&]' + name + '=([^&]+)'));
    return match ? decodeURIComponent(match[1]) : '';
  }

  function hostOf(url) {
    try { return new URL(url).hostname.replace(/^www\./, ''); }
    catch (e) { return ''; }
  }

  function resolveTrafficSource(ua, referrer) {
    var tag = (readUrlParam('utm_source') || readUrlParam('src')).toLowerCase();
    if (tag) return SOURCE_ALIASES[tag] || (tag.charAt(0).toUpperCase() + tag.slice(1));

    if (/instagram/i.test(ua)) return 'Instagram';
    if (/FBAN|FBAV|FB_IAB|FBIOS/i.test(ua)) return 'Facebook';
    if (/LinkedInApp/i.test(ua)) return 'LinkedIn';

    if (!referrer) return 'Direct / None';
    var host = hostOf(referrer);
    if (!host) return 'Direct / None';
    for (var i = 0; i < REFERRER_HOST_RULES.length; i++) {
      if (REFERRER_HOST_RULES[i][0].test(host)) return REFERRER_HOST_RULES[i][1];
    }
    return 'Other (' + host + ')';
  }

  // ── Transport ────────────────────────────────────────────────────────────
  function transmit(payload) {
    if (!ANALYTICS_URL) return; // not configured — no-op, never throws
    var body = JSON.stringify(payload);
    if (navigator.sendBeacon) {
      var blob = new Blob([body], { type: 'text/plain' });
      if (navigator.sendBeacon(ANALYTICS_URL, blob)) return;
    }
    // Fallback for browsers without sendBeacon, or a queue failure.
    // no-cors + keepalive lets this survive page unload without blocking navigation.
    fetch(ANALYTICS_URL, {
      method: 'POST', mode: 'no-cors', keepalive: true,
      headers: { 'Content-Type': 'text/plain' }, body: body
    }).catch(function () {});
  }

  // ── Session (= one visit, possibly across several pages) ────────────────
  // sessionStorage persists across page loads within the SAME TAB and is
  // wiped the instant the tab/window closes — exactly "one row per visit",
  // never a long-lived visitor identifier, never a cookie.
  var VISIT_STORAGE_KEY = 'visit_track_v1';

  function readVisit() {
    try {
      var raw = sessionStorage.getItem(VISIT_STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function writeVisit(visit) {
    try { sessionStorage.setItem(VISIT_STORAGE_KEY, JSON.stringify(visit)); } catch (e) {}
  }

  // ── Handoff window — in-app browsers (Instagram/LinkedIn/Facebook) often
  // open a lightweight preview WebView first, then silently hand off to a
  // second, more capable WebView a few seconds later once you interact.
  // Each is technically a separate browsing context, so sessionStorage (tied
  // to one tab/context) resets between them and looks like two unrelated
  // visits, even though it was one tap. localStorage is shared across those
  // contexts within the same app, so a short-lived (15s) breadcrumb there
  // lets the second context recognize "this is a handoff, not a new visit"
  // and continue the same row instead of inserting a duplicate. ──
  var HANDOFF_STORAGE_KEY = 'visit_handoff_v1';
  var HANDOFF_WINDOW_MS = 15000;

  function readHandoff() {
    try {
      var raw = localStorage.getItem(HANDOFF_STORAGE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || (Date.now() - parsed.savedAt) > HANDOFF_WINDOW_MS) return null;
      return parsed;
    } catch (e) { return null; }
  }

  function writeHandoff(visit) {
    try {
      var copy = {};
      for (var k in visit) copy[k] = visit[k];
      copy.savedAt = Date.now();
      localStorage.setItem(HANDOFF_STORAGE_KEY, JSON.stringify(copy));
    } catch (e) {}
  }

  function newVisitId() {
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  var ua = navigator.userAgent;
  var page = resolvePageLabel();
  var browser = detectBrowser(ua);
  var category = detectCategory(ua);
  var currentDeviceLabel = resolveDeviceLabel(ua); // upgraded in place by upgradeDeviceInfo() if possible
  var currentOSLabel = resolveOSLabel(ua);          // upgraded in place by upgradeDeviceInfo() if possible
  var referrer = document.referrer || '';
  var language = navigator.language || navigator.userLanguage || 'Unknown';
  var screenSize = screen.width + '×' + screen.height + ' @' + (window.devicePixelRatio || 1) + 'x';
  var leaveSent = false;

  var visit = readVisit();
  var isNewVisit = !visit;
  if (isNewVisit) {
    var trafficSource = resolveTrafficSource(ua, referrer);
    var handoff = readHandoff();
    if (handoff && handoff.entryPage === page && handoff.source === trafficSource) {
      visit = handoff;
      isNewVisit = false;
      if (visit.pagesSeen[visit.pagesSeen.length - 1] !== page) visit.pagesSeen.push(page);
    } else {
      visit = {
        visitId: newVisitId(),
        entryPage: page,
        pagesSeen: [page],
        source: trafficSource,
        startedAt: Date.now()
      };
    }
  } else if (visit.pagesSeen[visit.pagesSeen.length - 1] !== page) {
    visit.pagesSeen.push(page);
  }
  writeVisit(visit);
  writeHandoff(visit);

  function reportVisitState() {
    transmit({
      phase: isNewVisit ? 'start' : 'continue',
      visitId: visit.visitId,
      time: preciseTimestamp(),
      source: visit.source,
      entry: visit.entryPage,
      exit: page,
      pageCount: visit.pagesSeen.length,
      trail: visit.pagesSeen.join(' → '),
      browser: browser,
      device: currentDeviceLabel,
      os: currentOSLabel,
      category: category,
      place: currentLocation,
      lang: language,
      screen: screenSize
    });
  }

  // Fire immediately so a row appears/updates the moment someone loads a
  // page — "is anyone visiting" shouldn't depend on them leaving cleanly.
  reportVisitState();

  // Location and the real device model both resolve asynchronously — never
  // in time for the "start" ping above. Patch the row as soon as both settle
  // (independently of whether the visitor ever loads a second page), so even
  // a single-page bounce still ends up with accurate Location/Device/OS
  // instead of being stuck on "Unknown Location" / a generic UA placeholder.
  Promise.all([fetchAccurateLocation(), upgradeDeviceInfo()]).then(function () {
    transmit({
      phase: 'refine',
      visitId: visit.visitId,
      place: currentLocation,
      device: currentDeviceLabel,
      os: currentOSLabel
    });
  });

  function reportLeave() {
    if (leaveSent) return;
    leaveSent = true;
    var seconds = Math.round((Date.now() - visit.startedAt) / 1000);
    transmit({
      phase: 'leave',
      visitId: visit.visitId,
      duration: seconds
    });
  }

  // visibilitychange (hidden) is the most reliable exit signal on mobile
  // Safari/Chrome, where pagehide/beforeunload are unreliable; pagehide
  // covers desktop back/forward-cache navigations. leaveSent guards against
  // both firing.
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') reportLeave();
  });
  window.addEventListener('pagehide', reportLeave);

  // Resume download tracking — fires immediately on click, since a PDF
  // download doesn't necessarily navigate the visitor away from the page.
  // Flags Resume Downloaded = Yes on this visit's existing row rather than
  // creating a new one.
  document.addEventListener('click', function (e) {
    var link = e.target.closest && e.target.closest('a[href$=".pdf"]');
    if (!link) return;
    transmit({
      event: 'download',
      visitId: visit.visitId,
      time: preciseTimestamp(),
      exit: page
    });
  }, { capture: true });
})();
