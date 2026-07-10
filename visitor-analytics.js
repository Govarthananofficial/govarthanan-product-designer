/*!
 * Visitor Analytics — lightweight, anonymous, first-party pageview + resume-download tracker.
 *
 * Runs on every page of the site. Collects only standard, non-invasive signals:
 * browser, OS/device type, approximate (city/country) location derived from IP,
 * referrer, and time spent on page. No cookies, no cross-site tracking, no
 * fingerprinting, no name/email — this is intentionally kept fully anonymous and
 * separate from the contact form's lead-capture pipeline (see index.html).
 *
 * Backend: a Google Apps Script Web App (see google-apps-script-analytics.gs in
 * this repo) that appends each event as a row to a Google Sheet. Deploy that
 * script, then paste the resulting /exec URL into ANALYTICS_URL below. Until
 * it's set, this script silently no-ops — safe to ship before the sheet exists.
 *
 * Events sent:
 *   - "pageview": once per page load, fired at exit time so it can include
 *     total time-on-page. Fires on tab hide, navigation, or tab close.
 *   - "resume_download": fired immediately when a visitor clicks a link to a
 *     PDF (the resume) — doesn't wait for exit, since a download doesn't
 *     necessarily navigate the visitor away.
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

  // ── Browser / device parsing — same logic as the contact form's detection
  // in index.html, kept in sync so both pipelines report identical labels. ──
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

  function getDeviceName(ua) {
    if (/windows phone/i.test(ua)) return 'Windows Phone';
    if (/iphone/i.test(ua)) return 'iPhone';
    if (/ipad/i.test(ua)) return 'iPad';
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

  // Maps a raw Android model code (e.g. "SM-A536E", "CPH2173", "M2101K6G")
  // to a readable "Brand (model)" label. Covers the brands dominant in the
  // Indian market (Samsung, Xiaomi/Redmi/POCO, vivo, Oppo, iQOO, Realme,
  // OnePlus) plus a few others; falls back to the raw code if unrecognized.
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

  // Modern Chrome deliberately hides the real device model in navigator.userAgent
  // for privacy (it sends a generic placeholder like "Android 10; K") unless a
  // site explicitly asks via the User-Agent Client Hints API. This upgrades
  // resolvedDeviceName to the real brand/model when that API is available —
  // Chromium-only, so Safari/Firefox keep using the regex-based UA guess above.
  function loadDeviceModel() {
    if (navigator.userAgentData && navigator.userAgentData.getHighEntropyValues) {
      navigator.userAgentData.getHighEntropyValues(['model'])
        .then(function (info) {
          if (info && info.model) resolvedDeviceName = brandFromModel(info.model);
        })
        .catch(function () { /* keep the UA-string-based guess */ });
    }
  }

  // ── Approximate location — same 3-provider fallback chain as the contact
  // form (BigDataCloud -> ipapi.co -> ipinfo.io), city/country level only. ──
  var resolvedLocation = 'Unknown Location';

  function loadLocation() {
    return fetch('https://api.bigdatacloud.net/data/reverse-geocode-client')
      .then(function (res) { return res.ok ? res.json() : Promise.reject(); })
      .then(function (data) {
        if (data.city && data.principalSubdivision && data.countryName) {
          resolvedLocation = data.city + ', ' + data.principalSubdivision + ', ' + data.countryName;
        } else if (data.city && data.countryName) {
          resolvedLocation = data.city + ', ' + data.countryName;
        }
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
          });
      })
      .catch(function () { /* silently give up — stays "Unknown Location" */ });
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
  var resolvedDeviceName = getDeviceName(ua); // upgraded in place by loadDeviceModel() if possible
  var referrer = document.referrer || 'Direct / None';
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
      os: resolvedDeviceName,
      deviceType: deviceType,
      location: resolvedLocation,
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
      os: resolvedDeviceName,
      deviceType: deviceType,
      location: resolvedLocation,
      referrer: referrer
    });
  }, { capture: true });
})();
