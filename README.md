# みんなのウェディングフォト

## 起動

```bash
npm install
copy .env.example .env.local
npm run dev
```

`.env.local` にGoogle Drive OAuth情報と保存先フォルダIDを設定すると、Google Driveの指定フォルダへ元ファイルのまま保存します。写真・動画はAPI経由でストリーム転送し、Google Drive側の再開可能アップロードを使います。

## Google Drive接続に必要なもの

サーバー側にGoogle OAuthのクライアント情報とリフレッシュトークンを設定します。トークンはブラウザへ渡しません。

1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクトを作成
2. 「APIとサービス」→「ライブラリ」→「Google Drive API」を有効化
3. 「OAuth同意画面」を設定し、テストユーザーに自分のGoogleアカウントを追加
4. 「認証情報」→「認証情報を作成」→「OAuthクライアントID」を作成（アプリの種類はデスクトップアプリ）
5. [OAuth 2.0 Playground](https://developers.google.com/oauthplayground/) を使ってリフレッシュトークンを取得
   - 右上の設定アイコンを開き、「Use your own OAuth credentials」を有効化
   - 作成した `GOOGLE_CLIENT_ID` と `GOOGLE_CLIENT_SECRET` を入力
   - `https://www.googleapis.com/auth/drive` をスコープ欄に入力
   - 「Authorize APIs」→Googleアカウントで許可→「Exchange authorization code for tokens」
   - 表示されたRefresh tokenを `GOOGLE_REFRESH_TOKEN` に設定
   - OAuth Playgroundを使う場合は、Google Cloud Consoleの認証情報に `https://developers.google.com/oauthplayground` をリダイレクトURIとして一時追加
6. Google Driveで保存先フォルダを作成し、URLの末尾にある文字列を `GOOGLE_DRIVE_FOLDER_ID` に設定
7. `.env.local` に以下を設定

```env
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REFRESH_TOKEN=...
GOOGLE_DRIVE_FOLDER_ID=...
```

保存先フォルダのURLが `https://drive.google.com/drive/folders/abc123...` の場合、`abc123...` の部分がフォルダIDです。

OAuth同意画面が「テスト」のままだと、Googleの仕様でリフレッシュトークンが7日で失効することがあります。結婚式当日だけ使う場合は再取得で対応できます。長期運用する場合は同意画面を公開状態にするか、Google Workspaceの組織内アプリとして設定してください。

`GOOGLE_CLIENT_SECRET` と `GOOGLE_REFRESH_TOKEN` は公開リポジトリやブラウザ側の環境変数に置かないでください。Vercelなどにデプロイする場合は、プロジェクトのサーバー側環境変数として登録します。

## Cloudflare Workersへデプロイ

このプロジェクトはCloudflare Pagesの静的サイトではなく、Next.jsのRoute Handler（`/api/upload`）を使うため、Cloudflare Workers + OpenNextでデプロイします。別プロジェクトの`wrangler.toml`をコピーせず、リポジトリ内の`wrangler.jsonc`とOpenNext設定を使用してください。

Cloudflare WorkersのBuild設定は以下にします。

```text
Build command: npx @opennextjs/cloudflare build
Deploy command: npx @opennextjs/cloudflare deploy
```

CloudflareダッシュボードのWorkersプロジェクトで、Build Variables and secretsに次の4つを登録します。値はローカルの`.env.local`と同じです。

```text
GOOGLE_CLIENT_ID        通常の変数
GOOGLE_CLIENT_SECRET    Secret
GOOGLE_REFRESH_TOKEN    Secret
GOOGLE_DRIVE_FOLDER_ID  通常の変数
```

Cloudflare WorkersのSecretsは暗号化された環境変数として実行時に参照できます。[Cloudflare公式ドキュメント](https://developers.cloudflare.com/workers/configuration/secrets/)

### 大きな動画について

Cloudflare WorkersのFree/Proプランでは、1回のリクエスト本文が最大100MBです。そのため、100MBを超えるスマホ動画は現在の`/api/upload`経由ではアップロードできません。100MBを超える動画も受け付ける場合は、Google Driveの再開可能アップロードURLをブラウザへ渡し、Cloudflareを経由せず直接Google Driveへ送る方式へ変更する必要があります。[Cloudflareのリクエスト上限](https://developers.cloudflare.com/workers/platform/limits/)

### `unauthorized_client`

このエラーは、`GOOGLE_REFRESH_TOKEN`を取得したOAuthクライアントと、`.env.local`の`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`が別の組み合わせになっている場合に発生します。

次の手順で、3つを同じOAuthクライアントに揃えてください。

1. Google Cloud Consoleの「クライアント」から、今回作成したウェブアプリケーションのClient IDとClient Secretをコピー
2. OAuth Playground右上の設定で「Use your own OAuth credentials」をオン
3. その同じClient IDとClient Secretを入力
4. スコープ `https://www.googleapis.com/auth/drive` を許可
5. Step 2で「Exchange authorization code for tokens」を実行
6. 新しく表示されたRefresh tokenを`.env.local`の`GOOGLE_REFRESH_TOKEN`へ上書き
7. Next.jsの開発サーバーを再起動

OAuth Playgroundの初期状態で取得したRefresh tokenは、今回作成したClient ID/Secretとは別のクライアントに紐づくため、そのまま使用できません。
