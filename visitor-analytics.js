/*!
 * Visitor Analytics — lightweight, anonymous, first-party visit tracker.
 *
 * Runs on every page of the site. Collects only standard, non-invasive signals:
 * browser, device model/OS, approximate (IP-derived) location, screen size,
 * language, traffic source, and time spent on site. No cookies, no
 * cross-site tracking, no permission prompts, no name/email — kept fully
 * anonymous and separate from the contact form's lead-capture pipeline.
 *
 * Backend: a Google Apps Script Web App (see google-apps-script-analytics.gs in
 * this repo) that appends/updates a row per VISIT (not per page load) in a
 * Google Sheet. Deploy that script, then paste the resulting /exec URL into
 * ANALYTICS_URL below. Until it's set, this script silently no-ops.
 *
 * ONE ROW PER VISIT: a "visit" is everything a visitor does in one browser
 * tab, even across several pages. A sessionStorage-backed session (cleared
 * the moment the tab closes — never a cookie, never persisted long-term)
 * tracks the entry page, every page path since, and a per-visit start time:
 *
 *   - stage "enter": the first page of a brand new visit. Appends a row.
 *   - stage "nav":   every later page in the SAME visit. Updates that row's
 *     Exit Page / Pages Visited / Page Path, and refreshes Device/OS/Location.
 *   - stage "exit":  fires when the current page is hidden/unloaded. Fills
 *     in the running Time on Site. If the visitor moves to another page on
 *     the site, its own "nav"/"exit" pings simply keep updating the same row.
 *   - "resume_download": fired immediately when a visitor clicks the resume
 *     PDF — sets Resume Downloaded = Yes on the row, doesn't add a new one.
 */
