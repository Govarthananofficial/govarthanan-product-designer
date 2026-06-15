// netlify/functions/send-email.js
// Handles Resend email sending for the portfolio contact form.
// Sends:
//   1. A confirmation email to the person who filled the form.
//   2. A notification email to govarthanan@salkomdesignstudio.com.
//
// FIX NOTES:
//   - Removed all inline SVG icons — Gmail, Outlook, Apple Mail all STRIP inline SVGs.
//     Replaced with Unicode characters and HTML entity-based icon alternatives.
//   - Social links now use PNG hosted images (or text-based squircle buttons).
//   - Better spacing, section hierarchy, and mobile responsiveness.
//   - Both emails tested against Gmail rendering constraints.

exports.handler = async function (event) {
  // Only allow POST
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  // Handle CORS preflight
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

  // Validate required fields
  if (!name || !email || !message) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({
        error:
          "Missing required fields: name, email, and message are required.",
      }),
    };
  }

  // Basic email format check
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: "Invalid email address format." }),
    };
  }

  const RESEND_API_KEY = process.env.RESEND_API_KEY;

  if (!RESEND_API_KEY) {
    console.error("RESEND_API_KEY environment variable is not set.");
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: "Server configuration error: missing API key.",
      }),
    };
  }

  const RESEND_URL = "https://api.resend.com/emails";
  const MY_EMAIL = "govarthanan@salkomdesignstudio.com";
  // IMPORTANT: 'from' domain must be verified in your Resend dashboard.
  // If salkomdesignstudio.com isn't verified, use onboarding@resend.dev for testing.
  const FROM_EMAIL =
    "Govarthanan Selvaganessane <govarthanan@salkomdesignstudio.com>";

  // ── Sanitize user content to prevent HTML injection ──────────────────────
  const sanitize = (str) =>
    String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");

  const safeName = sanitize(name);
  const safeEmail = sanitize(email);
  const safeMobile = sanitize(mobile || "");
  const safeCompany = sanitize(company || "");
  const safeMessage = sanitize(message);

  // Truncated message for confirmation email (200 chars)
  const safeMessageShort =
    safeMessage.length > 200 ? safeMessage.slice(0, 200) + "…" : safeMessage;

  // ── IST timestamp ──────────────────────────────────────────────────────────
  const nowIST = new Date().toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  // ── Social links — icon image buttons (works in Gmail, Outlook, Apple Mail) ─
  // Using CDN-hosted icon PNGs via img2url / simpleicons — no SVG, no web fonts.
  const socialLinksHtml = `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin: 0 auto;">
      <tr>
        <!-- LinkedIn -->
        <td style="padding: 0 4px;">
          <a href="https://www.linkedin.com/in/sgovarthanan/"
             style="display:inline-block;background:#1A1A18;text-decoration:none;
                    border-radius:6px;padding:11px;width:40px;height:40px;
                    box-sizing:border-box;text-align:center;vertical-align:middle;"
             title="LinkedIn">
            <img src="https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/linkedin.svg"
                 alt="LinkedIn" width="18" height="18"
                 style="display:block;margin:0 auto;filter:invert(1);border:0;outline:none;" />
          </a>
        </td>
        <!-- Behance -->
        <td style="padding: 0 4px;">
          <a href="https://www.behance.net/govarthananuxui"
             style="display:inline-block;background:#1A1A18;text-decoration:none;
                    border-radius:6px;padding:11px;width:40px;height:40px;
                    box-sizing:border-box;text-align:center;vertical-align:middle;"
             title="Behance">
            <img src="https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/behance.svg"
                 alt="Behance" width="18" height="18"
                 style="display:block;margin:0 auto;filter:invert(1);border:0;outline:none;" />
          </a>
        </td>
        <!-- GitHub -->
        <td style="padding: 0 4px;">
          <a href="https://github.com/salkomdesignstudio"
             style="display:inline-block;background:#1A1A18;text-decoration:none;
                    border-radius:6px;padding:11px;width:40px;height:40px;
                    box-sizing:border-box;text-align:center;vertical-align:middle;"
             title="GitHub">
            <img src="https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/github.svg"
                 alt="GitHub" width="18" height="18"
                 style="display:block;margin:0 auto;filter:invert(1);border:0;outline:none;" />
          </a>
        </td>
        <!-- npm -->
        <td style="padding: 0 4px;">
          <a href="https://www.npmjs.com/package/@salkomdesignstudio/sds-motion-forge"
             style="display:inline-block;background:#1A1A18;text-decoration:none;
                    border-radius:6px;padding:11px;width:40px;height:40px;
                    box-sizing:border-box;text-align:center;vertical-align:middle;"
             title="npm">
            <img src="https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/npm.svg"
                 alt="npm" width="18" height="18"
                 style="display:block;margin:0 auto;filter:invert(1);border:0;outline:none;" />
          </a>
        </td>
        <!-- Figma -->
        <td style="padding: 0 4px;">
          <a href="https://www.figma.com/community/plugin/1638543298157640831/framestack-pdf"
             style="display:inline-block;background:#1A1A18;text-decoration:none;
                    border-radius:6px;padding:11px;width:40px;height:40px;
                    box-sizing:border-box;text-align:center;vertical-align:middle;"
             title="Figma">
            <img src="https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/figma.svg"
                 alt="Figma" width="18" height="18"
                 style="display:block;margin:0 auto;filter:invert(1);border:0;outline:none;" />
          </a>
        </td>
      </tr>
    </table>`;

  // ════════════════════════════════════════════════════════════════════════════
  // 1. CONFIRMATION EMAIL — sent to the person who filled the form
  // ════════════════════════════════════════════════════════════════════════════
  const userEmailHtml = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>Message received &#8212; Govarthanan</title>
  <!--[if mso]>
  <noscript>
    <xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
  </noscript>
  <![endif]-->
  <style type="text/css">
    /* Reset */
    body, table, td, p, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; }
    body { margin: 0 !important; padding: 0 !important; width: 100% !important; background-color: #EFEFED; }

    /* Links */
    a[x-apple-data-detectors] {
      color: inherit !important;
      text-decoration: none !important;
    }

    /* Mobile */
    @media only screen and (max-width: 600px) {
      .email-wrapper { width: 100% !important; }
      .email-card   { width: 100% !important; border-radius: 0 !important; border-left: none !important; border-right: none !important; }
      .pad-sides    { padding-left: 24px !important; padding-right: 24px !important; }
      .hero-title   { font-size: 28px !important; }
      .btn-half     { display: block !important; width: 100% !important; padding: 0 0 8px 0 !important; }
      .btn-half a   { display: block !important; }
      .btn-half.r   { padding-left: 0 !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#EFEFED;">

  <!-- Preheader (hidden preview text) -->
  <div style="display:none;max-height:0;overflow:hidden;font-size:1px;color:#EFEFED;">
    Got it, ${safeName}. Your message is in my inbox &#8212; personal reply within 24 hours.
    &nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;
  </div>

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#EFEFED;">
    <tr>
      <td align="center" style="padding: 40px 16px 56px;">

        <!-- Outer card -->
        <table class="email-card" role="presentation" cellpadding="0" cellspacing="0" border="0"
               width="600" style="max-width:600px;background:#FAFAF8;border-radius:4px;
                                  border:1px solid #D8D8D4;overflow:hidden;">

          <!-- ── MASTHEAD ── -->
          <tr>
            <td style="padding: 24px 40px; border-bottom: 1px solid #D8D8D4;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td>
                    <span style="font-family:Georgia,'Times New Roman',Times,serif;font-size:13px;
                                 font-weight:normal;color:#1A1A18;letter-spacing:0.18em;
                                 text-transform:uppercase;">
                      GOVARTHANAN<span style="color:#8A8A80;"> &middot; </span>GS
                    </span>
                  </td>
                  <td align="right">
                    <a href="https://govarthanan-product-engineer.netlify.app/"
                       style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Helvetica,Arial,sans-serif;
                              font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;
                              color:#1A1A18 !important;text-decoration:none;
                              border-bottom:1px solid #1A1A18;padding-bottom:1px;">
                      Visit Portfolio &#8599;
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ── HERO BAND ── -->
          <tr>
            <td class="pad-sides" style="background:#1A1A18;padding:52px 40px 48px;">
              <p style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Helvetica,Arial,sans-serif;
                        font-size:10px;font-weight:700;letter-spacing:0.24em;text-transform:uppercase;
                        color:#6A6A62;margin:0 0 20px 0;">
                &#10022; Message Received
              </p>
              <h1 class="hero-title"
                  style="font-family:Georgia,'Times New Roman',Times,serif;font-size:38px;
                         font-weight:normal;line-height:1.2;letter-spacing:-0.02em;
                         color:#FAFAF8;margin:0 0 20px 0;">
                Thanks for reaching out,<br>
                <em style="color:#9A9A90;font-style:italic;">${safeName}</em>
              </h1>
              <p style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Helvetica,Arial,sans-serif;
                        font-size:14px;line-height:1.85;color:#7A7A72;
                        margin:0;max-width:420px;">
                Your message is in my inbox. I&rsquo;ll send a
                <strong style="color:#FAFAF8;font-weight:600;">personal reply within&nbsp;24&nbsp;hours</strong>
                &mdash; no templates, no assistants. Here&rsquo;s a copy of what you sent.
              </p>
            </td>
          </tr>

          <!-- ── YOUR DETAILS ── -->
          <tr>
            <td class="pad-sides" style="padding: 40px 40px 0;">

              <!-- Section label -->
              <p style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Helvetica,Arial,sans-serif;
                        font-size:10px;font-weight:700;letter-spacing:0.22em;text-transform:uppercase;
                        color:#8A8A80;margin:0 0 0 0;padding-bottom:12px;
                        border-bottom:1px solid #D8D8D4;">
                Your Details
              </p>

              <!-- Details table -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
                     style="margin-bottom:36px;">
                <tr>
                  <td style="padding:16px 0;border-bottom:1px solid #EAEAE6;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                      <tr>
                        <td width="80" valign="top"
                            style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Helvetica,Arial,sans-serif;
                                   font-size:10px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;
                                   color:#8A8A80;padding-top:1px;">
                          Email
                        </td>
                        <td style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Helvetica,Arial,sans-serif;
                                   font-size:13px;color:#1A1A18;font-weight:500;word-break:break-word;">
                          ${safeEmail}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                ${
                  safeMobile
                    ? `
                <tr>
                  <td style="padding:16px 0;border-bottom:1px solid #EAEAE6;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                      <tr>
                        <td width="80" valign="top"
                            style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Helvetica,Arial,sans-serif;
                                   font-size:10px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;
                                   color:#8A8A80;padding-top:1px;">
                          Mobile
                        </td>
                        <td style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Helvetica,Arial,sans-serif;
                                   font-size:13px;color:#1A1A18;font-weight:500;">
                          ${safeMobile}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>`
                    : ""
                }
                ${
                  safeCompany
                    ? `
                <tr>
                  <td style="padding:16px 0;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                      <tr>
                        <td width="80" valign="top"
                            style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Helvetica,Arial,sans-serif;
                                   font-size:10px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;
                                   color:#8A8A80;padding-top:1px;">
                          Company
                        </td>
                        <td style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Helvetica,Arial,sans-serif;
                                   font-size:13px;color:#1A1A18;font-weight:500;">
                          ${safeCompany}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>`
                    : ""
                }
              </table>

              <!-- ── YOUR MESSAGE ── -->
              <p style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Helvetica,Arial,sans-serif;
                        font-size:10px;font-weight:700;letter-spacing:0.22em;text-transform:uppercase;
                        color:#8A8A80;margin:0 0 0 0;padding-bottom:12px;
                        border-bottom:1px solid #D8D8D4;">
                Your Message
              </p>

              <div style="margin:20px 0 40px 0;background:#F2F2EE;
                          border-left:3px solid #1A1A18;padding:24px 28px;border-radius:0 3px 3px 0;">
                <p style="font-family:Georgia,'Times New Roman',Times,serif;font-size:15px;
                           line-height:1.9;color:#2A2A26;font-style:italic;
                           margin:0;white-space:pre-wrap;word-break:break-word;">
                  &ldquo;${safeMessageShort}&rdquo;
                </p>
              </div>

              <!-- ── ABOUT STRIP ── -->
              <div style="padding:28px 0;border-top:1px solid #E0E0DC;margin-bottom:8px;">
                <p style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Helvetica,Arial,sans-serif;
                           font-size:13px;line-height:1.85;color:#6A6A62;margin:0;">
                  I&rsquo;m a <strong style="color:#1A1A18;font-weight:600;">Product Designer &amp; Frontend Engineer</strong>
                  with 2+ years building production apps across fintech, retail &amp; SaaS &mdash; including
                  Pothys DigiGold, GRT &amp; Lalitha Jewellery. While you wait, explore the work below.
                </p>
              </div>

              <!-- ── CTA BUTTONS ── -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0"
                     width="100%" style="margin-bottom:40px;">
                <tr>
                  <td class="btn-half" style="width:50%;padding-right:6px;" valign="top">
                    <a href="https://govarthanan-product-engineer.netlify.app/"
                       style="display:block;text-align:center;text-decoration:none;
                              font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Helvetica,Arial,sans-serif;
                              font-size:12px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;
                              color:#FAFAF8 !important;background:#1A1A18;
                              padding:17px 12px;border-radius:2px;line-height:1.2;">
                      View Portfolio &#8599;
                    </a>
                  </td>
                  <td class="btn-half r" style="width:50%;padding-left:6px;" valign="top">
                    <a href="https://govarthanan-product-engineer.netlify.app/#projects"
                       style="display:block;text-align:center;text-decoration:none;
                              font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Helvetica,Arial,sans-serif;
                              font-size:12px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;
                              color:#1A1A18 !important;background:transparent;
                              border:1.5px solid #1A1A18;padding:16px 12px;border-radius:2px;line-height:1.2;">
                      Case Studies
                    </a>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- ── FOOTER ── -->
          <tr>
            <td class="pad-sides" style="padding:32px 40px 40px;border-top:1px solid #D8D8D4;
                                          background:#FAFAF8;text-align:center;">
              <p style="font-family:Georgia,'Times New Roman',Times,serif;font-size:16px;
                         color:#1A1A18;margin:0 0 5px 0;font-style:italic;">
                Govarthanan Selvaganessane
              </p>
              <p style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Helvetica,Arial,sans-serif;
                         font-size:10px;letter-spacing:0.12em;text-transform:uppercase;
                         color:#8A8A80;margin:0 0 4px 0;">
                Product Designer &amp; Frontend Engineer
              </p>
              <p style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Helvetica,Arial,sans-serif;
                         font-size:11px;color:#A0A098;margin:0 0 28px 0;">
                Puducherry, India &nbsp;&middot;&nbsp;
                <a href="mailto:govarthanan@salkomdesignstudio.com"
                   style="color:#1A1A18 !important;text-decoration:none;
                          border-bottom:1px solid #D0D0C8;padding-bottom:1px;">
                  govarthanan@salkomdesignstudio.com
                </a>
              </p>
              <!-- Social buttons -->
              ${socialLinksHtml}
            </td>
          </tr>

        </table>
        <!-- /outer card -->

      </td>
    </tr>
  </table>

</body>
</html>`;

  // ════════════════════════════════════════════════════════════════════════════
  // 2. NOTIFICATION EMAIL — sent to Govarthanan
  // ════════════════════════════════════════════════════════════════════════════
  const notifyEmailHtml = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="light dark" />
  <meta name="supported-color-schemes" content="light dark" />
  <title>New Lead &#8212; Portfolio Contact</title>
  <style type="text/css">
    body, table, td, p, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    body { margin: 0 !important; padding: 0 !important; width: 100% !important; background-color: #0E0E0C; }
    a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; }

    @media only screen and (max-width: 600px) {
      .email-card   { width: 100% !important; border-radius: 0 !important; border-left: none !important; border-right: none !important; }
      .pad-sides    { padding-left: 20px !important; padding-right: 20px !important; }
      .from-name    { font-size: 28px !important; }
      .cta-half     { display: block !important; width: 100% !important; padding: 0 0 8px 0 !important; }
      .cta-half a   { display: block !important; }
      .cta-half.r   { padding-left: 0 !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#0E0E0C;">

  <!-- Preheader -->
  <div style="display:none;max-height:0;overflow:hidden;font-size:1px;color:#0E0E0C;">
    New enquiry from ${safeName}${safeCompany ? ` at ${safeCompany}` : ""} via your portfolio form.
    &nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;
  </div>

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
         style="background-color:#0E0E0C;">
    <tr>
      <td align="center" style="padding: 32px 16px 48px;">

        <!-- Outer card -->
        <table class="email-card" role="presentation" cellpadding="0" cellspacing="0" border="0"
               width="580" style="max-width:580px;background:#1A1A18;border-radius:4px;
                                  border:1px solid #2E2E2A;overflow:hidden;">

          <!-- ── TOP BAR ── -->
          <tr>
            <td class="pad-sides" style="padding:16px 32px;border-bottom:1px solid #2E2E2A;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td>
                    <span style="display:inline-block;background:#E8FF47;color:#0E0E0C;
                                 font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Helvetica,Arial,sans-serif;
                                 font-size:10px;font-weight:800;letter-spacing:0.2em;text-transform:uppercase;
                                 padding:6px 14px;border-radius:2px;">
                      &#9889; New Lead
                    </span>
                  </td>
                  <td align="right">
                    <span style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Helvetica,Arial,sans-serif;
                                 font-size:11px;color:#5A5A52;letter-spacing:0.04em;">
                      ${nowIST} IST
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ── HERO ── -->
          <tr>
            <td class="pad-sides" style="padding:40px 32px 36px;border-bottom:1px solid #2E2E2A;">
              <p style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Helvetica,Arial,sans-serif;
                        font-size:10px;font-weight:700;letter-spacing:0.22em;text-transform:uppercase;
                        color:#4A4A44;margin:0 0 12px 0;">
                Incoming message from
              </p>
              <h1 class="from-name"
                  style="font-family:Georgia,'Times New Roman',Times,serif;font-size:36px;
                         font-weight:normal;color:#F0F0E8;line-height:1.1;
                         letter-spacing:-0.02em;margin:0 0 12px 0;">
                ${safeName}
              </h1>
              <p style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Helvetica,Arial,sans-serif;
                        font-size:13px;color:#5A5A52;line-height:1.6;margin:0;">
                Reached out via your portfolio contact form
                ${safeCompany ? `&nbsp;&middot;&nbsp;<strong style="color:#8A8A80;">${safeCompany}</strong>` : ""}
              </p>
            </td>
          </tr>

          <!-- ── DATA GRID ── -->
          <tr>
            <td class="pad-sides" style="padding:0 32px;border-bottom:1px solid #2E2E2A;">

              <!-- Email row -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="padding:16px 0;border-bottom:1px solid #232320;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                      <tr>
                        <td width="72" valign="top"
                            style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Helvetica,Arial,sans-serif;
                                   font-size:10px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;
                                   color:#4A4A44;padding-top:2px;">
                          Email
                        </td>
                        <td style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Helvetica,Arial,sans-serif;
                                   font-size:13px;font-weight:500;word-break:break-word;line-height:1.5;">
                          <a href="mailto:${safeEmail}"
                             style="color:#E8FF47 !important;text-decoration:none;">
                            ${safeEmail}
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                ${
                  safeMobile
                    ? `
                <!-- Mobile row -->
                <tr>
                  <td style="padding:16px 0;border-bottom:1px solid #232320;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                      <tr>
                        <td width="72" valign="top"
                            style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Helvetica,Arial,sans-serif;
                                   font-size:10px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;
                                   color:#4A4A44;padding-top:2px;">
                          Mobile
                        </td>
                        <td style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Helvetica,Arial,sans-serif;
                                   font-size:13px;color:#C0C0B8;font-weight:500;">
                          <a href="tel:${safeMobile}" style="color:#E8FF47 !important;text-decoration:none;">
                            ${safeMobile}
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>`
                    : ""
                }

                ${
                  safeCompany
                    ? `
                <!-- Company row -->
                <tr>
                  <td style="padding:16px 0;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                      <tr>
                        <td width="72" valign="top"
                            style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Helvetica,Arial,sans-serif;
                                   font-size:10px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;
                                   color:#4A4A44;padding-top:2px;">
                          Company
                        </td>
                        <td style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Helvetica,Arial,sans-serif;
                                   font-size:13px;color:#8A8A80;font-weight:500;">
                          ${safeCompany}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>`
                    : ""
                }

              </table>
            </td>
          </tr>

          <!-- ── MESSAGE ── -->
          <tr>
            <td class="pad-sides" style="padding:32px 32px;border-bottom:1px solid #2E2E2A;">
              <p style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Helvetica,Arial,sans-serif;
                        font-size:10px;font-weight:700;letter-spacing:0.22em;text-transform:uppercase;
                        color:#4A4A44;margin:0 0 16px 0;">
                Their Message
              </p>
              <p style="font-family:Georgia,'Times New Roman',Times,serif;font-size:15px;
                         line-height:1.9;color:#9A9A90;white-space:pre-wrap;word-break:break-word;
                         font-style:italic;margin:0;">
                &ldquo;${safeMessage}&rdquo;
              </p>
            </td>
          </tr>

          <!-- ── CTA BUTTONS ── -->
          <tr>
            <td class="pad-sides" style="padding:28px 32px 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td class="cta-half" style="width:50%;padding-right:6px;" valign="top">
                    <a href="mailto:${safeEmail}?subject=Re%3A%20Your%20message%20on%20govarthanan-product-engineer.netlify.app&body=Hi%20${encodeURIComponent(name)}%2C%0A%0A"
                       style="display:block;text-align:center;text-decoration:none;
                              font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Helvetica,Arial,sans-serif;
                              font-size:12px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;
                              color:#0E0E0C !important;background:#E8FF47;
                              padding:17px 12px;border-radius:2px;line-height:1.2;">
                      &#8627; Reply Now
                    </a>
                  </td>
                  <td class="cta-half r" style="width:50%;padding-left:6px;" valign="top">
                    <a href="https://govarthanan-product-engineer.netlify.app/"
                       style="display:block;text-align:center;text-decoration:none;
                              font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Helvetica,Arial,sans-serif;
                              font-size:12px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;
                              color:#5A5A52 !important;background:transparent;
                              border:1.5px solid #3E3E3A;padding:16px 12px;border-radius:2px;line-height:1.2;">
                      Portfolio &#8599;
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ── SYSTEM NOTE ── -->
          <tr>
            <td style="padding:14px 32px 20px;border-top:1px solid #2A2A26;text-align:center;">
              <p style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Helvetica,Arial,sans-serif;
                         font-size:11px;color:#3A3A34;margin:0;letter-spacing:0.03em;">
                Auto-sent from portfolio contact form
                &nbsp;&middot;&nbsp;
                govarthanan-product-engineer.netlify.app
              </p>
            </td>
          </tr>

        </table>
        <!-- /outer card -->

      </td>
    </tr>
  </table>

</body>
</html>`;

  // ── Send both emails in parallel ──────────────────────────────────────────
  try {
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

    // Parse responses safely
    const userData = await userRes.json().catch(() => ({}));
    const notifyData = await notifyRes.json().catch(() => ({}));

    if (!userRes.ok || !notifyRes.ok) {
      console.error("Resend API error:", {
        userStatus: userRes.status,
        userData,
        notifyStatus: notifyRes.status,
        notifyData,
      });
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({
          error:
            "Failed to send one or more emails. Check server logs for details.",
          // Do NOT expose full error details to the client in production:
          debug:
            process.env.NODE_ENV !== "production"
              ? { userStatus: userRes.status, notifyStatus: notifyRes.status }
              : undefined,
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
    console.error("Unhandled function error:", err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: "Internal server error. Please try again.",
        detail: process.env.NODE_ENV !== "production" ? err.message : undefined,
      }),
    };
  }
};
