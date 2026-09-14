"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { Button, Label, Modal, Select } from "@/components/ui";
import { fetchContentRoomApi, ContentRoomApiError } from "@/lib/content-room/client";

interface Props {
  open: boolean;
  channelId: string;
  channelLabel: string;
  current: { youtubeAccountId: string | null; instagramAccountId: string | null; telegramTopicId: string | null };
  onClose: () => void;
  onSaved: () => void;
}

interface AccountOption {
  id: string;
  platform: string;
  displayName: string;
  username: string;
  active: boolean;
  connectionStatus: string;
}

interface TopicOption {
  id: string;
  label: string;
  messageThreadId: number | null;
}

async function patchChannel(channelId: string, platform: "youtube" | "instagram" | "telegram", value: string | null, topicId?: string | null) {
  const body: Record<string, unknown> =
    platform === "telegram" ? { channelId, platform, telegramTopicId: value } : { channelId, platform, accountId: value };
  if (topicId !== undefined) body.telegramTopicId = topicId;
  await fetchContentRoomApi(`/api/channels`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function ChannelLinkDialog({ open, channelId, channelLabel, current, onClose, onSaved }: Props) {
  const { data: accounts } = useSWR<AccountOption[]>(open ? "/api/accounts" : null, fetchContentRoomApi);
  const { data: topicsData } = useSWR<{ topics?: TopicOption[]; data?: TopicOption[] }>(open ? "/api/telegram/topics" : null, async (url: string) => {
    const res = await fetch(url);
    return res.json();
  });
  const [youtube, setYoutube] = useState<string>("");
  const [instagram, setInstagram] = useState<string>("");
  const [telegram, setTelegram] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setYoutube(current.youtubeAccountId ?? "");
      setInstagram(current.instagramAccountId ?? "");
      setTelegram(current.telegramTopicId ?? "");
      setError(null);
    }
  }, [open, current.youtubeAccountId, current.instagramAccountId, current.telegramTopicId]);

  const topics = topicsData?.topics ?? topicsData?.data ?? [];
  const ytAccounts = (accounts ?? []).filter((a) => a.platform === "youtube" && a.active && a.connectionStatus === "connected");
  const igAccounts = (accounts ?? []).filter((a) => a.platform === "instagram" && a.active && a.connectionStatus === "connected");

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      if (youtube !== (current.youtubeAccountId ?? "")) await patchChannel(channelId, "youtube", youtube || null);
      if (instagram !== (current.instagramAccountId ?? "")) await patchChannel(channelId, "instagram", instagram || null);
      if (telegram !== (current.telegramTopicId ?? "")) await patchChannel(channelId, "telegram", telegram || null);
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof ContentRoomApiError ? e.message : e instanceof Error ? e.message : "خطا در ذخیره اتصال");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`اتصال حساب به کانال «${channelLabel}»`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            انصراف
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "در حال ذخیره..." : "ذخیره"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && (
          <p className="text-xs text-rose-600" role="alert">
            {error}
          </p>
        )}
        <div className="flex flex-col gap-1">
          <Label>حساب یوتیوب</Label>
          <Select value={youtube} onChange={(e) => setYoutube(e.target.value)} className="min-h-[44px]" aria-label="حساب یوتیوب">
            <option value="">بدون حساب</option>
            {ytAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.displayName || a.username}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label>حساب اینستاگرام</Label>
          <Select value={instagram} onChange={(e) => setInstagram(e.target.value)} className="min-h-[44px]" aria-label="حساب اینستاگرام">
            <option value="">بدون حساب</option>
            {igAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.displayName || a.username}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label>تاپیک تلگرام</Label>
          <Select value={telegram} onChange={(e) => setTelegram(e.target.value)} className="min-h-[44px]" aria-label="تاپیک تلگرام">
            <option value="">بدون تاپیک</option>
            {topics.map((t) => (
              <option key={t.id} value={t.messageThreadId != null ? String(t.messageThreadId) : ""}>
                {t.label}
              </option>
            ))}
          </Select>
        </div>
      </div>
    </Modal>
  );
}
