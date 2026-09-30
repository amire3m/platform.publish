"use client";

import { use, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import useSWR from "swr";
import { ArrowRight, Clock, Send } from "lucide-react";
import { YoutubeIcon, InstagramIcon } from "@/components/brand-icons";
import { Button, Card, EmptyState, ErrorState, Skeleton } from "@/components/ui";
import { fetchContentRoomApi, ContentRoomApiError } from "@/lib/content-room/client";
import type { ContentRoomProductDetail } from "@/components/content-room/types";
import type { PublicAccountDto } from "@/lib/accounts/public";
import { AccountPicker } from "@/components/content-room/AccountPicker";
import { SendVideoCard, type SendKind, type SendVideoValue, type PlaylistOption } from "@/components/content-room/SendVideoCard";

const KINDS: Array<{ kind: SendKind; label: string; desc: string; accent: string }> = [
  { kind: "youtube_full", label: "ویدیو کامل", desc: "ویدیوی اصلی بلند — یوتیوب", accent: "bg-tg-hover/20" },
  { kind: "highlight", label: "برش (هایلایت)", desc: "برش کوتاه مستقل — یوتیوب", accent: "bg-amber-500/5 border-amber-200" },
  { kind: "reel", label: "ریلز", desc: "یک فایل — یوتیوب Shorts + اینستاگرام", accent: "bg-violet-500/5 border-violet-200" },
];

async function detailFetcher(url: string): Promise<ContentRoomProductDetail | null> {
  const data = await fetchContentRoomApi<unknown>(url);
  if (!data) return null;
  if (typeof data === "object" && data !== null && "product" in data) {
    return (data as { product: ContentRoomProductDetail }).product;
  }
  if (typeof data === "object" && data !== null && "data" in data) {
    return ((data as { data?: ContentRoomProductDetail }).data ?? null) as ContentRoomProductDetail | null;
  }
  return data as ContentRoomProductDetail;
}

async function jsonFetcher(url: string) {
  const res = await fetch(url);
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.ok) throw new Error(body?.error ?? "خطا در دریافت");
  return body.data;
}

function keyOf(partId: string, kind: SendKind) {
  return `${partId}:${kind}`;
}

function emptyValue(): SendVideoValue {
  return { title: "", description: "", playlistId: "", manualPlaylistId: "", youtubeAt: "", instagramAt: "", caption: "", publishToInstagram: true };
}

