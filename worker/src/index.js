// パンフレット依頼フォームの送信を受け取り、Resend 経由で
// 自社ドメイン(onebe-create.com)から担当者へメール(両面プルーフ画像を添付)を送る Cloudflare Worker。
//
// 必要な設定:
//   - シークレット RESEND_API_KEY を登録: `wrangler secret put RESEND_API_KEY`
//   - Resend で送信ドメイン(onebe-create.com)を検証しておくこと(DKIM/SPF)
//   - 下記 FROM_EMAIL は検証済みドメインのアドレスにすること

const TO_EMAIL = 'issei.masuya@onebe-create.com';
const FROM_EMAIL = 'OneBe パンフレット依頼 <noreply@onebe-create.com>';

// CORS 許可オリジン(公開ページのオリジンを入れる)
const ALLOWED_ORIGINS = [
  'https://onebe-inc.github.io',
  'http://localhost:3000',
  'http://127.0.0.1:5500',
];

function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function json(obj, status, origin) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  });
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])
  );
}

function base64FromArrayBuffer(buf) {
  let binary = '';
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(origin) });
    }
    if (request.method !== 'POST') {
      return json({ ok: false, error: 'Method not allowed' }, 405, origin);
    }
    if (!env.RESEND_API_KEY) {
      return json({ ok: false, error: 'Server not configured' }, 500, origin);
    }

    let form;
    try {
      form = await request.formData();
    } catch (e) {
      return json({ ok: false, error: 'Invalid form data' }, 400, origin);
    }

    const field = (k) => (form.get(k) || '').toString().trim();

    const company = field('会社名');
    const person  = field('ご担当者名');
    const email   = field('email');
    const tel     = field('電話番号');
    const qty     = field('部数');
    const paper   = field('用紙');
    const due     = field('納期希望');
    const note    = field('備考');
    const fold    = field('折り方');
    const cover   = field('表紙位置');
    const size    = field('仕上がり');

    if (!company || !person || !email || !qty) {
      return json({ ok: false, error: '必須項目が不足しています' }, 400, origin);
    }

    // 添付画像(両面プルーフ)
    const attachments = [];
    const file = form.get('attachment');
    if (file && typeof file === 'object' && typeof file.arrayBuffer === 'function') {
      const buf = await file.arrayBuffer();
      if (buf.byteLength > 0) {
        attachments.push({
          filename: file.name || 'pamphlet-proof.jpg',
          content: base64FromArrayBuffer(buf),
        });
      }
    }

    const rows = [
      ['会社名', company],
      ['ご担当者名', person],
      ['返信用メール', email],
      ['電話番号', tel],
      ['部数', qty],
      ['用紙', paper],
      ['納期希望', due],
      ['折り方', fold],
      ['表紙位置', cover],
      ['仕上がり', size],
      ['備考', note],
    ];

    const html =
      '<h2>パンフレット印刷の依頼が届きました</h2>' +
      '<table style="border-collapse:collapse;font-size:14px">' +
      rows
        .map(
          ([k, v]) =>
            `<tr><th align="left" style="padding:4px 12px 4px 0;vertical-align:top;white-space:nowrap">${esc(k)}</th>` +
            `<td style="padding:4px 0">${esc(v || '-').replace(/\n/g, '<br>')}</td></tr>`
        )
        .join('') +
      '</table>' +
      '<p style="color:#888;font-size:12px">※ 両面プルーフ画像を添付しています。</p>';

    const payload = {
      from: FROM_EMAIL,
      to: [TO_EMAIL],
      reply_to: email,
      subject: `【パンフレット依頼】${company} / ${person}`,
      html,
      attachments,
    };

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const detail = await res.text();
      return json({ ok: false, error: 'send failed', detail }, 502, origin);
    }

    return json({ ok: true }, 200, origin);
  },
};
