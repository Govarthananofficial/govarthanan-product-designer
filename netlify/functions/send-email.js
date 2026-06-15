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
  const FROM_EMAIL = "Govarthanan | Portfolio <govarthanan@salkomdesignstudio.com>";

  // ── 1. Confirmation email to the user ──────────────────────────────────────
  const userEmailHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Thanks for reaching out!</title>
  <style>
    body { margin: 0; padding: 0; background: #f5f5f7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    .wrapper { max-width: 560px; margin: 40px auto; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.07); }
    .header { background: #1d1d1f; padding: 36px 40px; }
    .header-dot { width: 8px; height: 8px; background: #fff; border-radius: 50%; display: inline-block; margin-right: 8px; }
    .header-logo { color: #fff; font-weight: 700; font-size: 15px; letter-spacing: -0.02em; }
    .body { padding: 40px; }
    .greeting { font-size: 22px; font-weight: 700; color: #1d1d1f; letter-spacing: -0.03em; margin-bottom: 12px; }
    .para { font-size: 15px; color: #555; line-height: 1.7; margin-bottom: 16px; }
    .highlight-box { background: #f5f5f7; border-radius: 12px; padding: 20px 24px; margin: 24px 0; }
    .highlight-label { font-size: 10px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: #86868b; margin-bottom: 10px; }
    .highlight-row { display: flex; gap: 8px; margin-bottom: 6px; }
    .highlight-key { font-size: 13px; color: #86868b; min-width: 80px; }
    .highlight-val { font-size: 13px; color: #1d1d1f; font-weight: 500; }
    .divider { height: 1px; background: #f0f0f0; margin: 28px 0; }
    .cta-btn { display: inline-block; background: #1d1d1f; color: #fff; text-decoration: none; font-size: 14px; font-weight: 600; padding: 13px 28px; border-radius: 980px; letter-spacing: -0.01em; }
    .footer { background: #f5f5f7; padding: 24px 40px; text-align: center; }
    .footer-text { font-size: 12px; color: #86868b; line-height: 1.6; }
    .footer-link { color: #1d1d1f; text-decoration: none; font-weight: 500; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <span class="header-dot"></span>
      <span class="header-logo">Govarthanan — Product Designer</span>
    </div>
    <div class="body">
      <div class="greeting">Hey ${name}, thanks for reaching out! 👋</div>
      <p class="para">
        I received your message and will get back to you within <strong>24 hours</strong>.
        In the meantime, feel free to explore my work or connect on LinkedIn.
      </p>

      <div class="highlight-box">
        <div class="highlight-label">Your Submission</div>
        ${company ? `<div class="highlight-row"><span class="highlight-key">Company</span><span class="highlight-val">${company}</span></div>` : ""}
        <div class="highlight-row"><span class="highlight-key">Email</span><span class="highlight-val">${email}</span></div>
        ${mobile ? `<div class="highlight-row"><span class="highlight-key">Mobile</span><span class="highlight-val">${mobile}</span></div>` : ""}
        <div class="highlight-row"><span class="highlight-key">Message</span><span class="highlight-val">${message.slice(0, 120)}${message.length > 120 ? "…" : ""}</span></div>
      </div>

      <p class="para">
        I'm Govarthanan Selvaganessane — a Product Designer &amp; Frontend Engineer with 2+ years
        shipping 30+ production products across fintech, retail &amp; SaaS. Looking forward to connecting!
      </p>

      <div class="divider"></div>

      <a href="https://govarthanan-product-engineer.netlify.app/" class="cta-btn">
        View My Portfolio →
      </a>
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
  <title>New Portfolio Contact</title>
  <style>
    body { margin: 0; padding: 0; background: #f5f5f7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    .wrapper { max-width: 520px; margin: 40px auto; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.07); }
    .header { background: #1d1d1f; padding: 28px 36px; display: flex; align-items: center; gap: 10px; }
    .header-badge { background: #fff; color: #1d1d1f; font-size: 10px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; padding: 4px 10px; border-radius: 100px; }
    .header-title { color: #fff; font-size: 15px; font-weight: 700; }
    .body { padding: 36px; }
    .alert { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 10px; padding: 14px 18px; font-size: 13px; color: #166534; font-weight: 500; margin-bottom: 24px; }
    .field { margin-bottom: 14px; }
    .field-label { font-size: 10px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: #86868b; margin-bottom: 4px; }
    .field-val { font-size: 15px; color: #1d1d1f; font-weight: 500; word-break: break-word; }
    .message-box { background: #f5f5f7; border-radius: 10px; padding: 16px 18px; font-size: 14px; color: #1d1d1f; line-height: 1.7; white-space: pre-wrap; }
    .divider { height: 1px; background: #f0f0f0; margin: 24px 0; }
    .reply-btn { display: inline-block; background: #1d1d1f; color: #fff; text-decoration: none; font-size: 13px; font-weight: 600; padding: 11px 24px; border-radius: 980px; }
    .footer { background: #f5f5f7; padding: 18px 36px; text-align: center; font-size: 11px; color: #86868b; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <span class="header-badge">New Lead</span>
      <span class="header-title">Portfolio Contact</span>
    </div>
    <div class="body">
      <div class="alert">🎉 Someone just reached out through your portfolio!</div>

      <div class="field">
        <div class="field-label">Name</div>
        <div class="field-val">${name}</div>
      </div>
      <div class="field">
        <div class="field-label">Email</div>
        <div class="field-val"><a href="mailto:${email}" style="color:#1d1d1f;">${email}</a></div>
      </div>
      ${mobile ? `<div class="field"><div class="field-label">Mobile</div><div class="field-val">${mobile}</div></div>` : ""}
      ${company ? `<div class="field"><div class="field-label">Company</div><div class="field-val">${company}</div></div>` : ""}

      <div class="divider"></div>

      <div class="field">
        <div class="field-label">Message</div>
        <div class="message-box">${message}</div>
      </div>

      <div class="divider"></div>

      <a href="mailto:${email}?subject=Re: Your message on govarthanan-product-engineer.netlify.app" class="reply-btn">
        Reply to ${name} →
      </a>
    </div>
    <div class="footer">Sent from your portfolio contact form · ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST</div>
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
