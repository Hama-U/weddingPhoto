import { google } from "googleapis";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

  if (!clientId || !clientSecret || !refreshToken || !folderId) {
    return NextResponse.json({ error: "Google Driveの接続設定がまだ完了していません。" }, { status: 500 });
  }
  if (!request.body) return NextResponse.json({ error: "ファイルが見つかりません。" }, { status: 400 });

  const encodedName = request.headers.get("x-file-name");
  const fileName = encodedName ? decodeURIComponent(encodedName) : "wedding-photo";
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  const drive = google.drive({ version: "v3", auth: oauth2Client });

  try {
    const uploadStream = Readable.fromWeb(request.body as Parameters<typeof Readable.fromWeb>[0]);
    const result = await drive.files.create({
      requestBody: { name: fileName, parents: [folderId] },
      media: { mimeType: request.headers.get("content-type") || "application/octet-stream", body: uploadStream },
      uploadType: "resumable",
      fields: "id,name",
    });
    return NextResponse.json({ ok: true, file: result.data });
  } catch (error) {
    console.error("Google Drive upload failed", error);
    const googleError = error as { response?: { data?: { error?: string } } };
    const oauthError = googleError.response?.data?.error;
    if (oauthError === "unauthorized_client") {
      return NextResponse.json({ error: "Google OAuthの設定が一致していません。OAuth Playgroundで「自分のOAuth認証情報を使用」を有効にし、現在のClient ID・Client SecretでRefresh tokenを再取得してください。" }, { status: 401 });
    }
    if (oauthError === "invalid_grant") {
      return NextResponse.json({ error: "GoogleのRefresh tokenが無効または期限切れです。現在のOAuthクライアントでRefresh tokenを再取得してください。" }, { status: 401 });
    }
    return NextResponse.json({ error: "Google Driveへの保存に失敗しました。設定または通信状態を確認してください。" }, { status: 502 });
  }
}
