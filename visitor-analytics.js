/*!
 * Visitor Analytics — lightweight, anonymous, first-party pageview + resume-download tracker.
 *
 * Runs on every page of the site. Collects only standard, non-invasive signals:
 * browser, device model/OS, approximate (IP-derived) location with coordinates,
 * screen size, language, referrer, and time spent on page. No cookies, no
 * cross-site tracking, no permission prompts, no name/email — kept fully
 * anonymous and separate from the contact form's lead-capture pipeline.
 *
 * Backend: a Google Apps Script Web App (see google-apps-script-analytics.gs in
 * this repo) that appends/updates a row per visit in a Google Sheet. Deploy
 * that script, then paste the resulting /exec URL into ANALYTICS_URL below.
 * Until it's set, this script silently no-ops.
 *
 * Events sent:
 *   - "pageview" / stage "enter": fires immediately on load, so a row shows
 *     up right away rather than only after the visitor leaves.
 *   - "pageview" / stage "exit": fires when that same visit ends, updating
 *     the same row (matched via sessionId) with real time-on-page, plus
 *     whatever device/location detail resolved after page-load.
 *   - "resume_download": fired immediately when a visitor clicks the resume PDF.
 */
(function () {
  'use strict';

  var ANALYTICS_URL = 'https://script.google.com/macros/s/AKfycbwCq4E2fVW6DG2dy9fvMiS2_VgseB-RMnRlf-uWGgwCiuIGN-_B-njxGc1nkCJ4HcJt/exec';

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

  // ── Location — same 3-provider fallback chain as the contact form
  // (BigDataCloud -> ipapi.co -> ipinfo.io). Now also keeps the raw lat/lon
  // each provider already returns, for a precise map pin alongside the
  // human-readable city/region/country text. Still IP-based only — no
  // navigator.geolocation call, so no permission prompt is ever shown. ──
  var resolvedLocation = 'Unknown Location';
  var resolvedLat = '';
  var resolvedLon = '';

  function loadLocation() {
    return fetch('https://api.bigdatacloud.net/data/reverse-geocode-client')
      .then(function (res) { return res.ok ? res.json() : Promise.reject(); })
      .then(function (data) {
        if (data.city && data.principalSubdivision && data.countryName) {
          resolvedLocation = data.city + ', ' + data.principalSubdivision + ', ' + data.countryName;
        } else if (data.city && data.countryName) {
          resolvedLocation = data.city + ', ' + data.countryName;
        }
        if (data.latitude != null) resolvedLat = String(data.latitude);
        if (data.longitude != null) resolvedLon = String(data.longitude);
      })
      .catch(function () {
        return fetch('https://ipapi.co/json/')
          .then(function (res) { return res.ok ? res.json() : Promise.reject(); })
          .then(function (data) {
            if (data.city && data.region && data.country_name) {
              resolvedLocation = data.city + ', ' + data.region + ', ' + data.country_name;
            } else if (data.city && data.country_name) {
              resolvedLocation = data.city + ', ' + data.country_name;
            }
            if (data.latitude != null) resolvedLat = String(data.latitude);
            if (data.longitude != null) resolvedLon = String(data.longitude);
          });
      })
      .catch(function () {
        return fetch('https://ipinfo.io/json')
          .then(function (res) { return res.ok ? res.json() : Promise.reject(); })
          .then(function (data) {
            if (data.city && data.region && data.country) {
              resolvedLocation = data.city + ', ' + data.region + ', ' + data.country;
            } else if (data.city && data.country) {
              resolvedLocation = data.city + ', ' + data.country;
            }
            if (data.loc) {
              var parts = data.loc.split(',');
              if (parts[0]) resolvedLat = parts[0];
              if (parts[1]) resolvedLon = parts[1];
            }
          });
      })
      .catch(function () { /* silently give up — stays "Unknown Location" */ });
  }

  function mapsLink() {
    if (!resolvedLat || !resolvedLon) return '';
    return 'https://www.google.com/maps/search/?api=1&query=' + resolvedLat + ',' + resolvedLon;
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

  var ua = navigator.userAgent;
  var startTime = Date.now();
  var page = pageName();
  var browser = getBrowserName(ua);
  var deviceType = getDeviceType(ua);
  var resolvedDeviceName = getDeviceName(ua);   // upgraded in place by loadDeviceModel() if possible
  var resolvedOSVersion = getOSVersion(ua);     // upgraded in place by loadDeviceModel() if possible
  var referrer = document.referrer || 'Direct / None';
  var language = navigator.language || navigator.userLanguage || 'Unknown';
  var screenRes = screen.width + '×' + screen.height + ' @' + (window.devicePixelRatio || 1) + 'x';
  var exitSent = false;

  // A fresh, random, never-stored ID generated on every page load — exists
  // only to let the backend match this visit's "enter" and "exit" events to
  // the same spreadsheet row. Not a tracking identifier: it's discarded when
  // the tab closes, never written to localStorage/cookies, and carries no
  // information about who the visitor is.
  var sessionId = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);

  loadLocation();
  loadDeviceModel();

  function sendPageview(stage) {
    if (stage === 'exit') {
      if (exitSent) return;
      exitSent = true;
    }
    var seconds = Math.round((Date.now() - startTime) / 1000);
    send({
      type: 'pageview',
      stage: stage, // 'enter' fires immediately on load so a row appears right
                     // away; 'exit' fires when the visitor leaves and updates
                     // that same row (matched via sessionId) with the real
                     // time-on-page — plus the freshest device/location data,
                     // since both can resolve to something more accurate than
                     // what was known at the instant the page loaded.
      sessionId: sessionId,
      timestamp: nowIST(),
      page: page,
      timeOnPageSeconds: seconds,
      browser: browser,
      device: resolvedDeviceName,
      osVersion: resolvedOSVersion,
      deviceType: deviceType,
      location: resolvedLocation,
      latitude: resolvedLat,
      longitude: resolvedLon,
      mapsLink: mapsLink(),
      language: language,
      screenRes: screenRes,
      referrer: referrer
    });
  }

  // Fire immediately so a row appears the moment someone loads the page —
  // don't make "is anyone visiting" depend on them leaving cleanly first.
  sendPageview('enter');

  // visibilitychange (hidden) is the most reliable exit signal on mobile
  // Safari/Chrome, where pagehide/beforeunload are unreliable; pagehide
  // covers desktop back/forward-cache navigations. Guarded by exitSent
  // so only the first of these to fire actually sends.
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') sendPageview('exit');
  });
  window.addEventListener('pagehide', function () { sendPageview('exit'); });

  // Resume download tracking — fires immediately on click, since a PDF
  // download doesn't necessarily navigate the visitor away from the page.
  document.addEventListener('click', function (e) {
    var link = e.target.closest && e.target.closest('a[href$=".pdf"]');
    if (!link) return;
    send({
      type: 'resume_download',
      sessionId: sessionId,
      timestamp: nowIST(),
      page: page,
      browser: browser,
      device: resolvedDeviceName,
      osVersion: resolvedOSVersion,
      deviceType: deviceType,
      location: resolvedLocation,
      latitude: resolvedLat,
      longitude: resolvedLon,
      mapsLink: mapsLink(),
      language: language,
      screenRes: screenRes,
      referrer: referrer
    });
  }, { capture: true });
})();
