import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

type GoogleTokenResponse = { access_token?: string; error?: string; error_description?: string };
const GOOGLE_ENV_KEYS = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN", "GOOGLE_DRIVE_FOLDER_ID"] as const;

async function getRuntimeEnvironment() {
  let cloudflareEnv: Record<string, unknown> = {};
  let cloudflareContextError = "";
  try {
    const context = await getCloudflareContext({ async: true });
    cloudflareEnv = context.env as unknown as Record<string, unknown>;
  } catch (error) {
    cloudflareContextError = error instanceof Error ? error.message : "unknown error";
  }

  const diagnostics = Object.fromEntries(GOOGLE_ENV_KEYS.map((key) => [key, {
    processEnv: Boolean(process.env[key]),
    cloudflareEnv: Boolean(cloudflareEnv[key]),
  }]));
  console.log("[upload-debug] environment presence", {
    runtime: process.env.NEXT_RUNTIME || "unknown",
    diagnostics,
    cloudflareContextError: cloudflareContextError || undefined,
  });

  return {
    get(key: (typeof GOOGLE_ENV_KEYS)[number]) {
      const processValue = process.env[key];
      if (processValue) return processValue;
      const cloudflareValue = cloudflareEnv[key];
      return typeof cloudflareValue === "string" ? cloudflareValue : undefined;
    },
    diagnostics,
  };
}

async function getGoogleAccessToken(clientId: string, clientSecret: string, refreshToken: string) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }),
  });
  const data = (await response.json()) as GoogleTokenResponse;
  if (!response.ok || !data.access_token) {
    const error = new Error(data.error_description || data.error || "Google OAuth token refresh failed");
    (error as Error & { oauthCode?: string }).oauthCode = data.error;
    throw error;
  }
  return data.access_token;
}

export async function POST(request: Request) {
  const runtimeEnvironment = await getRuntimeEnvironment();
  const clientId = runtimeEnvironment.get("GOOGLE_CLIENT_ID");
  const clientSecret = runtimeEnvironment.get("GOOGLE_CLIENT_SECRET");
  const refreshToken = runtimeEnvironment.get("GOOGLE_REFRESH_TOKEN");
  const folderId = runtimeEnvironment.get("GOOGLE_DRIVE_FOLDER_ID");

  if (!clientId || !clientSecret || !refreshToken || !folderId) {
    const missing = GOOGLE_ENV_KEYS.filter((key) => !runtimeEnvironment.get(key));
    console.error("[upload-debug] missing Google Drive environment variables", { missing, diagnostics: runtimeEnvironment.diagnostics });
    return NextResponse.json({ error: "Google Driveの接続設定がまだ完了していません。", debug: { missing } }, { status: 500 });
  }
  if (!request.body) return NextResponse.json({ error: "ファイルが見つかりません。" }, { status: 400 });

  const encodedName = request.headers.get("x-file-name");
  const fileName = encodedName ? decodeURIComponent(encodedName) : "wedding-photo";
  const mimeType = request.headers.get("content-type") || "application/octet-stream";
  const contentLength = request.headers.get("content-length");

  try {
    const accessToken = await getGoogleAccessToken(clientId, clientSecret, refreshToken);
    const initiateResponse = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": mimeType,
        ...(contentLength ? { "X-Upload-Content-Length": contentLength } : {}),
      },
      body: JSON.stringify({ name: fileName, parents: [folderId] }),
    });
    if (!initiateResponse.ok) {
      console.error("Google Drive upload session failed", initiateResponse.status, await initiateResponse.text());
      return NextResponse.json({ error: "Google Driveのアップロードセッションを開始できませんでした。" }, { status: 502 });
    }

    const uploadUrl = initiateResponse.headers.get("location");
    if (!uploadUrl) return NextResponse.json({ error: "Google Driveからアップロード先URLを取得できませんでした。" }, { status: 502 });
    const uploadResponse = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": mimeType, ...(contentLength ? { "Content-Length": contentLength } : {}) },
      body: request.body,
      // Node.jsのローカル開発サーバーではストリーム送信に必要。Cloudflareでは無視されます。
      duplex: "half",
    } as RequestInit & { duplex: "half" });
    if (!uploadResponse.ok) {
      console.error("Google Drive file upload failed", uploadResponse.status, await uploadResponse.text());
      return NextResponse.json({ error: "Google Driveへの保存に失敗しました。" }, { status: 502 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Google Drive upload failed", error);
    const oauthCode = (error as Error & { oauthCode?: string }).oauthCode;
    if (oauthCode === "unauthorized_client") return NextResponse.json({ error: "Google OAuthの設定が一致していません。現在のClient ID・Client SecretでRefresh tokenを再取得してください。" }, { status: 401 });
    if (oauthCode === "invalid_grant") return NextResponse.json({ error: "GoogleのRefresh tokenが無効または期限切れです。現在のOAuthクライアントでRefresh tokenを再取得してください。" }, { status: 401 });
    return NextResponse.json({ error: "Google Driveへの保存に失敗しました。設定または通信状態を確認してください。" }, { status: 502 });
  }
}
