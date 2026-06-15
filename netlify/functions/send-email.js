// netlify/functions/send-email.js
// Handles Resend email sending for the portfolio contact form.
// Sends:
//   1. A confirmation email to the person who filled the form.
//   2. A notification email to govarthanan@salkomdesignstudio.com.

exports.handler = async function (event) {
  // Only allow POST
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  // CORS headers — allow from any origin (adjust to your domain in prod)
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  // Handle preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: "Invalid JSON body" }),
    };
  }

  const { name, email, company, mobile, message } = payload;

  if (!name || !email || !message) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: "Missing required fields" }),
    };
  }

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const RESEND_URL = "https://api.resend.com/emails";
  const MY_EMAIL = "govarthanan@salkomdesignstudio.com";
  const FROM_EMAIL =
    "Govarthanan Selvaganessane <govarthanan@salkomdesignstudio.com>";

  // ── Inline icon set (Remix Icon "fill" style, hand-drawn as SVG for email-safety) ──
  const ic = {
    check: (c) =>
      `<svg width="18" height="18" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 8.5L6.5 12L13 4" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    clock: (c) =>
      `<svg width="18" height="18" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="8" r="6.25" stroke="${c}" stroke-width="1.5"/><path d="M8 4.5V8L10.5 9.5" stroke="${c}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    send: (c) =>
      `<svg width="18" height="18" viewBox="0 0 16 16" fill="${c}" xmlns="http://www.w3.org/2000/svg"><path d="M1.5 7.8L14 1.8L9.3 14.2L7.4 9L1.5 7.8Z"/></svg>`,
    rocket: (c, bg) =>
      `<svg width="18" height="18" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path d="M8 1C10.2 3 11.3 5.8 11.3 8.5V12H4.7V8.5C4.7 5.8 5.8 3 8 1Z" fill="${c}"/><path d="M4.7 9.5L1.5 13H4.7V9.5Z" fill="${c}"/><path d="M11.3 9.5L14.5 13H11.3V9.5Z" fill="${c}"/><path d="M6.5 12L8 15L9.5 12Z" fill="${c}"/><circle cx="8" cy="6.5" r="1.3" fill="${bg}"/></svg>`,
    mail: (c, bg) =>
      `<svg width="18" height="18" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><rect x="1" y="3" width="14" height="10" rx="1.5" fill="${c}"/><path d="M2 4.5L8 9L14 4.5" stroke="${bg}" stroke-width="1.3" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    phone: (c, bg) =>
      `<svg width="18" height="18" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="1" width="8" height="14" rx="1.6" fill="${c}"/><circle cx="8" cy="12.2" r="0.9" fill="${bg}"/></svg>`,
    building: (c, bg) =>
      `<svg width="18" height="18" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="2" width="10" height="12" rx="1" fill="${c}"/><rect x="5" y="4" width="2" height="2" fill="${bg}"/><rect x="9" y="4" width="2" height="2" fill="${bg}"/><rect x="5" y="7.5" width="2" height="2" fill="${bg}"/><rect x="9" y="7.5" width="2" height="2" fill="${bg}"/><rect x="5" y="11" width="2" height="2" fill="${bg}"/><rect x="9" y="11" width="2" height="2" fill="${bg}"/></svg>`,
    chat: (c) =>
      `<svg width="18" height="18" viewBox="0 0 16 16" fill="${c}" xmlns="http://www.w3.org/2000/svg"><path d="M2.5 1C1.7 1 1 1.7 1 2.5V9.5C1 10.3 1.7 11 2.5 11H5V14L8.5 11H13.5C14.3 11 15 10.3 15 9.5V2.5C15 1.7 14.3 1 13.5 1H2.5Z"/></svg>`,
    star: (c) =>
      `<svg width="18" height="18" viewBox="0 0 16 16" fill="${c}" xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="5.5" r="3"/><path d="M2 15C2 11.4 4.7 9.3 8 9.3C11.3 9.3 14 11.4 14 15Z"/></svg>`,
    briefcase: (c) =>
      `<svg width="18" height="18" viewBox="0 0 16 16" fill="${c}" xmlns="http://www.w3.org/2000/svg"><path d="M7 1C6.2 1 5.5 1.7 5.5 2.5V3.5H2C1.4 3.5 1 3.9 1 4.5V12.5C1 13.3 1.7 14 2.5 14H13.5C14.3 14 15 13.3 15 12.5V4.5C15 3.9 14.6 3.5 14 3.5H10.5V2.5C10.5 1.7 9.8 1 9 1H7ZM7 2.5H9V3.5H7V2.5Z"/></svg>`,
    arrowUp: (c) =>
      `<svg width="18" height="18" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 12L12 4M7 4H12V9" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    external: (c) =>
      `<svg width="18" height="18" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 2H3C2.4 2 2 2.4 2 3V13C2 13.6 2.4 14 3 14H13C13.6 14 14 13.6 14 13V10" stroke="${c}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 1.5H14.5V7M14 2L7 9" stroke="${c}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    fire: (c) =>
      `<svg width="18" height="18" viewBox="0 0 16 16" fill="${c}" xmlns="http://www.w3.org/2000/svg"><path d="M8 0.5C5.8 3.2 4.7 5.5 5.8 7.4C5.7 6.1 6.8 5.5 7.4 6.1C7 7.2 7.9 7.7 8.5 6.8C9.6 7.9 9 9 9.6 9.6C10.8 7.8 10.3 4.5 8 0.5Z"/><path d="M8 7.8C5.8 7.8 4.5 9.7 4.5 11.5C4.5 13.7 6.1 15.5 8 15.5C9.9 15.5 11.5 13.7 11.5 11.5C11.5 10.1 10.7 8.9 9.6 8.2C9.8 9.1 9 9.9 8.2 9.5C7.6 9.2 7.9 8.4 8 7.8Z"/></svg>`,
    user: (c) =>
      `<svg width="18" height="18" viewBox="0 0 16 16" fill="${c}" xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="5" r="3"/><path d="M2 15C2 11.4 4.7 9.3 8 9.3C11.3 9.3 14 11.4 14 15Z"/></svg>`,
  };

  // ── Social brand marks (44x44 squircle buttons, #1D1D1F bg / white glyph) ──
  const social = {
    linkedin: (c) =>
      `<svg width="20" height="20" viewBox="0 0 24 24" fill="${c}" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="9" width="4" height="13" rx="0.5"/><circle cx="4" cy="4" r="2.2"/><path d="M9 9H13V11.2C13.8 9.8 15.3 8.6 17.4 8.6C21 8.6 22 10.9 22 14.2V22H18V15C18 13.4 17.7 11.9 15.8 11.9C13.9 11.9 13 13.3 13 15V22H9V9Z"/></svg>`,
    github: (c) =>
      `<svg width="20" height="20" viewBox="0 0 24 24" fill="${c}" xmlns="http://www.w3.org/2000/svg"><path d="M12 1C5.9 1 1 5.9 1 12C1 17 4.3 21.2 8.8 22.7C9.4 22.8 9.6 22.4 9.6 22.1V19.9C6.4 20.6 5.7 18.5 5.7 18.5C5.2 17.2 4.4 16.8 4.4 16.8C3.3 16.1 4.5 16.1 4.5 16.1C5.7 16.2 6.3 17.3 6.3 17.3C7.3 19.1 9 18.6 9.7 18.2C9.8 17.5 10.1 16.9 10.4 16.6C7.8 16.3 5.1 15.3 5.1 10.9C5.1 9.6 5.6 8.6 6.3 7.8C6.2 7.5 5.8 6.3 6.4 4.8C6.4 4.8 7.4 4.5 9.6 6C10.5 5.7 11.5 5.6 12.5 5.6C13.5 5.6 14.5 5.7 15.4 6C17.6 4.5 18.6 4.8 18.6 4.8C19.2 6.3 18.8 7.5 18.7 7.8C19.4 8.6 19.9 9.6 19.9 10.9C19.9 15.3 17.2 16.3 14.6 16.6C15 17 15.4 17.7 15.4 18.8V22.1C15.4 22.4 15.6 22.8 16.2 22.7C20.7 21.2 24 17 24 12C24 5.9 19.1 1 12 1Z"/></svg>`,
    behance: (c) =>
      `<svg width="20" height="20" viewBox="0 0 24 24" fill="${c}" xmlns="http://www.w3.org/2000/svg"><text x="12" y="17" font-family="Arial, Helvetica, sans-serif" font-size="13" font-weight="800" text-anchor="middle">Be</text></svg>`,
    figma: (c) =>
      `<svg width="20" height="20" viewBox="0 0 24 24" fill="${c}" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="2" width="8" height="8" rx="4"/><circle cx="17" cy="6" r="4"/><circle cx="7" cy="14" r="4"/><rect x="13" y="14" width="8" height="8" rx="4"/></svg>`,
    npm: (c) =>
      `<svg width="20" height="20" viewBox="0 0 24 24" fill="${c}" xmlns="http://www.w3.org/2000/svg"><text x="12" y="16" font-family="Arial, Helvetica, sans-serif" font-size="9" font-weight="800" text-anchor="middle" letter-spacing="0.5">npm</text></svg>`,
  };

  // Shared social-links footer markup (used in confirmation email footer)
  const socialRow = `
        <div class="social-row">
          <a href="https://www.linkedin.com/in/sgovarthanan/" class="social-btn" title="LinkedIn">${social.linkedin("#FFFFFF")}</a>
          <a href="https://www.behance.net/govarthananuxui" class="social-btn" title="Behance">${social.behance("#FFFFFF")}</a>
          <a href="https://github.com/salkomdesignstudio" class="social-btn" title="GitHub">${social.github("#FFFFFF")}</a>
          <a href="https://www.npmjs.com/package/@salkomdesignstudio/sds-motion-forge" class="social-btn" title="npm">${social.npm("#FFFFFF")}</a>
          <a href="https://www.figma.com/community/plugin/1638543298157640831/framestack-pdf" class="social-btn" title="Figma">${social.figma("#FFFFFF")}</a>
        </div>`;

  // ── 1. Confirmation email to the user ──────────────────────────────────────
  const userEmailHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>Message received — Govarthanan</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #EFEFED; font-family: Georgia, 'Times New Roman', Times, serif; -webkit-font-smoothing: antialiased; }

    /* ── SHELL ── */
    .shell { background: #EFEFED; padding: 40px 16px 56px; }
    .card-outer { max-width: 600px; margin: 0 auto; background: #FAFAF8; border-radius: 4px; overflow: hidden; border: 1px solid #D8D8D4; }

    /* ── MASTHEAD ── */
    .masthead { padding: 28px 40px 24px; border-bottom: 1px solid #D8D8D4; display: table; width: 100%; }
    .mast-left { display: table-cell; vertical-align: middle; }
    .mast-right { display: table-cell; vertical-align: middle; text-align: right; white-space: nowrap; }
    .wordmark { font-family: Georgia, serif; font-size: 13px; font-weight: normal; color: #1A1A18; letter-spacing: 0.18em; text-transform: uppercase; }
    .wordmark-dot { color: #8A8A80; }
    .mast-link { font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 11px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: #1A1A18 !important; text-decoration: none; border-bottom: 1px solid #1A1A18; padding-bottom: 1px; }

    /* ── HERO BANNER ── */
    .hero-band { background: #1A1A18; padding: 48px 40px 44px; }
    .received-label { font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 10px; font-weight: 700; letter-spacing: 0.22em; text-transform: uppercase; color: #8A8A80; margin-bottom: 18px; }
    .hero-heading { font-family: Georgia, serif; font-size: 38px; font-weight: normal; line-height: 1.15; letter-spacing: -0.02em; color: #FAFAF8; margin-bottom: 20px; }
    .hero-heading em { font-style: italic; color: #C8C8BE; }
    .hero-body { font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.8; color: #9A9A90; max-width: 420px; }
    .hero-body strong { color: #FAFAF8; font-weight: 600; }

    /* ── CONTENT AREA ── */
    .content { padding: 40px 40px 0; }

    /* ── SECTION HEADERS ── */
    .eyebrow { font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 10px; font-weight: 700; letter-spacing: 0.2em; text-transform: uppercase; color: #8A8A80; margin-bottom: 16px; padding-bottom: 10px; border-bottom: 1px solid #D8D8D4; }

    /* ── TIMELINE ── */
    .timeline { margin-bottom: 36px; }
    .t-step { display: table; width: 100%; padding: 14px 0; border-bottom: 1px solid #EAEAE6; }
    .t-step:last-child { border-bottom: none; }
    .t-num { display: table-cell; vertical-align: top; width: 32px; padding-top: 2px; }
    .t-num-inner { width: 22px; height: 22px; border-radius: 50%; background: #1A1A18; text-align: center; line-height: 22px; font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 10px; font-weight: 700; color: #FAFAF8; }
    .t-num-inner.done { background: #1A1A18; }
    .t-num-inner.pending { background: transparent; border: 1.5px solid #C8C8BE; color: #8A8A80; line-height: 19px; }
    .t-body { display: table-cell; vertical-align: top; padding-left: 12px; }
    .t-title { font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 13px; font-weight: 600; color: #1A1A18; line-height: 1.4; margin-bottom: 3px; }
    .t-title.done { color: #1A1A18; }
    .t-title.pending { color: #6A6A62; }
    .t-desc { font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 12px; color: #8A8A80; line-height: 1.55; }

    /* ── INFO TABLE ── */
    .info-block { margin-bottom: 36px; }
    .info-row-t { display: table; width: 100%; border-bottom: 1px solid #EAEAE6; }
    .info-row-t:first-child { border-top: none; }
    .info-lbl { display: table-cell; vertical-align: top; width: 88px; padding: 13px 16px 13px 0; font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 10px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: #8A8A80; }
    .info-val { display: table-cell; vertical-align: top; padding: 13px 0; font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 13px; color: #1A1A18; font-weight: 500; line-height: 1.5; word-break: break-word; }
    .info-val a { color: #1A1A18 !important; }

    /* ── MESSAGE BOX ── */
    .msg-block { margin-bottom: 40px; }
    .msg-quote { background: #F2F2EE; border-left: 3px solid #1A1A18; padding: 20px 24px; border-radius: 0 3px 3px 0; }
    .msg-text { font-family: Georgia, serif; font-size: 15px; line-height: 1.85; color: #2A2A26; font-style: italic; white-space: pre-wrap; word-break: break-word; }
    .msg-text::before { content: '\\201C'; font-size: 28px; color: #C8C8BE; line-height: 0; vertical-align: -12px; margin-right: 3px; }
    .msg-text::after { content: '\\201D'; font-size: 28px; color: #C8C8BE; line-height: 0; vertical-align: -12px; margin-left: 3px; }

    /* ── ABOUT ROW ── */
    .about-row { padding: 28px 0; border-top: 1px solid #D8D8D4; margin-bottom: 36px; }
    .about-copy { font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 13px; line-height: 1.8; color: #6A6A62; }
    .about-copy strong { color: #1A1A18; font-weight: 600; }

    /* ── BUTTONS ── */
    .btn-row { margin-bottom: 40px; }
    .btn-table { width: 100%; border-collapse: separate; border-spacing: 0; }
    .btn-table td { width: 50%; vertical-align: top; }
    .btn-table td.left { padding-right: 6px; }
    .btn-table td.right { padding-left: 6px; }
    .btn-a { display: block; text-align: center; text-decoration: none; font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 12px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; padding: 16px 12px; border-radius: 2px; line-height: 1.2; }
    .btn-dark { background: #1A1A18; color: #FAFAF8 !important; }
    .btn-light { background: transparent; color: #1A1A18 !important; border: 1.5px solid #1A1A18; }

    /* ── FOOTER ── */
    .footer { padding: 28px 40px 36px; border-top: 1px solid #D8D8D4; text-align: center; background: #FAFAF8; }
    .footer-sig { font-family: Georgia, serif; font-size: 15px; color: #1A1A18; margin-bottom: 4px; font-style: italic; }
    .footer-role { font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: #8A8A80; margin-bottom: 4px; }
    .footer-loc { font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 11px; color: #A0A098; margin-bottom: 22px; }
    .footer-loc a { color: #1A1A18 !important; text-decoration: none; border-bottom: 1px solid #C8C8BE; padding-bottom: 1px; }
    .social-row { margin-bottom: 0; }
    .social-btn { display: inline-block; width: 36px; height: 36px; border-radius: 2px; background: #1A1A18; text-decoration: none; margin: 0 3px; vertical-align: middle; text-align: center; line-height: 36px; }

    @media only screen and (max-width: 520px) {
      .shell { padding: 0 0 40px !important; }
      .card-outer { border-radius: 0 !important; border-left: none !important; border-right: none !important; }
      .masthead, .content, .footer { padding-left: 24px !important; padding-right: 24px !important; }
      .hero-band { padding: 36px 24px 32px !important; }
      .hero-heading { font-size: 28px !important; }
      .btn-table { display: block !important; }
      .btn-table tr, .btn-table td { display: block !important; width: 100% !important; padding: 0 0 8px !important; }
      .btn-table td.right { padding-left: 0 !important; }
    }
  </style>
</head>
<body>
  <div class="shell">
    <div class="card-outer">

      <!-- MASTHEAD -->
      <div class="masthead">
        <div class="mast-left">
          <span class="wordmark">Govarthanan<span class="wordmark-dot"> · </span>GS</span>
        </div>
        <div class="mast-right">
          <a href="https://govarthanan-product-engineer.netlify.app/" class="mast-link">Visit Portfolio</a>
        </div>
      </div>

      <!-- HERO BAND -->
      <div class="hero-band">
        <div class="received-label">✦ Message received</div>
        <div class="hero-heading">Thanks for reaching out,<br><em>${name}</em></div>
        <p class="hero-body">Your message is in my inbox. I'll send a <strong>personal reply within 24 hours</strong> — no templates, no assistants. Here's a copy of what you sent.</p>
      </div>

      <!-- CONTENT -->
      <div class="content">

        <!-- WHAT HAPPENS NEXT -->
        <div class="timeline">
          <div class="eyebrow">What happens next</div>
          <div class="t-step">
            <div class="t-num"><div class="t-num-inner done">✓</div></div>
            <div class="t-body">
              <div class="t-title done">Message received</div>
              <div class="t-desc">Your enquiry has landed safely in my inbox.</div>
            </div>
          </div>
          <div class="t-step">
            <div class="t-num"><div class="t-num-inner pending">2</div></div>
            <div class="t-body">
              <div class="t-title pending">Reviewing your brief</div>
              <div class="t-desc">I go through every project detail carefully before responding.</div>
            </div>
          </div>
          <div class="t-step">
            <div class="t-num"><div class="t-num-inner pending">3</div></div>
            <div class="t-body">
              <div class="t-title pending">Personal reply — within 24 hrs</div>
              <div class="t-desc">You hear from me directly. No auto-replies. No handoffs.</div>
            </div>
          </div>
          <div class="t-step">
            <div class="t-num"><div class="t-num-inner pending">4</div></div>
            <div class="t-body">
              <div class="t-title pending">Project kick-off</div>
              <div class="t-desc">We align on scope, timeline &amp; deliverables.</div>
            </div>
          </div>
        </div>

        <!-- YOUR DETAILS -->
        <div class="info-block">
          <div class="eyebrow">Your details</div>
          <div class="info-row-t">
            <div class="info-lbl">Email</div>
            <div class="info-val">${email}</div>
          </div>
          ${
            mobile
              ? `<div class="info-row-t">
            <div class="info-lbl">Mobile</div>
            <div class="info-val">${mobile}</div>
          </div>`
              : ""
          }
          ${
            company
              ? `<div class="info-row-t">
            <div class="info-lbl">Company</div>
            <div class="info-val">${company}</div>
          </div>`
              : ""
          }
        </div>

        <!-- MESSAGE -->
        <div class="msg-block">
          <div class="eyebrow">Your message</div>
          <div class="msg-quote">
            <span class="msg-text">${message.slice(0, 200)}${message.length > 200 ? "…" : ""}</span>
          </div>
        </div>

        <!-- ABOUT + BUTTONS -->
        <div class="about-row">
          <p class="about-copy">I'm a <strong>Product Designer &amp; Frontend Engineer</strong> with 2+ years building production apps across fintech, retail &amp; SaaS — including Pothys DigiGold, GRT &amp; Lalitha Jewellery. While you wait, explore the work.</p>
        </div>

        <div class="btn-row">
          <table class="btn-table" role="presentation" border="0" cellpadding="0" cellspacing="0">
            <tr>
              <td class="left"><a href="https://govarthanan-product-engineer.netlify.app/" class="btn-a btn-dark">View Portfolio</a></td>
              <td class="right"><a href="https://govarthanan-product-engineer.netlify.app/#projects" class="btn-a btn-light">Case Studies</a></td>
            </tr>
          </table>
        </div>

      </div>

      <!-- FOOTER -->
      <div class="footer">
        <div class="footer-sig">Govarthanan Selvaganessane</div>
        <div class="footer-role">Product Designer &amp; Frontend Engineer</div>
        <div class="footer-loc">Puducherry, India &nbsp;&middot;&nbsp; <a href="mailto:govarthanan@salkomdesignstudio.com">govarthanan@salkomdesignstudio.com</a></div>
        ${socialRow}
      </div>

    </div>
  </div>
</body>
</html>
`;

  // ── 2. Notification email to Govarthanan ────────────────────────────────────
  const notifyEmailHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>New lead — Portfolio</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #0E0E0C; font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; }

    /* ── SHELL ── */
    .shell { background: #0E0E0C; padding: 32px 16px 48px; }
    .card-outer { max-width: 580px; margin: 0 auto; background: #1A1A18; border-radius: 4px; overflow: hidden; border: 1px solid #2E2E2A; }

    /* ── TOP BAR ── */
    .top-bar { padding: 18px 32px; border-bottom: 1px solid #2E2E2A; display: table; width: 100%; }
    .top-bar-left { display: table-cell; vertical-align: middle; }
    .top-bar-right { display: table-cell; vertical-align: middle; text-align: right; }
    .lead-badge { display: inline-block; background: #E8FF47; color: #0E0E0C; font-size: 10px; font-weight: 800; letter-spacing: 0.18em; text-transform: uppercase; padding: 5px 12px; border-radius: 2px; }
    .ts { font-size: 11px; color: #5A5A52; letter-spacing: 0.04em; }

    /* ── HERO ── */
    .hero { padding: 36px 32px 32px; border-bottom: 1px solid #2E2E2A; }
    .from-label { font-size: 10px; font-weight: 700; letter-spacing: 0.2em; text-transform: uppercase; color: #5A5A52; margin-bottom: 10px; }
    .from-name { font-family: Georgia, 'Times New Roman', Times, serif; font-size: 36px; font-weight: normal; color: #F0F0E8; line-height: 1.1; letter-spacing: -0.02em; margin-bottom: 8px; }
    .from-sub { font-size: 13px; color: #6A6A62; line-height: 1.6; }
    .from-sub a { color: #9A9A90 !important; text-decoration: none; border-bottom: 1px solid #3E3E3A; padding-bottom: 1px; }

    /* ── DATA GRID ── */
    .data-grid { padding: 0 32px; border-bottom: 1px solid #2E2E2A; }
    .data-row { display: table; width: 100%; border-bottom: 1px solid #232320; }
    .data-row:last-child { border-bottom: none; }
    .data-key { display: table-cell; vertical-align: top; width: 80px; padding: 14px 16px 14px 0; font-size: 10px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; color: #5A5A52; }
    .data-val { display: table-cell; vertical-align: top; padding: 14px 0; font-size: 13px; color: #C0C0B8; font-weight: 500; word-break: break-word; line-height: 1.5; }
    .data-val a { color: #E8FF47 !important; text-decoration: none; }

    /* ── MESSAGE ── */
    .msg-section { padding: 28px 32px; border-bottom: 1px solid #2E2E2A; }
    .msg-eyebrow { font-size: 10px; font-weight: 700; letter-spacing: 0.2em; text-transform: uppercase; color: #5A5A52; margin-bottom: 16px; }
    .msg-body { font-family: Georgia, serif; font-size: 15px; line-height: 1.85; color: #A0A098; white-space: pre-wrap; word-break: break-word; font-style: italic; }

    /* ── CTA ── */
    .cta-section { padding: 28px 32px; }
    .cta-table { width: 100%; border-collapse: separate; border-spacing: 0; }
    .cta-table td { width: 50%; vertical-align: top; }
    .cta-table td.left { padding-right: 6px; }
    .cta-table td.right { padding-left: 6px; }
    .cta-btn { display: block; text-align: center; text-decoration: none; font-size: 12px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; padding: 16px 12px; border-radius: 2px; line-height: 1.2; }
    .cta-primary { background: #E8FF47; color: #0E0E0C !important; }
    .cta-secondary { background: transparent; color: #6A6A62 !important; border: 1.5px solid #3E3E3A; }

    /* ── SYSTEM NOTE ── */
    .sys-note { padding: 16px 32px 20px; text-align: center; }
    .sys-note p { font-size: 11px; color: #3E3E3A; letter-spacing: 0.03em; }

    @media only screen and (max-width: 520px) {
      .shell { padding: 0 0 32px !important; }
      .card-outer { border-radius: 0 !important; border-left: none !important; border-right: none !important; }
      .top-bar, .hero, .data-grid, .msg-section, .cta-section, .sys-note { padding-left: 20px !important; padding-right: 20px !important; }
      .from-name { font-size: 26px !important; }
      .cta-table { display: block !important; }
      .cta-table tr, .cta-table td { display: block !important; width: 100% !important; padding: 0 0 8px !important; }
      .cta-table td.right { padding-left: 0 !important; }
    }
  </style>
</head>
<body>
  <div class="shell">
    <div class="card-outer">

      <!-- TOP BAR -->
      <div class="top-bar">
        <div class="top-bar-left">
          <span class="lead-badge">⚡ New Lead</span>
        </div>
        <div class="top-bar-right">
          <span class="ts">${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST</span>
        </div>
      </div>

      <!-- HERO -->
      <div class="hero">
        <div class="from-label">From</div>
        <div class="from-name">${name}</div>
        <p class="from-sub">Reached out via your portfolio contact form${company ? ` &middot; <strong style="color:#8A8A80;">${company}</strong>` : ""}</p>
      </div>

      <!-- DATA GRID -->
      <div class="data-grid">
        <div class="data-row">
          <div class="data-key">Email</div>
          <div class="data-val"><a href="mailto:${email}">${email}</a></div>
        </div>
        ${
          mobile
            ? `<div class="data-row">
          <div class="data-key">Mobile</div>
          <div class="data-val"><a href="tel:${mobile}">${mobile}</a></div>
        </div>`
            : ""
        }
        ${
          company
            ? `<div class="data-row">
          <div class="data-key">Company</div>
          <div class="data-val" style="color:#8A8A80;">${company}</div>
        </div>`
            : ""
        }
      </div>

      <!-- MESSAGE -->
      <div class="msg-section">
        <div class="msg-eyebrow">Their message</div>
        <p class="msg-body">${message}</p>
      </div>

      <!-- CTA BUTTONS -->
      <div class="cta-section">
        <table class="cta-table" role="presentation" border="0" cellpadding="0" cellspacing="0">
          <tr>
            <td class="left"><a href="mailto:${email}?subject=Re%3A%20Your%20message%20on%20govarthanan-product-engineer.netlify.app&body=Hi%20${encodeURIComponent(name)}%2C%0A%0A" class="cta-btn cta-primary">↳ Reply Now</a></td>
            <td class="right"><a href="https://govarthanan-product-engineer.netlify.app/" class="cta-btn cta-secondary">Portfolio</a></td>
          </tr>
        </table>
      </div>

      <!-- SYSTEM NOTE -->
      <div class="sys-note">
        <p>Auto-sent from portfolio contact form &nbsp;·&nbsp; govarthanan-product-engineer.netlify.app</p>
      </div>

    </div>
  </div>
</body>
</html>
`;

  try {
    // Send both emails in parallel
    const [userRes, notifyRes] = await Promise.all([
      fetch(RESEND_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: FROM_EMAIL,
          to: [email],
          subject: `Hey ${name}, I got your message`,
          html: userEmailHtml,
        }),
      }),
      fetch(RESEND_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: FROM_EMAIL,
          to: [MY_EMAIL],
          reply_to: email,
          subject: `New Portfolio Contact: ${name}${company ? ` (${company})` : ""}`,
          html: notifyEmailHtml,
        }),
      }),
    ]);

    const userData = await userRes.json().catch(() => ({}));
    const notifyData = await notifyRes.json().catch(() => ({}));

    if (!userRes.ok || !notifyRes.ok) {
      console.error("Resend error:", userData, notifyData);
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({
          error: "Failed to send one or more emails",
          user: userData,
          notify: notifyData,
        }),
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        userEmailId: userData.id,
        notifyEmailId: notifyData.id,
      }),
    };
  } catch (err) {
    console.error("Function error:", err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: "Internal server error",
        detail: err.message,
      }),
    };
  }
};