(function () {
  'use strict';

  var ANALYTICS_URL = 'https://script.google.com/macros/s/AKfycbxWgjLFJZjXAXxYjoQ8NDidaPWVmdt19oi0_iHzLAOfGxgONjFTmVuSVrYS6Kg6F4bl/exec';

  var PAGE_NAMES = {
    '/': 'Home',
    '/index.html': 'Home',
    '/river-rumble-blast-case-study.html': 'River Rumble Blast',
    '/unbond-case-study.html': 'Unbond',
    '/amazon-tracking-redesign.html': 'Amazon Order Tracking',
    '/framestack-pdf.html': 'FrameStack PDF',
    '/sds-motion-forge.html': 'SDS Motion Forge'
  };

  function pageName() {
    var path = location.pathname;
    if (PAGE_NAMES[path]) return PAGE_NAMES[path];
    var clean = path.replace(/^\//, '').replace(/\.html$/, '');
    return clean || 'Home';
  }

  function nowIST() {
    return new Date().toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true
    });
  }

  function getBrowserName(ua) {
    if (/edg/i.test(ua)) return 'Edge';
    if (/OPR|Opera/i.test(ua)) return 'Opera';
    if (/chrome|crios/i.test(ua)) return /chromium/i.test(ua) ? 'Chromium' : 'Chrome';
    if (/safari/i.test(ua)) return 'Safari';
    if (/firefox|iceweasel|fxios/i.test(ua)) return 'Firefox';
    if (/msie|trident/i.test(ua)) return 'Internet Explorer';
    return 'Mozilla-compatible';
  }

  function getDeviceType(ua) {
    var mobileRegex = /Mobi|Android|iPhone|iPad|iPod|Windows Phone|IEMobile|BlackBerry/i;
    var tabletRegex = /Tablet|iPad|PlayBook|Silk/i;
    if (tabletRegex.test(ua)) return 'Tablet';
    if (mobileRegex.test(ua)) return 'Mobile';
    return 'Desktop';
  }

  // ── Android brand/model mapping — covers the brands dominant in the Indian
  // market; falls back to the raw model code if the prefix isn't recognized. ──
  var MODEL_BRAND_PATTERNS = [
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
    [/^2\d{5,}/i, 'Xiaomi/Redmi'], // Xiaomi's numeric-first model/codenames, e.g. "2201116SG"
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

  function brandFromModel(model) {
    for (var i = 0; i < MODEL_BRAND_PATTERNS.length; i++) {
      if (MODEL_BRAND_PATTERNS[i][0].test(model)) {
        return MODEL_BRAND_PATTERNS[i][1] + ' (' + model + ')';
      }
    }
    return 'Android (' + model + ')'; // unrecognized brand — show the raw code
  }

  // ── iPhone model guess — Apple deliberately does not expose the exact
  // iPhone model to websites (no API for it, unlike Android's opt-in Client
  // Hints). The standard workaround is matching CSS screen dimensions
  // against known iPhone sizes; several models share a resolution, so this
  // returns the matching group rather than a single guaranteed model. ──
  var IPHONE_SCREEN_MODELS = [
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

  function guessIphoneModel() {
    var w = Math.min(screen.width, screen.height);
    var h = Math.max(screen.width, screen.height);
    var key = w + 'x' + h;
    for (var i = 0; i < IPHONE_SCREEN_MODELS.length; i++) {
      if (IPHONE_SCREEN_MODELS[i][0] === key) return IPHONE_SCREEN_MODELS[i][1] + ' (~' + key + ')';
    }
    return 'iPhone (' + key + ', unrecognized size)';
  }

  function getDeviceName(ua) {
    if (/windows phone/i.test(ua)) return 'Windows Phone';
    if (/ipad/i.test(ua)) return 'iPad';
    if (/iphone/i.test(ua)) return guessIphoneModel();
    if (/android/i.test(ua)) {
      var m = ua.match(/Linux;\s+Android\s+[^;]+;\s+([^)]+)/i);
      return (m && m[1]) ? brandFromModel(m[1].trim()) : 'Android Device';
    }
    if (/macintosh/i.test(ua) || /mac os x/i.test(ua)) {
      return (navigator.maxTouchPoints && navigator.maxTouchPoints > 2) ? 'iPad (macOS Mode)' : 'Macintosh';
    }
    if (/windows/i.test(ua)) return 'Windows PC';
    if (/linux/i.test(ua)) return 'Linux PC';
    if (/cros/i.test(ua)) return 'ChromeOS Device';
    return 'Generic Device';
  }

  // ── OS version, kept separate from device model so both are readable on
  // their own (e.g. Device: "Samsung (SM-A536E)", OS: "Android 13"). ──
  function getOSVersion(ua) {
    var m;
    if (/iphone|ipad|ipod/i.test(ua)) {
      m = ua.match(/OS (\d+)_(\d+)/);
      return m ? 'iOS ' + m[1] + '.' + m[2] : 'iOS';
    }
    if (/android/i.test(ua)) {
      m = ua.match(/Android\s+([\d.]+)/i);
      return m ? 'Android ' + m[1] : 'Android';
    }
    if (/windows nt 10/i.test(ua)) return 'Windows 10/11';
    if (/windows nt 6\.3/i.test(ua)) return 'Windows 8.1';
    if (/windows nt 6\.2/i.test(ua)) return 'Windows 8';
    if (/windows nt 6\.1/i.test(ua)) return 'Windows 7';
    m = ua.match(/mac os x ([\d_]+)/i);
    if (m) return 'macOS ' + m[1].replace(/_/g, '.');
    return '';
  }

  // Modern Chrome deliberately hides the real device model in navigator.userAgent
  // for privacy (sends a placeholder like "Android 10; K") unless a site asks via
  // the User-Agent Client Hints API. This upgrades resolvedDeviceName/resolvedOS
  // to real values when available — Chromium-only; Safari/Firefox keep the
  // regex-based guesses above (and for iOS, Apple blocks this entirely regardless).
  function loadDeviceModel() {
    if (navigator.userAgentData && navigator.userAgentData.getHighEntropyValues) {
      navigator.userAgentData.getHighEntropyValues(['model', 'platformVersion'])
        .then(function (info) {
          if (info && info.model) resolvedDeviceName = brandFromModel(info.model);
          if (info && info.platformVersion && /android/i.test(navigator.userAgent)) {
            resolvedOSVersion = 'Android ' + info.platformVersion;
          } else if (info && info.platformVersion && /windows/i.test(navigator.userAgent)) {
            // Chromium's documented mapping: Windows 11 reports platformVersion >= 13.
            var major = parseInt(info.platformVersion.split('.')[0], 10);
            resolvedOSVersion = major >= 13 ? 'Windows 11' : 'Windows 10';
          }
        })
        .catch(function () { /* keep the UA-string-based guesses */ });
    }
  }

  // Some providers (BigDataCloud in particular) return the official UN/ISO
  // long-form country name — "United States of America (the)", "Russian
  // Federation (the)", "Korea (the Republic of)" — instead of the name
  // everyone actually uses. Maps the common ones to their normal name;
  // falls back to just stripping a trailing "(the)" for anything unmapped.
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

  function cleanCountryName(name) {
    if (!name) return name;
    if (COUNTRY_NAME_FIXES[name]) return COUNTRY_NAME_FIXES[name];
    return name.replace(/\s*\(the\)\s*$/i, '').trim();
  }

  // ── Location — single accurate text box, no separate lat/long fields.
  // Same 3-provider fallback chain as the contact form (BigDataCloud ->
  // ipapi.co -> ipinfo.io). Still IP-based only — no navigator.geolocation
  // call, so no permission prompt is ever shown; this is the practical
  // accuracy ceiling without asking the visitor for GPS access. Picks the
  // most specific place name each provider offers (neighborhood/locality
  // over city when available) and appends the postcode when BigDataCloud
  // has one, for the most precise "one box" location reasonably obtainable
  // from an IP address alone. ──
  var resolvedLocation = 'Unknown Location';

  function loadLocation() {
    return fetch('https://api.bigdatacloud.net/data/reverse-geocode-client')
      .then(function (res) { return res.ok ? res.json() : Promise.reject(); })
      .then(function (data) {
        var country = cleanCountryName(data.countryName);
        var place = data.locality || data.city;
        var cityPart = (data.city && data.locality && data.locality !== data.city)
          ? data.locality + ', ' + data.city
          : place;
        if (data.postcode) cityPart = cityPart ? cityPart + ' ' + data.postcode : data.postcode;
        var parts = [cityPart, data.principalSubdivision, country].filter(Boolean);
        if (parts.length) resolvedLocation = parts.join(', ');
      })
      .catch(function () {
        return fetch('https://ipapi.co/json/')
          .then(function (res) { return res.ok ? res.json() : Promise.reject(); })
          .then(function (data) {
            var country = cleanCountryName(data.country_name);
            var cityPart = data.postal ? (data.city ? data.city + ' ' + data.postal : data.postal) : data.city;
            var parts = [cityPart, data.region, country].filter(Boolean);
            if (parts.length) resolvedLocation = parts.join(', ');
          });
      })
      .catch(function () {
        return fetch('https://ipinfo.io/json')
          .then(function (res) { return res.ok ? res.json() : Promise.reject(); })
          .then(function (data) {
            var country = cleanCountryName(data.country);
            var cityPart = data.postal ? (data.city ? data.city + ' ' + data.postal : data.postal) : data.city;
            var parts = [cityPart, data.region, country].filter(Boolean);
            if (parts.length) resolvedLocation = parts.join(', ');
          });
      })
      .catch(function () { /* silently give up — stays "Unknown Location" */ });
  }

  // ── Traffic source — where the visit actually came from.
  //
  // Priority order:
  //   1. ?utm_source=… or ?src=… on the URL — the ONLY fully reliable signal.
  //      Tag links shared on WhatsApp/Instagram/etc. with this (e.g.
  //      "?utm_source=whatsapp") because those apps typically strip the
  //      referrer entirely when opening a link in the system browser — no
  //      amount of client-side detection can recover that after the fact.
  //   2. In-app browser sniffing — Instagram, Facebook and LinkedIn's own
  //      in-app browsers add a recognizable token to the User-Agent, so taps
  //      on links opened *inside* those apps are still identifiable even
  //      with no referrer.
  //   3. document.referrer domain — covers Google, direct social-site
  //      visits (e.g. clicking through from linkedin.com/feed on desktop),
  //      YouTube, etc.
  //   4. "Direct / None" — no referrer and no UTM tag; this is what most
  //      WhatsApp/Instagram-DM taps will show up as without tagging (#1). ──
  var SOURCE_LABELS = {
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

  var REFERRER_DOMAINS = [
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

  function getUrlParam(name) {
    var m = location.search.match(new RegExp('[?&]' + name + '=([^&]+)'));
    return m ? decodeURIComponent(m[1]) : '';
  }

  function hostnameOf(url) {
    try { return new URL(url).hostname.replace(/^www\./, ''); }
    catch (e) { return ''; }
  }

  function classifyTrafficSource(ua, referrer) {
    var override = (getUrlParam('utm_source') || getUrlParam('src')).toLowerCase();
    if (override) return SOURCE_LABELS[override] || (override.charAt(0).toUpperCase() + override.slice(1));

    if (/instagram/i.test(ua)) return 'Instagram';
    if (/FBAN|FBAV|FB_IAB|FBIOS/i.test(ua)) return 'Facebook';
    if (/LinkedInApp/i.test(ua)) return 'LinkedIn';

    if (!referrer) return 'Direct / None';
    var host = hostnameOf(referrer);
    if (!host) return 'Direct / None';
    for (var i = 0; i < REFERRER_DOMAINS.length; i++) {
      if (REFERRER_DOMAINS[i][0].test(host)) return REFERRER_DOMAINS[i][1];
    }
    return 'Other (' + host + ')';
  }

  function send(payload) {
    if (!ANALYTICS_URL) return; // not configured yet — no-op, never throws
    var body = JSON.stringify(payload);
    if (navigator.sendBeacon) {
      var blob = new Blob([body], { type: 'text/plain' });
      if (navigator.sendBeacon(ANALYTICS_URL, blob)) return;
    }
    // Fallback for browsers without sendBeacon, or if the beacon failed to queue.
    // no-cors + keepalive lets this survive page unload without blocking navigation.
    fetch(ANALYTICS_URL, {
      method: 'POST', mode: 'no-cors', keepalive: true,
      headers: { 'Content-Type': 'text/plain' }, body: body
    }).catch(function () {});
  }

  // ── Session (= one visit, possibly across several pages) ──
  // sessionStorage persists across page loads within the SAME TAB and is
  // wiped the instant the tab/window closes — exactly "one row per visit",
  // never a long-lived visitor identifier, never a cookie.
  var SESSION_KEY = 'va_session_v2';

  function loadSession() {
    try {
      var raw = sessionStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function saveSession(session) {
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch (e) {}
  }

  function generateSessionId() {
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  var ua = navigator.userAgent;
  var page = pageName();
  var browser = getBrowserName(ua);
  var deviceType = getDeviceType(ua);
  var resolvedDeviceName = getDeviceName(ua);   // upgraded in place by loadDeviceModel() if possible
  var resolvedOSVersion = getOSVersion(ua);     // upgraded in place by loadDeviceModel() if possible
  var referrer = document.referrer || '';
  var language = navigator.language || navigator.userLanguage || 'Unknown';
  var screenRes = screen.width + '×' + screen.height + ' @' + (window.devicePixelRatio || 1) + 'x';
  var exitSent = false;

  var session = loadSession();
  var isNewSession = !session;
  if (isNewSession) {
    session = {
      sessionId: generateSessionId(),
      entryPage: page,
      pagesPath: [page],
      trafficSource: classifyTrafficSource(ua, referrer),
      startTime: Date.now()
    };
  } else if (session.pagesPath[session.pagesPath.length - 1] !== page) {
    session.pagesPath.push(page);
  }
  saveSession(session);

  loadLocation();
  loadDeviceModel();

  function sendVisitPing() {
    send({
      type: 'visit',
      stage: isNewSession ? 'enter' : 'nav',
      sessionId: session.sessionId,
      timestamp: nowIST(),
      trafficSource: session.trafficSource,
      entryPage: session.entryPage,
      exitPage: page,
      pagesVisited: session.pagesPath.length,
      pagePath: session.pagesPath.join(' → '),
      browser: browser,
      device: resolvedDeviceName,
      osVersion: resolvedOSVersion,
      deviceType: deviceType,
      location: resolvedLocation,
      language: language,
      screenRes: screenRes
    });
  }

  // Fire immediately so a row appears/updates the moment someone loads a
  // page — don't make "is anyone visiting" depend on them leaving cleanly first.
  sendVisitPing();

  function sendExit() {
    if (exitSent) return;
    exitSent = true;
    var seconds = Math.round((Date.now() - session.startTime) / 1000);
    send({
      type: 'visit',
      stage: 'exit',
      sessionId: session.sessionId,
      timeOnSiteSeconds: seconds
    });
  }

  // visibilitychange (hidden) is the most reliable exit signal on mobile
  // Safari/Chrome, where pagehide/beforeunload are unreliable; pagehide
  // covers desktop back/forward-cache navigations. Guarded by exitSent
  // so only the first of these to fire actually sends.
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') sendExit();
  });
  window.addEventListener('pagehide', sendExit);

  // Resume download tracking — fires immediately on click, since a PDF
  // download doesn't necessarily navigate the visitor away from the page.
  // Sets Resume Downloaded = Yes on this visit's existing row rather than
  // creating a new one.
  document.addEventListener('click', function (e) {
    var link = e.target.closest && e.target.closest('a[href$=".pdf"]');
    if (!link) return;
    send({
      type: 'resume_download',
      sessionId: session.sessionId,
      timestamp: nowIST(),
      page: page
    });
  }, { capture: true });
})();
