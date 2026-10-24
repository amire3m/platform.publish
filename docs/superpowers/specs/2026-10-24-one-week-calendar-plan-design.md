# One-Week Calendar Plan Design

## Goal

Display the approved publication plan in the existing Jalali calendar for Saturday 1405/08/02 through Friday 1405/08/08 (2026-10-24 through 2026-10-30). These entries are calendar-only planning information. They cannot be opened as content, rescheduled, published, or observed by publication workers.

The plan contains exactly 15 YouTube entries for `zaviye_no`, `zed_revayat`, and `tamashin`.

## Architecture

Store the fixed week in a small static TypeScript data module. `GET /api/calendar` maps those constants into the existing calendar event response and appends them to real content and workflow publication events.

This feature has no persistence layer. It must not add a database table, schema declaration, migration, seed, content row, workflow publication, notification, scheduled job, or worker integration.

Each static entry contains only:

- a stable display ID;
- its Persian title;
- one approved channel ID;
- an explicit UTC timestamp;
- the matching Tehran/Jalali timestamp.

Explicit timestamps make the one-off schedule reviewable and prevent runtime timezone assumptions from changing it.

## Approved Entries

| Date | Time | Title | Channel | UTC |
|---|---:|---|---|---|
| Sat 1405/08/02 | 11:00 | برنامه بلندگو | `zaviye_no` | 2026-10-24 07:30Z |
| Sat 1405/08/02 | 11:00 | برنامه بلندگو | `zed_revayat` | 2026-10-24 07:30Z |
| Sat 1405/08/02 | 13:00 | مستندهای ضد روایت | `zed_revayat` | 2026-10-24 09:30Z |
| Sun 1405/08/03 | 17:00 | برنامه زاویه صفر درجه | `zaviye_no` | 2026-10-25 13:30Z |
| Sun 1405/08/03 | 19:00 | سریال مشاور | `tamashin` | 2026-10-25 15:30Z |
| Mon 1405/08/04 | 09:00 | برش‌های سریال مشاور | `tamashin` | 2026-10-26 05:30Z |
| Mon 1405/08/04 | 13:00 | مستندهای ضد روایت | `zed_revayat` | 2026-10-26 09:30Z |
| Tue 1405/08/05 | 09:00 | ریلزهای مشاور | `tamashin` | 2026-10-27 05:30Z |
| Tue 1405/08/05 | 12:00 | برش‌های زاویه صفر درجه | `zaviye_no` | 2026-10-27 08:30Z |
| Wed 1405/08/06 | 11:00 | برنامه بلندگو | `zaviye_no` | 2026-10-28 07:30Z |
| Wed 1405/08/06 | 11:00 | برنامه بلندگو | `zed_revayat` | 2026-10-28 07:30Z |
| Wed 1405/08/06 | 13:00 | مستندهای ضد روایت | `zed_revayat` | 2026-10-28 09:30Z |
| Thu 1405/08/07 | 10:30 | ریلز زاویه صفر درجه | `zaviye_no` | 2026-10-29 07:00Z |
| Thu 1405/08/07 | 19:00 | سریال مشاور | `tamashin` | 2026-10-29 15:30Z |
| Fri 1405/08/08 | 10:00 | برش و ریلز مشاور | `tamashin` | 2026-10-30 06:30Z |

## Calendar API

For each static entry, `GET /api/calendar` derives the YouTube account ID and Persian channel label from the existing channel configuration. It returns:

- `displayId`: the stable static ID;
- `source: "plan"`;
- `contentId: null` and `publicationId: null`;
- `platform: "youtube"`;
- `accountId`: the channel's configured YouTube account ID;
- `channel` and `channelLabel`;
- `contentType: "plan"`;
- `status: "planned"` and `contentStatus: "planned"`;
- the explicit UTC and Jalali timestamps;
- `approvalStatus: null`, `hasError: false`, and `thumbnailAvailable: false`.

The existing platform, account, status, channel, and account-access filters are applied to plan entries. Existing database-backed event queries and behavior remain unchanged.

## Calendar UI

Plan entries render in both month and list views and show the Persian status `برنامه انتشار`.

The `source: "plan"` discriminator controls interaction:

- month entries have `draggable=false` and do not register a drag-start handler;
- the drag handler also rejects plan entries defensively;
- list entries use a non-interactive container instead of a content or workflow link;
- stable display IDs are used for React keys and calendar conflict identity.

Real content and workflow publication events retain their current links, drag/drop behavior, and reschedule endpoints.

## Testing

- API tests assert all 15 literal title/channel/time tuples, unique stable IDs, source/status fields, and account mapping.
- API tests assert platform and channel filters apply to static entries.
- UI tests assert plan entries are non-draggable and non-linked, display `برنامه انتشار`, and leave real events draggable and linked.
- Calendar identity tests assert entries without content records use their stable display IDs.

## Out Of Scope

- Any database table, schema change, migration, or seed.
- Any content or workflow publication record.
- Any notification, worker, scheduler, or publication integration.
- Editing, deleting, dragging, or rescheduling plan entries.
- Recurrence or plans outside 1405/08/02 through 1405/08/08.
- Push, deployment, or production data changes.
