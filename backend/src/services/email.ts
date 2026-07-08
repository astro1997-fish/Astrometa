import nodemailer from 'nodemailer'

const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST   ?? 'smtp.gmail.com',
  port:   Number(process.env.SMTP_PORT ?? 587),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
})

const FROM = `"ASTRO META-TRADE" <${process.env.SMTP_USER}>`
const BRAND_COLOR = '#1A56DB'

/**
 * Returns the configured admin notification address(es). ADMIN_EMAIL may be
 * a single address or a comma-separated list, so alerts can reach the whole
 * ops team rather than a single inbox. Falls back to SMTP_USER if unset.
 */
function getAdminEmails(): string {
  const raw = process.env.ADMIN_EMAIL ?? process.env.SMTP_USER!
  return raw
    .split(',')
    .map(addr => addr.trim())
    .filter(Boolean)
    .join(', ')
}

/**
 * Derives a plain-text alternative from an email's HTML body. Sending only
 * an HTML part is a strong spam signal for providers like Gmail — a
 * multipart message with a real text/plain part reads as more legitimate.
 */
function toPlainText(html: string): string {
  // Preformatted diagnostic blocks (e.g. the listener alert's <pre>) must keep
  // their internal whitespace/indentation and literal angle-bracket content —
  // pull them out before the generic tag-stripping pass mangles them, then
  // splice the preserved text back in afterwards.
  const preBlocks: string[] = []
  const withPrePlaceholders = html.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (_m, inner) => {
    const decoded = inner
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
    preBlocks.push(decoded)
    return `\n%%PRE_BLOCK_${preBlocks.length - 1}%%\n`
  })

  let text = withPrePlaceholders
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<a[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gis, '$2 ($1)')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|h\d|li)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&rarr;/g, '->')
    .split('\n')
    .map(line => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  text = text.replace(/%%PRE_BLOCK_(\d+)%%/g, (_m, i) => preBlocks[Number(i)])
  return text
}

