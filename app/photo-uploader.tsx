"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";

type Photo = { id: string; file: File; url: string; kind: "image" | "video" };

export default function PhotoUploader() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => () => photos.forEach((photo) => URL.revokeObjectURL(photo.url)), [photos]);

  const chooseFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []).filter((file) => file.type.startsWith("image/") || file.type.startsWith("video/"));
    setPhotos((current) => [
      ...current,
      ...files.map((file) => ({ id: `${file.name}-${file.lastModified}-${Math.random()}`, file, url: URL.createObjectURL(file), kind: file.type.startsWith("video/") ? "video" as const : "image" as const })),
    ]);
    setMessage("");
    event.target.value = "";
  };

  const removePhoto = (id: string) => {
    setPhotos((current) => {
      const photo = current.find((item) => item.id === id);
      if (photo) URL.revokeObjectURL(photo.url);
      return current.filter((item) => item.id !== id);
    });
  };

  const upload = async () => {
    if (!photos.length || isUploading) return;
    setIsUploading(true);
    setMessage("");
    try {
      for (let index = 0; index < photos.length; index += 1) {
        const { file } = photos[index];
        setMessage(`${index + 1} / ${photos.length} をアップロード中…`);
        const response = await fetch("/api/upload", {
          method: "POST",
          headers: { "Content-Type": file.type || "application/octet-stream", "X-File-Name": encodeURIComponent(file.name) },
          body: file,
        });
        if (!response.ok) throw new Error((await response.json()).error || "アップロードに失敗しました");
      }
      setPhotos([]);
      setMessage(`${photos.length}個のファイルをアップロードしました。ありがとうございます！`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "アップロードに失敗しました。もう一度お試しください。");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <main className="page-shell">
      <section className="hero">
        <p className="eyebrow">WEDDING PHOTO SHARE</p>
        <h1>今日の写真を<br /><em>新郎新婦へ</em></h1>
        <p className="intro">みんなが撮ってくれた写真を、ふたりは楽しみにしています。</p>
      </section>

      <section className="upload-card" aria-label="写真アップロード">
        <button className="dropzone" type="button" onClick={() => inputRef.current?.click()}>
          <span className="camera" aria-hidden="true">✦</span>
          <strong>写真・動画を選ぶ</strong>
          <span>タップしてファイルを追加（複数選択OK）</span>
        </button>
        <input ref={inputRef} type="file" accept="image/*,video/*" multiple onChange={chooseFiles} hidden />

        {photos.length > 0 && (
          <div className="photo-section">
            <div className="section-heading"><span>送るファイル</span><small>{photos.length}個</small></div>
            <div className="photo-grid">
              {photos.map((photo) => (
                <div className="photo-tile" key={photo.id}>
                  {photo.kind === "video" ? <video src={photo.url} aria-label={photo.file.name} muted playsInline controls /> : <img src={photo.url} alt={photo.file.name} />}
                  <button type="button" className="remove" onClick={() => removePhoto(photo.id)} aria-label={`${photo.file.name}を削除`}>×</button>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="upload-note">※一度にたくさん送ると回線が混み合うため、少しずつ送ってください。</p>
        <button className="upload-button" type="button" disabled={!photos.length || isUploading} onClick={upload}>
          {isUploading ? "アップロード中…" : "アップロード"}
        </button>
        {message && <p className="message" role="status">{message}</p>}
      </section>
      <footer className="footer">© Yuki &amp; Akari</footer>
    </main>
  );
}
