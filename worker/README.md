# パンフレット依頼メール送信 Worker

依頼フォームの送信(`multipart/form-data`)を受け取り、[Resend](https://resend.com/) 経由で
自社ドメイン(onebe-create.com)から担当者へメール(両面プルーフ画像を添付)を送る Cloudflare Worker。

FormSubmit の代わりにこれを使うことで、共有IPによる迷惑メール隔離を避け、
自社ドメインの認証済みメールとして確実に届くようにする。

## セットアップ手順

### 1. Resend で送信ドメインを検証
1. https://resend.com/ にアカウント作成(無料枠あり)。
2. **Domains → Add Domain** で `onebe-create.com`(または `send.onebe-create.com`)を追加。
3. 表示される **DNSレコード(DKIM の TXT/CNAME、SPF、必要なら MX)** を、
   onebe-create.com のDNS管理先(Cloudflare等)に追加。
   - 受信用 MX(`smtp.google.com` / Google Workspace)はそのまま。Resend は送信用サブドメインを使うため競合しない。
4. Resend 側で **Verified** になるまで待つ。
5. `worker/src/index.js` の `FROM_EMAIL` を検証済みドメインのアドレスにする
   (例: `noreply@onebe-create.com`)。

### 2. APIキー取得
Resend → **API Keys → Create API Key**(Sending 権限)でキーをコピー。

### 3. Worker をデプロイ
```bash
cd worker
npm i -g wrangler        # 未インストールなら
wrangler login           # Cloudflare にログイン(ブラウザ認証)
wrangler secret put RESEND_API_KEY   # ← Resend のAPIキーを貼り付け
wrangler deploy
```
デプロイ後に表示される URL(例: `https://pamphlet-order.<サブドメイン>.workers.dev`)を控える。

### 4. フロント側に Worker URL を設定
`index.html` の定数 `WORKER_ENDPOINT` を、上記の Worker URL に差し替えてコミット&プッシュ。

```js
var WORKER_ENDPOINT = 'https://pamphlet-order.<サブドメイン>.workers.dev';
```

### 5. CORS 許可オリジンの確認
`worker/src/index.js` の `ALLOWED_ORIGINS` に公開ページのオリジン
(`https://onebe-inc.github.io`)が含まれていることを確認。独自ドメインで公開する場合は追加する。

## 動作
- フォームは `fetch` で本Workerへ `multipart/form-data` をPOST(画面遷移なし)。
- Worker がフィールドと添付画像を取り出し、Resend API で `TO_EMAIL` 宛に送信。
- `reply_to` に依頼者のメールが入るので、受信メールから直接返信できる。

## カスタマイズ
- 通知先: `TO_EMAIL`
- 差出人: `FROM_EMAIL`(検証済みドメインのみ)
- 自動返信を依頼者にも送りたい場合は、Resend をもう一度呼ぶ処理を追加する。
