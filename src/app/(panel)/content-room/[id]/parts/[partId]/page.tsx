"use client";

import { use } from "react";
import { PartWorkspace } from "@/components/content-room/PartWorkspace";

export default function ContentRoomPartPage({ params }: { params: Promise<{ id: string; partId: string }> }) {
  const { id, partId } = use(params);
  return <PartWorkspace productId={id} partId={partId} />;
}
