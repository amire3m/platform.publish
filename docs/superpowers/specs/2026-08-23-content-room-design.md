# Content Room Design — intake to Publication Room

## Overview
Add /content-room as intake for already-produced products. Each product (6 types) with N parts is re-edited for YouTube (copyright fix) plus 3 derivatives per part: highlight (short cuts from same production), reel, cover. On "Send to Publication" 4 deliverables per part are created in workflow (existing workflow_programs/deliverables/publications) bound to target channel.

## Product Types
سریال، مستند، برنامه تلویزیونی، فیلم سینمایی، فیلم کوتاه، آموزشی (6).

## Channels (6)
موسسه: ضد روایت، زاویه نو، تماشین، Iranian Frame
دفتر: شوک، تیناژ
Each has YouTube social_account + one Instagram page + optional Telegram. Content-room selects one channel per product; deliverables inherit it (channel_id stored on program).

## Content Room Statuses
واردشده → در تدوین یوتیوب → رفع کپی‌رایت → هایلایت ساخته شد → ریلز ساخته شد → کاور آماده → آماده ارسال (terminal ready). Changes require reason. Types share same status set.

## Data Model
- Table content_products: id (CPR-...), title, product_type (enum 6), channel (enum 6), parts_count int, status enum, due_at, notes, version, created_by, created_at.
- Table content_parts: id, product_id FK, part_number, file_ref nullable, status? (optional, defaults to product status).
- On send: create workflow_program (title = product title, seriesName = product type + channel), then for each part create 4 deliverables: youtube_full, highlight, reel, cover (cover publication only image). Map each deliverable publication to channel's YouTube/Instagram/Telegram accounts (publication platform/account). Progress derived via existing progress.ts.

## Flow
1. Create product in /content-room (form: title, type, channel, parts_count).
2. Update status stepwise (with reason for changes_requested/cancel).
3. Click "ارسال به انتشار" -> transaction creates program+deliverables+publications, marks content_product as sent, event logged.
4. /workflow shows program with channel badge and 4 outputs per part.

## UI
- /content-room: table desktop (columns product, type, channel, parts, status, progress 4 outputs, next action), cards mobile, filters type/channel/status/search, 44px touch.
- Detail page /content-room/[id]: parts list, status actions, send button disabled until status=ready.
- Permissions: view_content_room, update_assigned_content, manage_content_room.

## Out of Scope
- Bulk import, file upload to Telegram (keep optional), cover image editor.