export default function ContentRoomSendPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const { data: product, error: productError, isLoading: productLoading } = useSWR<ContentRoomProductDetail | null>(
    id ? `/api/content-room/products/${id}` : null,
    detailFetcher,
  );
  const { data: accountsData } = useSWR<{ accounts?: PublicAccountDto[] } | PublicAccountDto[]>("/api/accounts", jsonFetcher);
  const accounts: PublicAccountDto[] = useMemo(() => {
    if (!accountsData) return [];
    return Array.isArray(accountsData) ? accountsData : (accountsData.accounts ?? []);
  }, [accountsData]);
  const { data: channelsData } = useSWR<{ channels: Array<{ id: string; youtubeAccountId: string | null; instagramAccountId: string | null }> }>(
    "/api/channels",
    jsonFetcher,
  );

  const parts = useMemo(
    () => (product?.parts ?? []).filter((p) => p.isActive ?? true).sort((a, b) => a.partNumber - b.partNumber),
    [product],
  );

  const channelDefault = useMemo(() => {
    const c = channelsData?.channels?.find((x) => x.id === product?.channel);
    return { youtubeAccountId: c?.youtubeAccountId ?? null, instagramAccountId: c?.instagramAccountId ?? null };
  }, [channelsData, product]);

  const [youtubeAccountId, setYoutubeAccountId] = useState("");
  const [instagramAccountId, setInstagramAccountId] = useState("");
  const [values, setValues] = useState<Record<string, SendVideoValue>>({});
  const [sending, setSending] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Defaults from channel once loaded
  useEffect(() => {
    if (channelDefault.youtubeAccountId && !youtubeAccountId) setYoutubeAccountId(channelDefault.youtubeAccountId);
    if (channelDefault.instagramAccountId && !instagramAccountId) setInstagramAccountId(channelDefault.instagramAccountId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelDefault]);

  // Real YouTube playlists for the selected account
  const { data: playlistsData, isLoading: playlistsLoading, error: playlistsError } = useSWR<{ playlists: PlaylistOption[] }>(
    youtubeAccountId ? `/api/accounts/${youtubeAccountId}/playlists` : null,
    jsonFetcher,
  );
  const playlists = playlistsData?.playlists ?? [];

  function update(partId: string, kind: SendKind, field: keyof SendVideoValue, v: string | boolean) {
    const k = keyOf(partId, kind);
    setValues((prev) => ({ ...prev, [k]: { ...emptyValue(), ...prev[k], [field]: v } }));
  }

  const summary = useMemo(() => {
    let yt = 0;
    let ig = 0;
    let scheduled = 0;
    for (const p of parts) {
      for (const k of KINDS) {
        yt += 1;
        const v = values[keyOf(p.id, k.kind)];
        if (v?.youtubeAt) scheduled += 1;
        if (k.kind === "reel" && (v?.publishToInstagram ?? true)) {
          ig += 1;
          if (v?.instagramAt) scheduled += 1;
        }
      }
    }
    return { yt, ig, scheduled, total: yt + ig };
  }, [parts, values]);

  const needsInstagram = useMemo(
    () => parts.some((p) => (values[keyOf(p.id, "reel")]?.publishToInstagram ?? true)),
    [parts, values],
  );

  async function handleSend() {
    setSubmitError(null);
    if (!youtubeAccountId) {
      setSubmitError("صفحه یوتیوب را انتخاب کنید.");
      return;
    }
    if (needsInstagram && !instagramAccountId) {
      setSubmitError("برای ریلزها انتشار اینستاگرام روشن است؛ صفحه اینستاگرام را انتخاب کنید یا تاگل را خاموش کنید.");
      return;
    }
    setSending(true);
    try {
      const partOverrides: Array<Record<string, unknown>> = [];
      const perPartSchedules: Array<Record<string, unknown>> = [];
      for (const p of parts) {
        for (const k of KINDS) {
          const v = values[keyOf(p.id, k.kind)] ?? emptyValue();
          const publishToInstagram = k.kind === "reel" ? v.publishToInstagram : undefined;
          const playlistId = v.playlistId === "__manual" ? v.manualPlaylistId.trim() || null : v.playlistId || null;
          if (v.title.trim() || v.description.trim() || playlistId || (k.kind === "reel" && v.caption.trim())) {
            partOverrides.push({
              partId: p.id,
              kind: k.kind,
              title: v.title.trim() || undefined,
              description: v.description.trim() || undefined,
              playlistId,
              instagramCaption: k.kind === "reel" ? v.caption.trim() || undefined : undefined,
              youtubeAccountId,
              instagramAccountId: k.kind === "reel" && v.publishToInstagram ? instagramAccountId : undefined,
              publishToInstagram,
            });
          } else {
            // Still send account + toggle so defaults apply per video
            partOverrides.push({
              partId: p.id,
              kind: k.kind,
              youtubeAccountId,
              instagramAccountId: k.kind === "reel" && v.publishToInstagram ? instagramAccountId : undefined,
              publishToInstagram,
            });
          }
          if (v.youtubeAt || (k.kind === "reel" && v.publishToInstagram && v.instagramAt)) {
            perPartSchedules.push({
              partId: p.id,
              kind: k.kind,
              youtubeScheduledAt: v.youtubeAt ? new Date(v.youtubeAt).toISOString() : null,
              instagramScheduledAt: k.kind === "reel" && v.publishToInstagram && v.instagramAt ? new Date(v.instagramAt).toISOString() : null,
            });
          }
        }
      }
      const data = await fetchContentRoomApi<{ programId: string }>(`/api/content-room/products/${id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedVersion: product!.version, partOverrides, perPartSchedules }),
      });
      router.push(`/workflow/${data.programId}`);
    } catch (e) {
      setSubmitError(e instanceof ContentRoomApiError ? e.message : e instanceof Error ? e.message : "خطا در ارسال");
    } finally {
      setSending(false);
    }
  }

  if (productLoading) {
    return (
      <div className="space-y-6" dir="rtl">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40" />
        <Skeleton className="h-64" />
      </div>
    );
  }
  if (productError || !product) {
    return (
      <div className="space-y-6" dir="rtl">
        <Link href={`/content-room/${id}`} className="inline-flex items-center gap-2 text-sm text-tg-accent hover:underline">
          <ArrowRight className="h-4 w-4" />
          بازگشت به محصول
        </Link>
        <ErrorState message={productError instanceof Error ? productError.message : "محصول یافت نشد"} />
      </div>
    );
  }
  if (product.sentProgram) {
    return (
      <div className="space-y-6" dir="rtl">
        <EmptyState title="این محتوا قبلاً ارسال شده است" description="برای جلوگیری از انتشار تکراری، ارسال مجدد ممکن نیست." action={
          <Link href={`/workflow/${product.sentProgram.id}`}>
            <Button>مشاهده در اتاق انتشار</Button>
          </Link>
        } />
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      <Link href={`/content-room/${id}`} className="inline-flex items-center gap-2 text-sm text-tg-accent hover:underline">
        <ArrowRight className="h-4 w-4" />
        بازگشت به {product.title}
      </Link>

      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-tg-text">
          <YoutubeIcon className="h-5 w-5 text-rose-500" />
          ارسال به انتشار — {product.title}
        </h1>
        <p className="mt-1 text-sm text-tg-secondary">
          مثل صفحه آپلود یوتیوب: عنوان و توضیحات مخصوص هر ویدیو، انتخاب صفحه یوتیوب/اینستاگرام، تاگل انتشار همزمان ریلز و زمان‌بندی — همه در همین صفحه.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Video details column */}
        <div className="space-y-5">
          {parts.map((p) => {
            const hasCover = !!p.coverFileRef;
            return (
              <Card key={p.id} className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-tg-text">قسمت {p.partNumber}</p>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] ${hasCover ? "bg-emerald-500/15 text-emerald-700" : "bg-amber-500/15 text-amber-700"}`}>
                    {hasCover ? "کاور ✓ (تامبنیل همه ویدیوها)" : "کاور: در انتظار فایل"}
                  </span>
                </div>
                {KINDS.map((k) => (
                  <SendVideoCard
                    key={k.kind}
                    kind={k.kind}
                    kindLabel={k.label}
                    kindDesc={k.desc}
                    accent={k.accent}
                    partNumber={p.partNumber}
                    productTitle={product.title}
                    hasFile={Boolean(k.kind === "youtube_full" ? p.fileRef : k.kind === "highlight" ? p.highlightFileRef : p.reelFileRef)}
                    value={values[keyOf(p.id, k.kind)] ?? emptyValue()}
                    onChange={(f, v) => update(p.id, k.kind, f, v)}
                    playlists={playlists}
                    playlistsLoading={playlistsLoading}
                    playlistsError={playlistsError ? "خواندن پلی‌لیست ناموفق بود؛ ID دستی وارد کنید." : null}
                  />
                ))}
              </Card>
            );
          })}
          {parts.length === 0 && <EmptyState title="قسمتی وجود ندارد" />}
        </div>

        {/* Destination + schedule sidebar */}
        <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <Card className="space-y-3">
            <p className="text-sm font-bold text-tg-text">مقصد انتشار</p>
            <AccountPicker label="صفحه یوتیوب" platform="youtube" accounts={accounts} value={youtubeAccountId} onChange={setYoutubeAccountId} hint="پیش‌فرض: اکانت لینک‌شده به کانال" />
            <AccountPicker label="صفحه اینستاگرام (ریلزها)" platform="instagram" accounts={accounts} value={instagramAccountId} onChange={setInstagramAccountId} hint="فقط برای ریلزهایی که تاگل اینستاگرام روشن است" />
          </Card>

          <Card className="space-y-2">
            <p className="text-sm font-bold text-tg-text">جمع‌بندی</p>
            <p className="flex items-center gap-1.5 text-xs text-tg-secondary"><YoutubeIcon className="h-3.5 w-3.5 text-rose-500" /> {summary.yt} انتشار یوتیوب</p>
            <p className="flex items-center gap-1.5 text-xs text-tg-secondary"><InstagramIcon className="h-3.5 w-3.5 text-pink-500" /> {summary.ig} انتشار اینستاگرام</p>
            <p className="flex items-center gap-1.5 text-xs text-tg-secondary"><Clock className="h-3.5 w-3.5" /> {summary.scheduled} زمان‌بندی‌شده · {summary.total - summary.scheduled} فوری</p>
          </Card>

          {submitError && <ErrorState message={submitError} />}

          <Button onClick={handleSend} disabled={sending || parts.length === 0} className="min-h-[44px] w-full">
            <Send className="h-4 w-4" />
            {sending ? "در حال ارسال..." : "ارسال به اتاق انتشار"}
          </Button>
        </div>
      </div>
    </div>
  );
}
