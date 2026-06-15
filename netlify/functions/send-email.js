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

  // Shared social-links footer markup (used in both emails)
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
  <title>Thanks for reaching out!</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 0; background: #F5F5F7; font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; }
    .bg { background: #F5F5F7; padding: 48px 16px; }
    .wrapper { max-width: 600px; margin: 0 auto; background: #FFFFFF; border-radius: 28px; overflow: hidden; box-shadow: 0 2px 4px rgba(29,29,31,0.04), 0 32px 80px -24px rgba(29,29,31,0.16); }
    .content { padding: 48px; }

    /* HEADER */
    .header { padding-bottom: 32px; margin-bottom: 40px; border-bottom: 1px solid rgba(29,29,31,0.06); }
    .header-inner { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
    .brand-id { display: flex; align-items: center; gap: 14px; }
    .brand-mark { width: 48px; height: 48px; border-radius: 16px; background: #1D1D1F; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .brand-mark span { color: #FFFFFF; font-size: 17px; font-weight: 800; letter-spacing: -0.02em; }
    .brand-name { font-size: 15px; font-weight: 700; color: #1D1D1F; letter-spacing: -0.01em; line-height: 1.3; }
    .brand-role { font-size: 12px; color: #86868B; margin-top: 3px; line-height: 1.4; }
    .header-btn { display: inline-flex; align-items: center; gap: 7px; font-size: 13px; font-weight: 700; color: #1D1D1F !important; text-decoration: none; background: #F5F5F7; padding: 11px 20px; border-radius: 999px; letter-spacing: -0.01em; white-space: nowrap; flex-shrink: 0; border: 1px solid rgba(29,29,31,0.06); }

    /* HERO */
    .hero { margin-bottom: 40px; }
    .badge { display: inline-flex; align-items: center; gap: 8px; background: #F5F5F7; color: #1D1D1F; font-size: 12px; font-weight: 700; letter-spacing: 0.04em; padding: 8px 16px; border-radius: 999px; margin-bottom: 20px; border: 1px solid rgba(29,29,31,0.06); }
    .heading-xl { font-size: 40px; font-weight: 800; line-height: 1.1; letter-spacing: -0.03em; color: #1D1D1F; margin: 0 0 18px; }
    .lead { font-size: 16px; line-height: 1.75; color: #86868B; margin: 0; }
    .lead strong { color: #1D1D1F; font-weight: 600; }

    /* SECTIONS */
    .section { margin-bottom: 40px; }
    .section-label { font-size: 11px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: #86868B; margin-bottom: 14px; }

    /* CARDS */
    .card { background: #F5F5F7; border-radius: 20px; padding: 24px; border: 1px solid rgba(29,29,31,0.06); }
    .card + .card { margin-top: 12px; }

    /* TIMELINE */
    .step { display: flex; align-items: flex-start; gap: 14px; padding: 14px 0; }
    .step:first-child { padding-top: 0; }
    .step:last-child { padding-bottom: 0; }
    .step + .step { border-top: 1px solid rgba(29,29,31,0.06); }
    .step-dot { width: 34px; height: 34px; min-width: 34px; border-radius: 11px; display: flex; align-items: center; justify-content: center; }
    .step-dot.active { background: #1D1D1F; }
    .step-dot.idle { background: #FFFFFF; }
    .step-body { padding-top: 7px; }
    .step-title { font-size: 14px; font-weight: 600; color: #1D1D1F; line-height: 1.4; }
    .step-desc { font-size: 12px; color: #86868B; margin-top: 3px; line-height: 1.5; }

    /* INFO ROWS */
    .info-row { display: flex; align-items: flex-start; gap: 14px; padding: 13px 0; }
    .info-row:first-child { padding-top: 0; }
    .info-row:last-child { padding-bottom: 0; }
    .info-row + .info-row { border-top: 1px solid rgba(29,29,31,0.06); }
    .info-icon { width: 34px; height: 34px; min-width: 34px; border-radius: 11px; background: #FFFFFF; display: flex; align-items: center; justify-content: center; }
    .info-body { padding-top: 5px; min-width: 0; }
    .info-label { font-size: 11px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #86868B; margin-bottom: 4px; }
    .info-val { font-size: 14px; font-weight: 600; color: #1D1D1F; word-break: break-word; line-height: 1.5; }
    .message-text { font-size: 15px; line-height: 1.8; color: #1D1D1F; white-space: pre-wrap; word-break: break-word; padding-top: 16px; border-top: 1px solid rgba(29,29,31,0.06); margin-top: 4px; }

    /* ABOUT */
    .about-text { font-size: 15px; line-height: 1.8; color: #86868B; margin: 0; }

    /* BUTTONS — table layout for equal widths in all email clients */
    .btn-wrap { width: 100%; border-collapse: separate; border-spacing: 0; }
    .btn-wrap td { width: 50%; vertical-align: top; }
    .btn-wrap td.btn-left { padding-right: 8px; }
    .btn-wrap td.btn-right { padding-left: 8px; }
    .btn { display: block; text-align: center; text-decoration: none; font-size: 14px; font-weight: 600; padding: 17px 16px; border-radius: 999px; letter-spacing: -0.01em; line-height: 1.2; }
    .btn-primary { background: #1D1D1F; color: #FFFFFF !important; }
    .btn-secondary { background: #F5F5F7; color: #1D1D1F !important; border: 1px solid rgba(29,29,31,0.08); }

    /* DIVIDER & NOTE */
    .divider { height: 1px; background: rgba(29,29,31,0.06); margin-bottom: 32px; }
    .note { font-size: 13px; color: #86868B; line-height: 1.7; margin: 0; }

    /* FOOTER */
    .footer { padding: 32px 48px 40px; border-top: 1px solid rgba(29,29,31,0.06); text-align: center; }
    .footer-name { font-size: 14px; font-weight: 700; color: #1D1D1F; margin-bottom: 4px; }
    .footer-role { font-size: 12px; color: #86868B; margin-bottom: 20px; }
    .footer-meta { font-size: 12px; color: #86868B; line-height: 2; margin-bottom: 24px; }
    .footer-meta a { color: #1D1D1F; text-decoration: none; font-weight: 600; }
    .social-row { }
    .social-btn { display: inline-flex; align-items: center; justify-content: center; width: 44px; height: 44px; border-radius: 12px; background: #1D1D1F; text-decoration: none; margin: 0 4px; vertical-align: middle; }

    @media only screen and (max-width: 520px) {
      .bg { padding: 20px 12px !important; }
      .content { padding: 28px 20px !important; }
      .footer { padding: 28px 20px 32px !important; }
      .heading-xl { font-size: 28px !important; }
      .card { padding: 20px !important; }
      .header-btn { width: 100%; text-align: center; justify-content: center; }
      .btn-wrap { display: block !important; }
      .btn-wrap tr { display: block !important; }
      .btn-wrap td { display: block !important; width: 100% !important; padding: 0 0 10px !important; }
      .btn-wrap td.btn-right { padding: 0 !important; }
      .btn { padding: 17px 16px !important; }
      .social-btn { width: 40px !important; height: 40px !important; margin: 0 3px !important; }
    }
  </style>
</head>
<body>
  <div class="bg">
    <div class="wrapper">
      <div class="content">

        <!-- HEADER -->
        <div class="header">
          <div class="header-inner">
            <div class="brand-id">
              <div class="brand-mark"><span>GS</span></div>
              <div>
                <div class="brand-name">Govarthanan Selvaganessane</div>
                <div class="brand-role">Product Designer &amp; Frontend Engineer</div>
              </div>
            </div>
            <a href="https://govarthanan-product-engineer.netlify.app/" class="header-btn">${ic.arrowUp("#1D1D1F")} Visit Website</a>
          </div>
        </div>

        <!-- HERO -->
        <div class="hero">
          <div class="badge">${ic.check("#1D1D1F")} Message Received</div>
          <div class="heading-xl">Thanks for reaching out, ${name}</div>
          <p class="lead">I've got your message and will get back to you with a <strong>personal response within 24 hours</strong>. Here's what happens next and a copy of what you sent.</p>
        </div>

        <!-- TIMELINE -->
        <div class="section">
          <div class="section-label">What Happens Next</div>
          <div class="card">
            <div class="step">
              <div class="step-dot active">${ic.check("#FFFFFF")}</div>
              <div class="step-body">
                <div class="step-title">Message Received</div>
                <div class="step-desc">Your enquiry has landed safely in my inbox.</div>
              </div>
            </div>
            <div class="step">
              <div class="step-dot idle">${ic.clock("#1D1D1F")}</div>
              <div class="step-body">
                <div class="step-title">Reviewing Requirements</div>
                <div class="step-desc">I'm going through the details of your project.</div>
              </div>
            </div>
            <div class="step">
              <div class="step-dot idle">${ic.send("#1D1D1F")}</div>
              <div class="step-body">
                <div class="step-title">Personal Response Within 24 Hours</div>
                <div class="step-desc">You'll hear back from me directly — no auto-replies.</div>
              </div>
            </div>
            <div class="step">
              <div class="step-dot idle">${ic.rocket("#1D1D1F", "#F5F5F7")}</div>
              <div class="step-body">
                <div class="step-title">Project Discussion</div>
                <div class="step-desc">We'll align on scope, timeline &amp; next steps.</div>
              </div>
            </div>
          </div>
        </div>

        <!-- CONTACT INFO CARD -->
        <div class="section">
          <div class="section-label">Contact Information</div>
          <div class="card">
            <div class="info-row">
              <div class="info-icon">${ic.mail("#1D1D1F", "#F5F5F7")}</div>
              <div class="info-body">
                <div class="info-label">Email</div>
                <div class="info-val">${email}</div>
              </div>
            </div>
            ${mobile ? `<div class="info-row">
              <div class="info-icon">${ic.phone("#1D1D1F", "#F5F5F7")}</div>
              <div class="info-body">
                <div class="info-label">Mobile</div>
                <div class="info-val">${mobile}</div>
              </div>
            </div>` : ""}
            ${company ? `<div class="info-row">
              <div class="info-icon">${ic.building("#1D1D1F", "#F5F5F7")}</div>
              <div class="info-body">
                <div class="info-label">Company</div>
                <div class="info-val">${company}</div>
              </div>
            </div>` : ""}
          </div>
        </div>

        <!-- MESSAGE CARD -->
        <div class="section">
          <div class="section-label">Your Message</div>
          <div class="card">
            <div class="info-row" style="padding-bottom: 0;">
              <div class="info-icon">${ic.chat("#1D1D1F")}</div>
              <div class="info-body">
                <div class="info-label">Message</div>
              </div>
            </div>
            <div class="message-text">${message.slice(0, 160)}${message.length > 160 ? "…" : ""}</div>
          </div>
        </div>

        <!-- ABOUT -->
        <div class="section">
          <p class="about-text">
            I'm a Product Designer &amp; Frontend Engineer with 2+ years shipping 30+ production
            products across fintech, retail &amp; SaaS — founder of Salkom Design Studio.
            While you wait, take a look at some recent work.
          </p>
        </div>

        <!-- BUTTONS -->
        <div class="section">
          <table class="btn-wrap" role="presentation" border="0" cellpadding="0" cellspacing="0">
            <tr>
              <td class="btn-left"><a href="https://govarthanan-product-engineer.netlify.app/" class="btn btn-primary">View Full Portfolio</a></td>
              <td class="btn-right"><a href="https://govarthanan-product-engineer.netlify.app/#projects" class="btn btn-secondary">Explore Case Studies</a></td>
            </tr>
          </table>
        </div>

        <div class="divider"></div>
        <p class="note">Need to add something? Just reply to this email — it goes straight to my inbox.</p>

      </div>
      <div class="footer">
        <div class="footer-name">Govarthanan Selvaganessane</div>
        <div class="footer-role">Product Designer &amp; Frontend Engineer</div>
        <div class="footer-meta">📍 Puducherry, India &nbsp;·&nbsp; 📧 <a href="mailto:govarthanan@salkomdesignstudio.com">govarthanan@salkomdesignstudio.com</a></div>
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
  <title>New Portfolio Contact</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 0; background: #F5F5F7; font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; }
    .bg { background: #F5F5F7; padding: 48px 16px; }
    .wrapper { max-width: 580px; margin: 0 auto; background: #FFFFFF; border-radius: 28px; overflow: hidden; box-shadow: 0 2px 4px rgba(29,29,31,0.04), 0 32px 80px -24px rgba(29,29,31,0.16); }
    .content { padding: 48px; }

    /* TOP ROW */
    .top-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 32px; flex-wrap: wrap; }
    .badge-dark { display: inline-flex; align-items: center; gap: 8px; background: #1D1D1F; color: #FFFFFF; font-size: 12px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; padding: 9px 16px; border-radius: 999px; }
    .timestamp { font-size: 12px; color: #86868B; }

    /* HERO */
    .hero { padding-bottom: 36px; margin-bottom: 40px; border-bottom: 1px solid rgba(29,29,31,0.06); }
    .heading-xl { font-size: 40px; font-weight: 800; line-height: 1.1; letter-spacing: -0.03em; color: #1D1D1F; margin: 0 0 10px; }
    .hero-sub { font-size: 16px; color: #86868B; line-height: 1.6; margin: 0; }

    /* SECTIONS */
    .section { margin-bottom: 40px; }
    .section-label { font-size: 11px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: #86868B; margin-bottom: 14px; }

    /* CARDS */
    .card { background: #F5F5F7; border-radius: 20px; padding: 24px; border: 1px solid rgba(29,29,31,0.06); }
    .message-card { background: #F5F5F7; border-radius: 20px; padding: 24px; border: 1px solid rgba(29,29,31,0.06); border-left: 4px solid #1D1D1F; }

    /* INFO ROWS */
    .info-row { display: flex; align-items: flex-start; gap: 14px; padding: 13px 0; }
    .info-row:first-child { padding-top: 0; }
    .info-row:last-child { padding-bottom: 0; }
    .info-row + .info-row { border-top: 1px solid rgba(29,29,31,0.06); }
    .info-icon { width: 34px; height: 34px; min-width: 34px; border-radius: 11px; background: #FFFFFF; display: flex; align-items: center; justify-content: center; }
    .info-body { padding-top: 5px; min-width: 0; }
    .info-label { font-size: 11px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #86868B; margin-bottom: 4px; }
    .info-val { font-size: 14px; font-weight: 600; color: #1D1D1F; word-break: break-word; line-height: 1.5; }
    .info-val a { color: #1D1D1F; text-decoration: underline; }

    /* MESSAGE */
    .msg-header { display: flex; align-items: center; gap: 12px; margin-bottom: 18px; }
    .msg-icon { width: 34px; height: 34px; min-width: 34px; border-radius: 11px; background: #FFFFFF; display: flex; align-items: center; justify-content: center; }
    .msg-label { font-size: 11px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #86868B; }
    .message-text { font-size: 15px; line-height: 1.8; color: #1D1D1F; white-space: pre-wrap; word-break: break-word; margin: 0; }

    /* BUTTONS — table layout for equal widths in all email clients */
    .btn-wrap { width: 100%; border-collapse: separate; border-spacing: 0; }
    .btn-wrap td { width: 50%; vertical-align: top; }
    .btn-wrap td.btn-left { padding-right: 8px; }
    .btn-wrap td.btn-right { padding-left: 8px; }
    .btn { display: block; text-align: center; text-decoration: none; font-size: 14px; font-weight: 600; padding: 17px 16px; border-radius: 999px; letter-spacing: -0.01em; line-height: 1.2; }
    .btn-primary { background: #1D1D1F; color: #FFFFFF !important; }
    .btn-secondary { background: #F5F5F7; color: #1D1D1F !important; border: 1px solid rgba(29,29,31,0.08); }

    /* FOOTER */
    .footer { padding: 32px 48px 40px; border-top: 1px solid rgba(29,29,31,0.06); text-align: center; }
    .footer-text { font-size: 12px; color: #86868B; margin: 20px 0 0; }
    .social-row { }
    .social-btn { display: inline-flex; align-items: center; justify-content: center; width: 44px; height: 44px; border-radius: 12px; background: #1D1D1F; text-decoration: none; margin: 0 4px; vertical-align: middle; }

    @media only screen and (max-width: 520px) {
      .bg { padding: 20px 12px !important; }
      .content { padding: 28px 20px !important; }
      .footer { padding: 28px 20px 32px !important; }
      .heading-xl { font-size: 28px !important; }
      .card, .message-card { padding: 20px !important; }
      .btn-wrap { display: block !important; }
      .btn-wrap tr { display: block !important; }
      .btn-wrap td { display: block !important; width: 100% !important; padding: 0 0 10px !important; }
      .btn-wrap td.btn-right { padding: 0 !important; }
      .btn { padding: 17px 16px !important; }
      .social-btn { width: 40px !important; height: 40px !important; margin: 0 3px !important; }
    }
  </style>
</head>
<body>
  <div class="bg">
    <div class="wrapper">
      <div class="content">

        <!-- TOP ROW -->
        <div class="top-row">
          <span class="badge-dark">${ic.fire("#FFFFFF")} New Lead</span>
          <span class="timestamp">${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST</span>
        </div>

        <!-- HERO -->
        <div class="hero">
          <div class="heading-xl">${name}</div>
          <p class="hero-sub">just reached out through your portfolio contact form.</p>
        </div>

        <!-- CONTACT CARD -->
        <div class="section">
          <div class="section-label">Contact Information</div>
          <div class="card">
            <div class="info-row">
              <div class="info-icon">${ic.user("#1D1D1F")}</div>
              <div class="info-body">
                <div class="info-label">Name</div>
                <div class="info-val">${name}</div>
              </div>
            </div>
            <div class="info-row">
              <div class="info-icon">${ic.mail("#1D1D1F", "#F5F5F7")}</div>
              <div class="info-body">
                <div class="info-label">Email</div>
                <div class="info-val"><a href="mailto:${email}">${email}</a></div>
              </div>
            </div>
            ${mobile ? `<div class="info-row">
              <div class="info-icon">${ic.phone("#1D1D1F", "#F5F5F7")}</div>
              <div class="info-body">
                <div class="info-label">Mobile</div>
                <div class="info-val">${mobile}</div>
              </div>
            </div>` : ""}
            ${company ? `<div class="info-row">
              <div class="info-icon">${ic.building("#1D1D1F", "#F5F5F7")}</div>
              <div class="info-body">
                <div class="info-label">Company</div>
                <div class="info-val">${company}</div>
              </div>
            </div>` : ""}
          </div>
        </div>

        <!-- MESSAGE CARD -->
        <div class="section">
          <div class="section-label">Message</div>
          <div class="message-card">
            <div class="msg-header">
              <div class="msg-icon">${ic.chat("#1D1D1F")}</div>
              <div class="msg-label">Full Message</div>
            </div>
            <p class="message-text">${message}</p>
          </div>
        </div>

        <!-- BUTTONS -->
        <div class="section" style="margin-bottom: 0;">
          <table class="btn-wrap" role="presentation" border="0" cellpadding="0" cellspacing="0">
            <tr>
              <td class="btn-left"><a href="mailto:${email}?subject=Re: Your message on govarthanan-product-engineer.netlify.app" class="btn btn-primary">Reply to Lead</a></td>
              <td class="btn-right"><a href="https://govarthanan-product-engineer.netlify.app/" class="btn btn-secondary">Open Portfolio</a></td>
            </tr>
          </table>
        </div>

      </div>
      <div class="footer">
        ${socialRow}
        <p class="footer-text">Sent automatically from your portfolio contact form</p>
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