function baseTemplate(title: string, body: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#F0F4FF;font-family:'Plus Jakarta Sans',Inter,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
    <tr><td align="center">
      <table width="580" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr>
          <td style="background:${BRAND_COLOR};padding:28px 40px;">
            <div style="display:flex;align-items:center;gap:10px;">
              <span style="font-size:22px;font-weight:800;color:#fff;letter-spacing:-0.5px;">🚀 ASTRO META-TRADE</span>
            </div>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:40px;">
            ${body}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#F9FAFB;padding:24px 40px;border-top:1px solid #E5E7EB;">
            <p style="margin:0;font-size:12px;color:#9CA3AF;line-height:1.6;">
              © 2025 ASTRO META-TRADE. All rights reserved.<br/>
              This email was sent to you as a registered investor. Do not share this email with others.<br/>
              <a href="${process.env.FRONTEND_URL}/privacy" style="color:${BRAND_COLOR};">Privacy Policy</a> · 
              <a href="${process.env.FRONTEND_URL}/terms" style="color:${BRAND_COLOR};">Terms of Service</a>
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

export const emailService = {
  async sendWelcome(email: string, name: string) {
    const body = `
        <h1 style="color:#111827;font-size:24px;font-weight:800;margin:0 0 8px;">Welcome aboard, ${name}!</h1>
        <p style="color:#6B7280;font-size:15px;line-height:1.7;margin:0 0 24px;">
          Your ASTRO META-TRADE account has been created. You're now one step away from accessing 
          institutional-grade crypto investment management.
        </p>
        <p style="color:#6B7280;font-size:15px;line-height:1.7;margin:0 0 24px;">
          <strong style="color:#111827;">Next steps:</strong><br/>
          1. Fund your account with your preferred method<br/>
          2. Choose your investment package (Silver, Gold, or Platinum)<br/>
          3. Your dedicated manager will activate your portfolio
        </p>
        <a href="${process.env.FRONTEND_URL}/dashboard" 
           style="display:inline-block;background:${BRAND_COLOR};color:#fff;font-size:14px;font-weight:700;padding:14px 28px;border-radius:10px;text-decoration:none;">
          Access Your Dashboard →
        </a>
      `
    await transporter.sendMail({
      from: FROM,
      to:   email,
      replyTo: getAdminEmails(),
      subject: 'Welcome to ASTRO META-TRADE — your investment journey begins',
      text: toPlainText(body),
      html: baseTemplate('Welcome', body),
    })
  },

  async sendDepositConfirmed(email: string, name: string, amount: number) {
    const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
    const body = `
        <h1 style="color:#111827;font-size:24px;font-weight:800;margin:0 0 8px;">Deposit Confirmed</h1>
        <p style="color:#6B7280;font-size:15px;margin:0 0 24px;">Hi ${name}, your deposit has been confirmed and credited to your account.</p>
        <div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:12px;padding:20px;margin:0 0 24px;">
          <p style="margin:0;font-size:28px;font-weight:800;color:#15803D;">${fmt}</p>
          <p style="margin:4px 0 0;font-size:13px;color:#16A34A;">Successfully added to your unified balance</p>
        </div>
        <p style="color:#6B7280;font-size:14px;">
          Your funds are now ready to be activated into an investment package. Visit your dashboard to select a package or check your current portfolio performance.
        </p>
        <a href="${process.env.FRONTEND_URL}/dashboard" 
           style="display:inline-block;background:${BRAND_COLOR};color:#fff;font-size:14px;font-weight:700;padding:14px 28px;border-radius:10px;text-decoration:none;margin-top:16px;">
          View Dashboard →
        </a>
      `
    await transporter.sendMail({
      from: FROM,
      to:   email,
      replyTo: getAdminEmails(),
      subject: `Deposit confirmed — ${fmt} added to your portfolio`,
      text: toPlainText(body),
      html: baseTemplate('Deposit Confirmed', body),
    })
  },

  async sendInvestmentActivated(email: string, name: string, packageType: string, amount: number) {
    const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
    const icons: Record<string, string> = { bronze: '🥉', silver: '🥈', gold: '🥇', platinum: '💎' }
    const body = `
        <h1 style="color:#111827;font-size:24px;font-weight:800;margin:0 0 8px;">
          ${icons[packageType] ?? '📈'} Investment Activated
        </h1>
        <p style="color:#6B7280;font-size:15px;margin:0 0 24px;">
          Hi ${name}, your <strong>${packageType.charAt(0).toUpperCase() + packageType.slice(1)} Package</strong> 
          investment of <strong>${fmt}</strong> is now active and being managed by our expert team.
        </p>
        <p style="color:#6B7280;font-size:15px;margin:0 0 24px;">
          Your dedicated account manager will reach out within 24 hours to introduce themselves and outline your investment strategy. 
          You can monitor your portfolio performance in real-time from your dashboard.
        </p>
        <a href="${process.env.FRONTEND_URL}/dashboard/portfolio" 
           style="display:inline-block;background:${BRAND_COLOR};color:#fff;font-size:14px;font-weight:700;padding:14px 28px;border-radius:10px;text-decoration:none;">
          View My Portfolio →
        </a>
      `
    await transporter.sendMail({
      from: FROM,
      to:   email,
      replyTo: getAdminEmails(),
      subject: `Your ${packageType} investment is now live`,
      text: toPlainText(body),
      html: baseTemplate('Investment Activated', body),
    })
  },

  async sendSupportNotification(ticket: { name: string; email: string; subject: string; message: string }) {
    const body = `
        <h2 style="color:#111827;font-size:18px;margin:0 0 16px;">New Support Ticket</h2>
        <table style="width:100%;border-collapse:collapse;">
          ${[
            ['From',    ticket.name],
            ['Email',   ticket.email],
            ['Subject', ticket.subject],
          ].map(([k, v]) => `
            <tr>
              <td style="padding:8px 12px;font-size:13px;font-weight:600;color:#6B7280;width:80px;">${k}</td>
              <td style="padding:8px 12px;font-size:13px;color:#111827;">${v}</td>
            </tr>
          `).join('')}
        </table>
        <div style="margin-top:16px;padding:16px;background:#F9FAFB;border-radius:10px;border-left:3px solid ${BRAND_COLOR};">
          <p style="margin:0;font-size:14px;color:#374151;line-height:1.7;">${ticket.message}</p>
        </div>
      `
    await transporter.sendMail({
      from:    FROM,
      to:      getAdminEmails(),
      replyTo: ticket.email,
      subject: `[Support] ${ticket.subject}`,
      text: toPlainText(body),
      html: baseTemplate('New Support Request', body),
    })
  },

  /**
   * Notifies admins whenever a deposit is manually overridden/credited by an
   * admin (rather than the automatic blockchain listener), so the whole team
   * stays aware of overrides in real time for fraud detection and compliance.
   */
  async sendAdminOverrideAlert(details: {
    amountUsd:   number
    adminName:   string
    mode:        'manual' | 'chain'
    txId:        string
  }) {
    const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(details.amountUsd)
    const modeLabel = details.mode === 'manual' ? 'Manual amount entry' : 'On-chain (retried by admin)'
    const body = `
        <div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:12px;padding:20px;margin:0 0 24px;">
          <p style="margin:0 0 4px;font-size:16px;font-weight:800;color:#92400E;">⚠️ Manual Deposit Override</p>
          <p style="margin:0;font-size:13px;color:#B45309;">An admin manually credited a deposit outside the normal automatic confirmation flow.</p>
        </div>
        <table style="width:100%;border-collapse:collapse;">
          ${[
            ['Amount',      fmt],
            ['Admin',       details.adminName],
            ['Mode',        modeLabel],
            ['Transaction', details.txId],
          ].map(([k, v]) => `
            <tr>
              <td style="padding:8px 12px;font-size:13px;font-weight:600;color:#6B7280;width:110px;">${k}</td>
              <td style="padding:8px 12px;font-size:13px;color:#111827;">${v}</td>
            </tr>
          `).join('')}
        </table>
        <p style="margin:24px 0 0;font-size:13px;color:#6B7280;line-height:1.7;">
          If you did not perform this action, review the audit log immediately.
        </p>
        <a href="${process.env.FRONTEND_URL}/admin"
           style="display:inline-block;background:${BRAND_COLOR};color:#fff;font-size:14px;font-weight:700;padding:14px 28px;border-radius:10px;text-decoration:none;margin-top:16px;">
          Open Admin Panel →
        </a>
      `
    await transporter.sendMail({
      from:    FROM,
      to:      getAdminEmails(),
      replyTo: getAdminEmails(),
      subject: `[ASTRO META-TRADE] Deposit manually overridden by ${details.adminName}`,
      text: toPlainText(body),
      html: baseTemplate('Deposit Manually Overridden', body),
    })
  },

  /**
   * Sends an alert to the admin when the Ethereum blockchain listener appears
   * to have stalled or lost its provider connection.
   */
  async sendListenerAlert(reason: string, details: string) {
    const checkedAt = new Date().toISOString()
    const body = `
        <div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:12px;padding:20px;margin:0 0 24px;">
          <p style="margin:0 0 4px;font-size:16px;font-weight:800;color:#991B1B;">⚠️ Blockchain Listener Issue Detected</p>
          <p style="margin:0;font-size:13px;color:#B91C1C;">Crypto deposits may stop being credited until this is resolved.</p>
        </div>
        <h2 style="color:#111827;font-size:18px;font-weight:700;margin:0 0 12px;">What happened</h2>
        <div style="padding:14px 16px;background:#F9FAFB;border-radius:10px;border-left:3px solid #EF4444;margin:0 0 20px;">
          <p style="margin:0;font-size:14px;color:#374151;line-height:1.7;">${reason}</p>
        </div>
        <h2 style="color:#111827;font-size:18px;font-weight:700;margin:0 0 12px;">Details</h2>
        <pre style="background:#F3F4F6;border-radius:8px;padding:14px;font-size:12px;color:#374151;white-space:pre-wrap;word-break:break-all;margin:0 0 24px;">${details}
Checked at: ${checkedAt}</pre>
        <h2 style="color:#111827;font-size:18px;font-weight:700;margin:0 0 12px;">Recommended actions</h2>
        <ol style="color:#6B7280;font-size:14px;line-height:1.9;margin:0 0 24px;padding-left:20px;">
          <li>Check the backend server logs for provider errors.</li>
          <li>Verify your Ethereum RPC endpoint (<code>ETH_RPC_URL</code>) is reachable.</li>
          <li>Restart the backend service if the provider connection has dropped.</li>
          <li>Manually credit any stuck deposits via the admin panel if needed.</li>
        </ol>
        <a href="${process.env.FRONTEND_URL}/admin"
           style="display:inline-block;background:#DC2626;color:#fff;font-size:14px;font-weight:700;padding:14px 28px;border-radius:10px;text-decoration:none;">
          Open Admin Panel →
        </a>
        <p style="margin:24px 0 0;font-size:12px;color:#9CA3AF;">
          Alerts are rate-limited to one per hour. Check <code>/health</code> on the API for real-time listener status.
        </p>
      `
    await transporter.sendMail({
      from:    FROM,
      to:      getAdminEmails(),
      replyTo: getAdminEmails(),
      subject: '[ASTRO META-TRADE] Blockchain Listener Alert — action required',
      text: toPlainText(body),
      html: baseTemplate('Blockchain Listener Alert', body),
    })
  },
}
