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
    "Govarthanan | Portfolio <govarthanan@salkomdesignstudio.com>";

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
    body { margin: 0; padding: 0; background: #f5f5f7; font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; }
    .bg { background: #f5f5f7; padding: 48px 20px; }
    .wrapper { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 24px; overflow: hidden; box-shadow: 0 1px 2px rgba(0,0,0,0.04), 0 24px 64px -24px rgba(0,0,0,0.12); }
    .content { padding: 48px; }
    .brand-row { display: flex; align-items: center; gap: 12px; margin: 0 0 40px; }
    .brand-mark { width: 36px; height: 36px; border-radius: 10px; background: #1D1D1F; text-align: center; line-height: 36px; }
    .brand-mark span { color: #ffffff; font-size: 14px; font-weight: 800; letter-spacing: -0.02em; }
    .brand-name { font-size: 14px; font-weight: 700; color: #1D1D1F; letter-spacing: -0.01em; }
    .brand-role { font-size: 12px; color: #86868B; margin-top: 1px; }
    .eyebrow { font-size: 11px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; color: #86868B; margin: 0 0 12px; }
    .greeting { font-size: 30px; font-weight: 700; color: #1D1D1F; letter-spacing: -0.03em; line-height: 1.25; margin: 0 0 16px; }
    .lead { font-size: 16px; color: #86868B; line-height: 1.65; margin: 0 0 32px; }
    .lead strong { color: #1D1D1F; font-weight: 600; }
    .card { background: #F5F5F7; border-radius: 16px; padding: 22px 28px; margin: 0 0 32px; }
    .card-label { font-size: 11px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: #86868B; margin: 0 0 14px; }
    .card-row { display: flex; gap: 16px; padding: 7px 0; border-bottom: 1px solid #ffffff; }
    .card-row:last-child { border-bottom: none; }
    .card-key { font-size: 13px; color: #86868B; min-width: 84px; flex-shrink: 0; }
    .card-val { font-size: 13px; color: #1D1D1F; font-weight: 500; word-break: break-word; }
    .para { font-size: 15px; color: #86868B; line-height: 1.7; margin: 0 0 32px; }
    .cta-btn { display: inline-block; background: #1D1D1F; color: #ffffff !important; text-decoration: none; font-size: 14px; font-weight: 600; padding: 14px 30px; border-radius: 980px; letter-spacing: -0.01em; }
    .divider { height: 1px; background: #F5F5F7; margin: 36px 0; }
    .note { margin: 0; font-size: 13px; color: #86868B; line-height: 1.6; }
    .footer { padding: 28px 48px 40px; }
    .footer-text { font-size: 12px; color: #86868B; line-height: 1.7; text-align: center; margin: 0; }
    .footer-link { color: #1D1D1F; text-decoration: none; font-weight: 600; }
  </style>
</head>
<body>
  <div class="bg">
    <div class="wrapper">
      <div class="content">
        <div class="brand-row">
          <div class="brand-mark"><span>GS</span></div>
          <div>
            <div class="brand-name">Govarthanan Selvaganessane</div>
            <div class="brand-role">Product Designer &amp; Frontend Engineer</div>
          </div>
        </div>

        <div class="eyebrow">Message received</div>
        <div class="greeting">Thanks for reaching out, ${name} 👋</div>
        <p class="lead">I've got your message and will reply within <strong>24 hours</strong>. Here's a copy of what you sent:</p>

        <div class="card">
          <div class="card-label">Your Submission</div>
          ${company ? `<div class="card-row"><span class="card-key">Company</span><span class="card-val">${company}</span></div>` : ""}
          <div class="card-row"><span class="card-key">Email</span><span class="card-val">${email}</span></div>
          ${mobile ? `<div class="card-row"><span class="card-key">Mobile</span><span class="card-val">${mobile}</span></div>` : ""}
          <div class="card-row"><span class="card-key">Message</span><span class="card-val">${message.slice(0, 160)}${message.length > 160 ? "…" : ""}</span></div>
        </div>

        <p class="para">
          I'm a Product Designer &amp; Frontend Engineer with 2+ years shipping 30+ production
          products across fintech, retail &amp; SaaS — founder of Salkom Design Studio.
          While you wait, take a look at some recent work.
        </p>

        <a href="https://govarthanan-product-engineer.netlify.app/" class="cta-btn">View My Portfolio →</a>

        <div class="divider"></div>

        <p class="note">Need to add something? Just reply to this email — it goes straight to my inbox.</p>
      </div>
      <div class="footer">
        <p class="footer-text">
          Govarthanan Selvaganessane · Puducherry, India<br />
          <a href="mailto:govarthanan@salkomdesignstudio.com" class="footer-link">govarthanan@salkomdesignstudio.com</a>
          &nbsp;·&nbsp;
          <a href="https://www.linkedin.com/in/sgovarthanan/" class="footer-link">LinkedIn</a>
        </p>
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
    body { margin: 0; padding: 0; background: #f5f5f7; font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; }
    .bg { background: #f5f5f7; padding: 48px 20px; }
    .wrapper { max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 24px; overflow: hidden; box-shadow: 0 1px 2px rgba(0,0,0,0.04), 0 24px 64px -24px rgba(0,0,0,0.12); }
    .content { padding: 44px; }
    .top-row { display: flex; align-items: center; justify-content: space-between; margin: 0 0 28px; }
    .badge { display: inline-block; background: #F5F5F7; color: #1D1D1F; font-size: 11px; font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase; padding: 6px 14px; border-radius: 980px; }
    .timestamp { font-size: 12px; color: #86868B; }
    .title { font-size: 26px; font-weight: 700; color: #1D1D1F; letter-spacing: -0.03em; margin: 0 0 6px; }
    .subtitle { font-size: 14px; color: #86868B; margin: 0 0 32px; }
    .fields { border-radius: 16px; overflow: hidden; margin: 0 0 28px; }
    .field-row { display: flex; gap: 16px; padding: 16px 22px; border-bottom: 1px solid #ffffff; background: #F5F5F7; }
    .field-row:last-child { border-bottom: none; }
    .field-row.alt { background: #ffffff; }
    .field-label { font-size: 11px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: #86868B; min-width: 90px; flex-shrink: 0; padding-top: 2px; }
    .field-val { font-size: 15px; color: #1D1D1F; font-weight: 500; word-break: break-word; }
    .field-val a { color: #1D1D1F; text-decoration: underline; font-weight: 600; }
    .message-label { font-size: 11px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: #86868B; margin: 0 0 12px; }
    .message-box { background: #F5F5F7; border-left: 3px solid #1D1D1F; border-radius: 0 12px 12px 0; padding: 18px 22px; font-size: 14px; color: #1D1D1F; line-height: 1.75; white-space: pre-wrap; margin: 0 0 32px; }
    .cta-btn { display: inline-block; background: #1D1D1F; color: #ffffff !important; text-decoration: none; font-size: 14px; font-weight: 600; padding: 14px 30px; border-radius: 980px; letter-spacing: -0.01em; }
    .footer-text { padding: 0 44px 32px; font-size: 11px; color: #86868B; text-align: center; margin: 0; }
  </style>
</head>
<body>
  <div class="bg">
    <div class="wrapper">
      <div class="content">
        <div class="top-row">
          <span class="badge">New Lead</span>
          <span class="timestamp">${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST</span>
        </div>

        <div class="title">${name}</div>
        <p class="subtitle">just reached out through your portfolio contact form.</p>

        <div class="fields">
          <div class="field-row">
            <span class="field-label">Email</span>
            <span class="field-val"><a href="mailto:${email}">${email}</a></span>
          </div>
          ${mobile ? `<div class="field-row alt"><span class="field-label">Mobile</span><span class="field-val">${mobile}</span></div>` : ""}
          ${company ? `<div class="field-row${mobile ? "" : " alt"}"><span class="field-label">Company</span><span class="field-val">${company}</span></div>` : ""}
        </div>

        <div class="message-label">Message</div>
        <div class="message-box">${message}</div>

        <a href="mailto:${email}?subject=Re: Your message on govarthanan-product-engineer.netlify.app" class="cta-btn">Reply to ${name} →</a>
      </div>
      <div class="footer-text">Sent automatically from your portfolio contact form</div>
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
          subject: `Hey ${name}, I got your message! 👋`,
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
          subject: `📬 New Portfolio Contact: ${name}${company ? ` (${company})` : ""}`,
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
