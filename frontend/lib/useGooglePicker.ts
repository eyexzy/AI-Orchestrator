"use client";

import { useCallback, useRef } from "react";

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";
const SCOPES = "https://www.googleapis.com/auth/drive.readonly";

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes?: number;
}

interface UseGooglePickerOptions {
  onFiles: (files: DriveFile[], accessToken: string) => void;
  onError?: (err: string) => void;
}

declare global {
  interface Window {
    google?: any;
    gapi?: any;
  }
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

export function useGooglePicker({ onFiles, onError }: UseGooglePickerOptions) {
  const tokenRef = useRef<string | null>(null);

  const openPicker = useCallback(async () => {
    if (!CLIENT_ID) { onError?.("Google Client ID not configured"); return; }

    try {
      await Promise.all([
        loadScript("https://apis.google.com/js/api.js"),
        loadScript("https://accounts.google.com/gsi/client"),
      ]);

      // Load picker API
      await new Promise<void>((resolve) => {
        window.gapi.load("picker", { callback: resolve });
      });

      // Get OAuth token via Google Identity Services
      const token = await new Promise<string>((resolve, reject) => {
        const client = window.google.accounts.oauth2.initTokenClient({
          client_id: CLIENT_ID,
          scope: SCOPES,
          callback: (resp: any) => {
            if (resp.error) { reject(new Error(resp.error)); return; }
            resolve(resp.access_token);
          },
        });
        client.requestAccessToken({ prompt: tokenRef.current ? "" : "consent" });
      });

      tokenRef.current = token;

      // Build and show picker
      const picker = new window.google.picker.PickerBuilder()
        .addView(
          new window.google.picker.DocsView()
            .setIncludeFolders(false)
            .setSelectFolderEnabled(false)
        )
        .addView(new window.google.picker.DocsUploadView())
        .setOAuthToken(token)
        .setCallback((data: any) => {
          if (data.action !== window.google.picker.Action.PICKED) return;
          const files: DriveFile[] = data.docs.map((d: any) => ({
            id: d.id,
            name: d.name,
            mimeType: d.mimeType,
            sizeBytes: d.sizeBytes,
          }));
          onFiles(files, token);
        })
        .build();

      picker.setVisible(true);
    } catch (err) {
      onError?.(err instanceof Error ? err.message : "Google Picker failed");
    }
  }, [onFiles, onError]);

  return { openPicker };
}
