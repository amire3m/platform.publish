# One-Week Calendar Plan Design

## Goal

Show the approved publication plan in the existing Jalali calendar for Saturday 2 Aban 1405 through Friday 8 Aban 1405 (2026-10-24 through 2026-10-30), without creating publishable content or allowing the publish workers to act on these entries.

Shock and Tinazh entries are excluded. The visible plan contains only Zaviye No, Zed Revayat, and Tamashin entries.

## Why A Separate Plan Model

The current calendar reads legacy content targets and workflow publications. Both models participate in publication workflows: a scheduled status can make an item eligible for a worker. These weekly placeholders have no media and must never be published automatically.

A dedicated `calendar_plan_entries` table keeps planning metadata separate from executable publication state. The calendar API merges plan entries into its response, while both publish workers continue querying only their existing tables.

## Data Model

Add `calendar_plan_entries` with:

- `id`: text primary key using `CPE-1405-NNNNNN` identifiers.
- `title`: required text.
- `channel`: required text; initial accepted values are the visible channels only.
- `platform`: required text, default `youtube`.
- `scheduled_at`: required `timestamptz`.
- `created_by`: nullable user reference.
- `created_at` and `updated_at`: required timestamps.

The migration inserts the 15 approved entries with stable IDs and `ON CONFLICT DO NOTHING`, making deployment idempotent. All times are interpreted in `Asia/Tehran` and stored as UTC instants.

No recurrence rule is stored because the requested scope is one fixed week only.

## Approved Entries

| Date | Time | Title | Channel |
|---|---:|---|---|
| Sat 1405/08/02 | 11:00 | برنامه بلندگو | زاویه نو |
| Sat 1405/08/02 | 11:00 | برنامه بلندگو | ضد روایت |
| Sat 1405/08/02 | 13:00 | مستندهای ضد روایت | ضد روایت |
| Sun 1405/08/03 | 17:00 | برنامه زاویه صفر درجه | زاویه نو |
| Sun 1405/08/03 | 19:00 | سریال مشاور | تماشین |
| Mon 1405/08/04 | 09:00 | برش‌های سریال مشاور | تماشین |
| Mon 1405/08/04 | 13:00 | مستندهای ضد روایت | ضد روایت |
| Tue 1405/08/05 | 09:00 | ریلزهای مشاور | تماشین |
| Tue 1405/08/05 | 12:00 | برش‌های زاویه صفر درجه | زاویه نو |
| Wed 1405/08/06 | 11:00 | برنامه بلندگو | زاویه نو |
| Wed 1405/08/06 | 11:00 | برنامه بلندگو | ضد روایت |
| Wed 1405/08/06 | 13:00 | مستندهای ضد روایت | ضد روایت |
| Thu 1405/08/07 | 10:30 | ریلز زاویه صفر درجه | زاویه نو |
| Thu 1405/08/07 | 19:00 | سریال مشاور | تماشین |
| Fri 1405/08/08 | 10:00 | برش و ریلز مشاور | تماشین |

Relative-time choices approved by the operator are: morning 09:00, noon 12:00, morning-to-noon 10:30, and the otherwise unspecified Friday entry 10:00.

## Calendar API

`GET /api/calendar` loads plan entries in addition to existing events and maps each one into the current event shape:

- `source: "plan"`
- `planEntryId`
- `contentId: "plan:<id>"` for a stable UI key
- `publicationId: null`
- `platform` from the row
- `accountId` derived from the channel configuration
- `channel` and `channelLabel`
- `contentType: "plan"`
- `status: "planned"`
- `publishAtUtc` from `scheduled_at`
- `publishAtJalali` from the existing Tehran/Jalali formatter
- `contentStatus: "planned"`
- `approvalStatus: null`
- `hasError: false`
- `thumbnailAvailable: false`

Existing platform, account, and channel filters apply to plan entries. Hidden channels are filtered defensively even if an invalid row reaches the table.

## Calendar UI

Extend `CalendarEvent` with optional `source` and `planEntryId` fields.

Plan entries:

- render in both month and list modes;
- show a Persian `برنامه انتشار` status label rather than an unknown raw status;
- retain the existing channel and time presentation;
- are not draggable and cannot call either reschedule endpoint;
- still participate in channel conflict detection.

Existing publication events retain their current drag/drop behavior.

## Safety

- Publish workers receive no code or query changes and cannot see the new table.
- The seed contains no `shock` or `tinazh` rows.
- The API rejects hidden channels at presentation time.
- Migration insertion is idempotent.
- No notifications are sent for plan entries.
- Existing publication and content records are not modified.

## Testing

- Schema test covers required fields and indexes.
- API test verifies plan events are merged and mapped correctly.
- API tests verify platform/channel filtering and hidden-channel exclusion.
- Calendar UI test verifies a planned event renders with `برنامه انتشار`.
- Calendar UI test verifies plan entries are non-draggable while real publication entries remain draggable.
- Date tests verify the first and last local Tehran slots map to the correct Jalali week.
- Migration/data verification asserts exactly 15 rows and zero Shock/Tinazh rows.
- Production verification checks revision, health, row count, API response, and current service logs.

## Out Of Scope

- Recurring schedules beyond 8 Aban 1405.
- Editing or deleting plan entries through the UI.
- Turning a plan entry into publishable content.
- Restoring any Shock or Tinazh surface.
