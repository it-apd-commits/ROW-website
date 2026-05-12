# ROW (Rehab on Wheels) — Application Requirements Document

**Organisation:** APD India
**Application:** ROW Web Application (PWA)
**Stack:** React 19 · TypeScript 5.9 · Supabase · Dexie (IndexedDB) · TailwindCSS · Vite
**Document maintained by:** Shaik Azeem / APD India IT Team
**Last updated:** 2026-05-12

---

## How to Use This Document

Each module follows the same four-section template:

| Section | Purpose |
|---|---|
| **Overview** | What the module does and who uses it |
| **Implemented** | Features already built and working |
| **Known Issues** | Bugs or gaps in the current build |
| **Pending / New Requirements** | New additions to implement — add new items here |

Add new requirement items under **Pending / New Requirements** using the numbered format:
```
REQ-[MODULE]-[NNN] · [Priority: High/Medium/Low] · [Status: Open/In Progress/Done]
Brief description of what needs to be built.
```

---

## Table of Contents

1. [Authentication & Access Control](#1-authentication--access-control)
2. [Beneficiary Registration](#2-beneficiary-registration)
3. [Service Entry](#3-service-entry)
4. [Assessment Module](#4-assessment-module)
5. [Trip Tracking](#5-trip-tracking)
6. [Token Management](#6-token-management)
7. [Reports & Outcomes](#7-reports--outcomes)
8. [Exercise Management](#8-exercise-management)
9. [Calendar & Scheduling](#9-calendar--scheduling)
10. [Sync & Offline Engine](#10-sync--offline-engine)
11. [Admin Control Panel](#11-admin-control-panel)
12. [Settings](#12-settings)
13. [Dashboard](#13-dashboard)
14. [Data Masters & Configuration](#14-data-masters--configuration)
15. [New Requirements Backlog](#15-new-requirements-backlog)

---

## 1. Authentication & Access Control

### Overview
Supabase email/password authentication with role-based access control (RBAC) governing every page and action in the system.

### Roles & Permissions Matrix

| Permission | Admin | Manager | Staff | MIS | Fleet |
|---|:---:|:---:|:---:|:---:|:---:|
| Create records | ✓ | ✓ | ✓ | ✓ | ✓ |
| Edit records | ✓ | ✓ | ✗ | ✓ | ✗ |
| Delete records | ✓ | ✓ | ✗ | ✗ | ✗ |
| Admin panel | ✓ | ✗ | ✗ | ✗ | ✗ |
| Export data | ✓ | ✓ | ✗ | ✓ | ✓ |
| Import data | ✓ | ✓ | ✗ | ✓ | ✗ |
| Manage users | ✓ | ✗ | ✗ | ✗ | ✗ |

### Page Access by Role

| Page | Admin | Manager | Staff | MIS | Fleet |
|---|:---:|:---:|:---:|:---:|:---:|
| Dashboard | ✓ | ✓ | ✓ | ✓ | ✓ |
| Beneficiary | ✓ | ✓ | ✓ | ✓ | ✗ |
| Services | ✓ | ✓ | ✓ | ✓ | ✗ |
| Assessments | ✓ | ✓ | ✓ | ✓ | ✗ |
| Tokens | ✓ | ✓ | ✓ | ✗ | ✗ |
| Tracking | ✓ | ✓ | ✗ | ✗ | ✓ |
| Reports | ✓ | ✓ | ✗ | ✓ | ✗ |
| Exercises | ✓ | ✓ | ✗ | ✗ | ✗ |
| Calendar | ✓ | ✓ | ✗ | ✗ | ✗ |
| Admin Panel | ✓ | ✗ | ✗ | ✗ | ✗ |
| Settings | ✓ | ✓ | ✓ | ✓ | ✓ |

### Implemented
- [x] Email/password login via Supabase Auth
- [x] Session persistence — auto-login on app launch
- [x] Role loaded from `profiles` table; normalized to 5 roles
- [x] Emergency admin bypass for known emails (`it@apd-india.org`, `shaikazeem@apd-india.org`)
- [x] `RouteGuard` component — blocks page access based on role; redirects to fallback
- [x] `usePermissions()` hook — exposes `can(action)` and `hasPageAccess(page)` throughout the app
- [x] Self-protection on role change — admin cannot downgrade their own role

### Known Issues
- [ ] No password reset flow built in the UI (relies on Supabase email link only)
- [ ] Session expiry not handled gracefully — silent failure instead of redirecting to login
- [ ] No multi-factor authentication (MFA) option

### Pending / New Requirements
```
REQ-AUTH-001 · Priority: Medium · Status: Open
Add a "Forgot Password" screen in the login flow that triggers a Supabase
password reset email. Currently users must contact IT to reset.

REQ-AUTH-002 · Priority: Low · Status: Open
Show a session-expired dialog when the Supabase token expires mid-session
and automatically redirect to /login instead of silent API failures.
```

---

## 2. Beneficiary Registration

### Overview
Core module for registering persons who receive rehabilitation services. Supports offline registration with token generation, smart duplicate detection, file number linking, and sync to Supabase.

### Key Data Fields

| Field | Type | Notes |
|---|---|---|
| name | string | Required |
| age | number | Required |
| gender | Male / Female / Other | Required |
| mobile_no | string | Used for duplicate detection |
| disability_type | enum (7 types) | Required |
| program | string | e.g., Rehab on Wheels |
| economic_status | BPL / APL | Required |
| file_number | string | Assigned by admin after registration |
| token_no | number | Auto-assigned sequential daily token |
| offline_token | string | `OFF-YYYYMMDD-XXXX` — assigned if registered offline |
| registration_status | pending / complete | Complete = file number assigned |
| sync_status | pending / synced / failed | Offline sync tracking |

### Implemented
- [x] Add beneficiary form with all demographic fields
- [x] Smart duplicate detection: exact phone match → auto-link; name+location match → show confirmation dialog; no match → create new
- [x] Force-create option when only partial match exists
- [x] Daily token auto-assignment (sequential counter from `TokenService`)
- [x] Offline registration — saves to Dexie with `sync_status = pending`; syncs when online
- [x] Offline token (`OFF-...`) used as identifier pre-sync
- [x] Beneficiary list — search by name, file number, phone
- [x] Filter by registration status (pending / complete)
- [x] Offline status badges (pending / synced / failed with error message expansion)
- [x] Edit beneficiary (Manager/Admin only)
- [x] Delete beneficiary with confirmation (Manager/Admin only)
- [x] Export beneficiary list to Excel
- [x] Import file numbers via Excel upload (SYSTEM_ID ↔ FILE_NUMBER mapping)
- [x] Beneficiary profile page with linked service history and quick actions
- [x] Real-time cross-device sync via Supabase Realtime

### Known Issues
- [ ] Beneficiary profile page has no offline fallback — shows blank if offline and the record isn't cached
- [ ] Completing a stub (`registration_status = pending`) has no dedicated UI flow — staff must go via Edit
- [ ] After file number is assigned via import, linked service entries are not automatically re-queried

### Pending / New Requirements
```
REQ-BEN-001 · Priority: High · Status: Open
Add an offline fallback to the Beneficiary Profile page — if Supabase is
unreachable, load the record from Dexie and show a "Cached Record" banner.

REQ-BEN-002 · Priority: Medium · Status: Open
Add a "Complete Registration" flow on the beneficiary list for records with
registration_status = pending. A modal or inline form should let staff fill in
the remaining required fields without going through the full edit page.

REQ-BEN-003 · Priority: Low · Status: Open
Show a notification or badge on the beneficiary profile when a file number is
assigned for the first time (transition from pending → complete registration).
```

---

## 3. Service Entry

### Overview
Records rehabilitation services delivered to beneficiaries. Supports batch multi-service entry, offline saving, and displays in a full audit history. Beneficiaries can be linked before or after file number assignment.

### Key Data Fields

| Field | Type | Notes |
|---|---|---|
| file_number | string | Beneficiary reference (or UUID if no file number yet) |
| status | SCHEDULED / AVAILED | Required |
| schedule_date | date | Required |
| start_date / end_date | date | Required / conditional |
| location_code | MCB / CP / HG / NL / SN / SH / BASE | Required |
| service_code | GS / ASMT / PT-M / PT-E / PWC / PO / PP | Required |
| service_provider_code | string | Staff/provider name or code |
| total_hours | number | Required, > 0 |
| mode_of_service | ROW / CAMP / HOME / TELE | Required |
| custom_field2 | Initial Visit / Follow Up 1-4 | Visit sequence |
| remarks | string | Shift/session notes |

### Service Codes Reference

| Code | Name |
|---|---|
| GS | General Services |
| ASMT | Assessment |
| PT-M | Physiotherapy (Morning) |
| PT-E | Physiotherapy (Evening) |
| PWC | Powered Wheelchair |
| PO | Prosthetics & Orthotics |
| PP | Physiotherapy Plus |

### Implemented
- [x] New service entry form — searchable beneficiary select (by name or file number)
- [x] Service entry allowed for beneficiaries with or without file number assigned
- [x] Multi-service batch — add multiple service codes for the same date; each saves as a separate record
- [x] Duplicate service code prevention within the same batch
- [x] Offline saving — stores in Dexie, skips immediate sync if beneficiary is an offline token
- [x] Offline token detection (`OFF-...`) — delays sync until beneficiary is synced first
- [x] UUID fallback — if beneficiary has no file number, stores their Supabase UUID as reference
- [x] Validation — blocks save without beneficiary, checks date ordering, AVAILED requires end date
- [x] Edit existing service entry (Manager/Admin only, requires online)
- [x] Service History audit table — all 21 fields visible
- [x] Beneficiary name resolution in history — handles real file numbers, UUIDs, offline tokens, and legacy name-as-file_number
- [x] File number display — shows "Not Assigned" for unresolved tokens/UUIDs
- [x] Export to Excel (Admin/Manager/MIS)
- [x] Date range filter on history
- [x] Search by beneficiary name, file number, or service code
- [x] Delete service entry with confirmation (Admin/Manager only)
- [x] Sync status badges in history (Pending Sync / Synced / Sync Failed)
- [x] Real-time cross-device sync

### Known Issues
- [ ] When a file number is assigned to a beneficiary after service entry is saved, the service entry's stored reference (UUID) is not automatically updated to the real file number
- [ ] Service history has no offline cache — going offline shows only local pending/failed entries, not previously-synced history

### Pending / New Requirements
```
REQ-SVC-001 · Priority: High · Status: Open
Cache synced service entries in Dexie so that Service History is viewable
offline (not just pending/failed entries). Use sync_status = 'synced' as
the indicator; limit cache to last 90 days.

REQ-SVC-002 · Priority: Medium · Status: Open
When a beneficiary's file number is assigned after their service entry was saved
with a UUID reference, automatically update the service_entries.file_number
in both Dexie and Supabase to the real file number. This should run as part of
SyncService or on a beneficiary file-number import event.

REQ-SVC-003 · Priority: Low · Status: Open
Add a filter by service_code and location_code to the Service History table.
Currently only date range + text search are available.

REQ-SVC-004 · Priority: Low · Status: Open
Add a summary statistics row at the bottom of the Export Excel showing total
hours, total services, and unique beneficiary count for the filtered period.
```

---

## 4. Assessment Module

### Overview
Three-step clinical assessment wizard: Initial (demographics + condition) → Clinical (condition-specific parametric tests) → Follow-Up (session-by-session progression tracking). Fully offline-capable.

### Patient ID Format
- **Online:** `ROW-YYYYMMDD-0001` (sequential from server)
- **Offline:** `ROW-YYYYMMDD-O001` (local counter via Dexie metadata)

### Assessment Types & Conditions

| Assessment | Conditions Supported |
|---|---|
| Initial | All (single form) |
| Clinical | NMPC · Neurological · Pulmonary · Post-Op · Disability · Amputation · Early Intervention |
| Follow-Up | All (session-indexed) |

### Clinical Assessment Fields by Condition

| Condition | Key Parameters |
|---|---|
| NMPC | ROM (AAOS), MMT Strength, VAS Pain (pre/post), Category |
| Neurological | Neuro strength, Balance (Berg), Coordination test |
| Pulmonary | Cough, Symptoms, Dyspnea (mMRC 0–4) |
| Post-Op | Surgery type, Weight bearing, Functional mobility |
| Disability | FIM Locomotion (1–7), FIM Mobility (1–7) |
| Amputation | Level, Residual limb, Prosthesis status, K-Level (0–4) |
| Early Intervention | 12 developmental domains (head control, rolling, sitting, crawling, standing, walking, hand function, communication, social, self-care, attention, play) each with status + goal |

### Implemented
- [x] 3-step assessment wizard (Initial → Clinical → Follow-Up)
- [x] Patient ID auto-generation (online sequential + offline local counter)
- [x] Condition-based dynamic clinical form (7 paths)
- [x] Early Intervention — all 12 developmental domains with status and goal fields
- [x] Follow-up sessions indexed by session_number; linked to patient_id (FK)
- [x] Offline saving for all three assessment types in Dexie
- [x] Sync ordering: initial must sync before clinical; clinical before follow-ups
- [x] Conflict resolution: upsert on initial and clinical (onConflict: patient_id); insert + 23505 skip on follow-ups
- [x] Assessment history page — list all patients with count of clinical + follow-ups
- [x] Search by patient_id or name; date range filter
- [x] Full assessment view — baseline → clinical → follow-ups in chronological order
- [x] Outcome trend indicators (improved / declined / same) in view
- [x] Recommended exercises linked to clinical assessment
- [x] Edit assessment (Manager/Admin only)
- [x] Delete assessment with confirmation
- [x] Export assessment history to Excel
- [x] Sync status badges
- [x] Real-time cross-device sync

### Known Issues
- [ ] Assessment history page has no offline cache — shows blank if offline
- [ ] No validation to prevent creating a Follow-Up before Clinical is saved
- [ ] No way to view or print a single assessment as a PDF report
- [ ] Patient ID sequence for offline mode can conflict if multiple devices register patients offline on the same day (e.g., two devices both generate `ROW-20260512-O001`)

### Pending / New Requirements
```
REQ-ASMT-001 · Priority: High · Status: Open
Cache assessment history in Dexie (offline_initial_assessments with
sync_status = 'synced') so the history page is viewable offline.

REQ-ASMT-002 · Priority: Medium · Status: Open
Add a printable / PDF export for a single patient's complete assessment
(Initial + Clinical + all Follow-Ups) formatted for clinical records.

REQ-ASMT-003 · Priority: Medium · Status: Open
Prevent Follow-Up creation in the wizard if no Clinical Assessment exists
for the same patient_id. Show a clear error guiding the user to complete
the clinical step first.

REQ-ASMT-004 · Priority: Low · Status: Open
Resolve offline patient_id sequence conflict: when two devices generate
offline IDs on the same date, they both start from O001. Introduce a
device-specific prefix or random suffix to ensure uniqueness.
```

---

## 5. Trip Tracking

### Overview
Logs all bus trips including route, distance, fuel consumption, generator usage, and beneficiaries served. Supports camp schedule matching and fleet reporting.

### Key Data Fields

| Field | Type | Notes |
|---|---|---|
| date | date | Required |
| bus_number | string | Default: BUS ABB |
| driver / assistant | string | Staff names |
| odometer_start / end | number | km reading |
| distance_km | number | Calculated from odometer or standardDistance |
| departure_time / return_time | time | Auto-calculates duration |
| location | string | Matched to LOCATION_MASTER |
| beneficiaries_served | number | Head count |
| purpose | Screening / Follow-up / Maintenance / Emergency / Other | |
| fuel_liters / fuel_cost | number | For efficiency calculation |
| generator_start / end | number | kWh readings |
| notes | string | Stops, delays |

### Location Distance Reference

| Location Code | Name | Distance from Base (km) |
|---|---|---|
| MCB | Mandya Camp Base | ~84 |
| CP | Camp Place | ~120 |
| HG | Hoskote | ~145 |
| NL | Nelamangala | ~100 |
| SN | Srirangapatna | ~135 |
| SH | Shivamogga | ~170 |
| BASE | ROW Base Office | 0 |

### Implemented
- [x] Trip entry form with all fields
- [x] Distance auto-calculation from odometer; fallback to LOCATIONS standardDistance
- [x] Duration auto-calculation from departure/return times
- [x] Fuel efficiency calculation (km/litre)
- [x] Generator units used (end − start)
- [x] Trip history table — paginated, filterable by location/month/bus
- [x] Export to CSV
- [x] Edit/delete trips (if permitted)
- [x] Offline saving for trip entries
- [x] Map view of live trip locations (BusMap component)
- [x] Trip summary stats (total distance, fuel cost, beneficiaries served) with timeframe filter
- [x] Camp schedule matching — show completed vs missed vs upcoming

### Known Issues
- [ ] Google Maps API integration not fully verified — fallback to standardDistance fires silently
- [ ] Generator start/end readings collected but no aggregate report exists for generator consumption
- [ ] No validation that odometer_end ≥ odometer_start
- [ ] Distance shown as 0 if neither odometer nor standardDistance lookup succeeds

### Pending / New Requirements
```
REQ-TRIP-001 · Priority: Medium · Status: Open
Add odometer validation: block save if odometer_end < odometer_start
and show a clear error message.

REQ-TRIP-002 · Priority: Medium · Status: Open
Add a Generator Report section to the Reports page or Trip History showing
monthly units consumed per bus, aggregated from generator_start/end readings.

REQ-TRIP-003 · Priority: Low · Status: Open
Add a "Monthly Summary" view on the trip history page showing per-location
totals: number of trips, total distance, total beneficiaries served, total
fuel cost — exportable to Excel.
```

---

## 6. Token Management

### Overview
Daily token queue per centre — assigns a sequence number to each beneficiary visit, tracks status (Waiting / Completed / Skipped), and provides a day-view and month-calendar view.

### Key Data Fields

| Field | Type | Notes |
|---|---|---|
| beneficiary_name | string | Required |
| phone | string | For duplicate lookup |
| center | string | Centre name (Staff sees own centre only) |
| area | string | Beneficiary's area/locality |
| date / time | datetime | Auto-assigned |
| sequence_number | number | Auto-incremented per day per centre |
| status | Waiting / Completed / Skipped | Updated during the day |

### Implemented
- [x] Token creation — search existing beneficiary or create stub
- [x] Auto-assign sequence_number per day per centre
- [x] Duplicate phone detection → auto-link to existing beneficiary
- [x] Name-match candidates confirmation modal
- [x] Status update — mark Waiting / Completed / Skipped
- [x] Day view — table of all tokens for selected date/centre
- [x] Month view — calendar with event indicators per day
- [x] Role filter — Staff sees their assigned centre only; Admin can switch centre
- [x] Offline token generation (Dexie)

### Known Issues
- [ ] Batch print of daily token list is a placeholder — not implemented
- [ ] No end-of-day summary (total served, total skipped) visible without counting manually
- [ ] Centre assignment for Staff users is not managed in the UI — must be set in the database directly

### Pending / New Requirements
```
REQ-TOK-001 · Priority: High · Status: Open
Implement batch print / print preview for the daily token list. Should show
token number, beneficiary name, area, and time — formatted for an A4 or
thermal receipt print.

REQ-TOK-002 · Priority: Medium · Status: Open
Add an end-of-day summary panel on the Day view showing: total tokens issued,
total completed, total skipped, and total waiting.

REQ-TOK-003 · Priority: Low · Status: Open
Add a Staff → Centre mapping UI in the Admin panel so that admins can assign
a default centre to each Staff user without direct database access.
```

---

## 7. Reports & Outcomes

### Overview
Outcome evaluation module that compares baseline (clinical assessment) against latest follow-up for each patient, classifies outcomes (Improved / Declined / Same), and supports filtered export.

### Outcome Scales by Condition

| Condition | Scale | Type | Direction |
|---|---|---|---|
| NMPC | VAS Pain (pre/post) | Numeric | Lower = better |
| NMPC | ROM (AAOS) | Categorical | Higher = better |
| NMPC | MMT Strength | Categorical | Higher = better |
| Neurological | Balance (Berg) | Categorical | Higher = better |
| Neurological | Coordination | Categorical | Higher = better |
| Pulmonary | Dyspnea (mMRC) | Categorical | Lower = better |
| Disability | FIM Locomotion | Numeric (1–7) | Higher = better |
| Disability | FIM Mobility | Numeric (1–7) | Higher = better |
| Amputation | K-Level | Categorical | Higher = better |
| Early Intervention | 12 domains | Clinician-entered | Bucket map |

### Outcome Classifications

| Status | Meaning |
|---|---|
| Improved | Score moved in the better direction beyond threshold |
| Declined | Score moved in the worse direction |
| Same | Score unchanged or within threshold |
| Baseline Only | Clinical assessment exists but no follow-up yet |
| Needs Referral | Clinician flagged for referral |
| Not Evaluable | Insufficient data to classify |

### Implemented
- [x] Scale selection by condition
- [x] Query initial + clinical + latest follow-up per patient
- [x] Numeric scale comparison (VAS, FIM) with threshold
- [x] Categorical / ordinal comparison using scale order arrays
- [x] Clinician-entered outcome (EI domains) using bucket maps
- [x] Summary dashboard — count by outcome status
- [x] Search by patient name; filter by disability type and date range
- [x] Detailed table with baseline / current / status per patient
- [x] Export to Excel with full outcome details

### Known Issues
- [ ] Outcome report is online-only — no offline cache
- [ ] Early Intervention outcomes show all 12 domains but no consolidated "overall" status per patient
- [ ] No trend chart (e.g., line chart of VAS scores over sessions) for individual patients

### Pending / New Requirements
```
REQ-RPT-001 · Priority: Medium · Status: Open
Add an individual patient outcome trend chart on the Assessment View page
showing selected scale values (e.g., VAS) across all follow-up sessions
plotted as a line chart.

REQ-RPT-002 · Priority: Medium · Status: Open
Add a consolidated Early Intervention outcome per patient — a single status
(Improving / Needs Review / On Track) computed as the majority outcome across
the 12 EI domains.

REQ-RPT-003 · Priority: Low · Status: Open
Add a "Programme Summary Report" page that shows, for a given date range:
total unique beneficiaries served, services by code, total hours, and
average improvement rate — exportable as a one-page PDF for stakeholder
reporting.
```

---

## 8. Exercise Management

### Overview
Manages the exercise library used in clinical recommendations. Exercises are linked to conditions and can be recommended to patients with specific parameters (sets, reps, hold time).

### Key Data Fields

| Field | Type | Notes |
|---|---|---|
| name | string | Exercise name |
| heading | string | Short display heading |
| description | text | Full instructions |
| category | string | e.g., Strengthening, Stretching |
| condition | string | Linked condition |
| pdf_url | string | Supabase storage URL |
| thumbnail_url | string | Preview image |
| is_active | boolean | Show/hide in recommendations |

### Patient Exercise Parameters

| Field | Type |
|---|---|
| patient_id | FK → initial_assessment |
| exercise_id | FK → exercises |
| times | number |
| repetitions | number |
| sets | number |
| hold | number (seconds) |
| notes | string |

### Implemented
- [x] Exercise library CRUD (Admin/Manager)
- [x] PDF and thumbnail upload to Supabase storage (exercise-files bucket)
- [x] Filter by category, condition, and active status
- [x] Toggle exercise active/inactive
- [x] Link exercises to patient during clinical assessment
- [x] Assign parameters (times, reps, sets, hold, notes) per patient
- [x] Display recommended exercises on the Assessment View page

### Known Issues
- [ ] No patient-facing exercise view (e.g., a printable exercise sheet for the patient to take home)
- [ ] No bulk upload for exercises — must be added one at a time
- [ ] PDF viewer not embedded — links open in a new tab

### Pending / New Requirements
```
REQ-EX-001 · Priority: Medium · Status: Open
Add a printable patient exercise sheet — a formatted A4 page showing the
patient's name, recommended exercises with parameters, and thumbnails —
exportable as PDF.

REQ-EX-002 · Priority: Low · Status: Open
Add a bulk import for exercises via Excel (name, category, condition, description
columns) so the library can be populated quickly without one-by-one entry.
```

---

## 9. Calendar & Scheduling

### Overview
Monthly calendar view of camp schedules. Matches scheduled locations against recorded trips to track completion status, and allows manual status override.

### Event Statuses

| Status | Meaning | Colour |
|---|---|---|
| Scheduled | Future event — not yet happened | Blue |
| Completed | Trip recorded for matching date + location | Green |
| Missed | Past event — no trip recorded | Red |
| Cancelled | Manually marked cancelled | Grey |

### Implemented
- [x] Monthly grid calendar with event indicators
- [x] Events from `monthly_schedules` table (is_active = true)
- [x] Auto-match trips by date + location → Completed status
- [x] Past unmatched events auto-flag as Missed
- [x] Manual status override (mark Completed or Missed)
- [x] Navigate previous/next month
- [x] Filter by event status (show/hide)
- [x] Upcoming camps list (next 30 days) on Dashboard

### Known Issues
- [ ] Calendar is online-only — no offline view of upcoming schedules
- [ ] No recurring schedule support — each month must be uploaded separately
- [ ] No camp attendee / beneficiary count visible from the calendar

### Pending / New Requirements
```
REQ-CAL-001 · Priority: Medium · Status: Open
Cache the current and next month's schedule in Dexie so field staff can
see upcoming camp dates even when offline.

REQ-CAL-002 · Priority: Low · Status: Open
Show beneficiary count served per camp on the calendar event tooltip — pulled
from service_entries.schedule_date matching the camp date and location.
```

---

## 10. Sync & Offline Engine

### Overview
All data-entry modules write to Dexie (IndexedDB) first. A background SyncService pushes pending records to Supabase in dependency order when the device goes online.

### Sync Dependency Order
```
1. Beneficiaries        (must sync first — other tables reference file_number)
2. Service Entries      (depend on file_number from beneficiaries)
   Assessments         (depend on patient_id; runs in parallel with service entries)
     └─ Initial        (must succeed before clinical)
     └─ Clinical       (must succeed before follow-ups)
     └─ Follow-Ups     (synced in session_number order)
```

### Sync Status Lifecycle
```
pending → (sync attempt) → synced
                        → failed  (stored with error_message; retried on next sync)
```

### Implemented
- [x] Dexie write-first for beneficiaries, service entries, and all assessment types
- [x] SyncService with dependency-ordered execution (beneficiaries → services + assessments)
- [x] Beneficiary sync: on success, propagates real `file_number` to pending service entries in Dexie AND already-synced entries in Supabase
- [x] Offline token (`OFF-...`) detection — skips immediate sync for service entries linked to unsynced beneficiaries
- [x] Assessment sync: upsert for initial/clinical (idempotent); insert + duplicate skip (23505) for follow-ups
- [x] `useOnlineStatus` hook — triggers `syncPendingRecords()` automatically on reconnect
- [x] Sync Dashboard page — live counters (pending / synced / failed) per entity type
- [x] Manual sync button on Sync Dashboard
- [x] Failed records show error_message for debugging
- [x] `offline_id` UUID on service entries — used as Supabase deduplication key
- [x] Service History and Assessment History show offline entries (pending/failed) merged with server results

### Known Issues
- [ ] Synced service entries and assessments are not cached in Dexie — offline history shows only pending/failed
- [ ] No conflict resolution for edits made to the same record on two devices while offline
- [ ] No maximum Dexie storage limit or eviction policy
- [ ] Sync Dashboard counters do not auto-refresh — require page reload or manual sync button

### Pending / New Requirements
```
REQ-SYNC-001 · Priority: High · Status: Open
After a record syncs successfully (sync_status → 'synced'), cache it in Dexie
and retain it there for 90 days. This allows Service History and Assessment
History to be viewable offline. Add a Dexie version migration for this.

REQ-SYNC-002 · Priority: Medium · Status: Open
Add a last-sync timestamp display on the Sync Dashboard that updates
automatically after each successful sync run (not just on manual trigger).

REQ-SYNC-003 · Priority: Low · Status: Open
Add a Dexie storage usage indicator on the Sync Dashboard showing current
IndexedDB usage and a cleanup button to purge records older than 90 days
that are already synced.
```

---

## 11. Admin Control Panel

### Overview
Admin-only section for user management, role assignment, audit logging, and bulk schedule uploads.

### Implemented
- [x] Users tab — list all profiles with name, email, role, last login
- [x] Role assignment per user (Admin only; self-protection prevents role downgrade of own account)
- [x] Audit log tab — table of user actions with details and timestamps
- [x] Monthly schedule upload — Excel import to `monthly_schedules` table
- [x] Schedule history — view/manage uploaded schedules

### Known Issues
- [ ] Audit log coverage is sparse — not all create/edit/delete actions write to the log
- [ ] No user invite flow — new users must self-register then have an admin assign their role
- [ ] No bulk user import

### Pending / New Requirements
```
REQ-ADMIN-001 · Priority: High · Status: Open
Add an "Invite User" flow — admin enters email + role → system sends a
Supabase invite email → user sets password on first login. Removes the
need for self-registration followed by manual role assignment.

REQ-ADMIN-002 · Priority: Medium · Status: Open
Expand audit logging to cover all create, edit, and delete operations across
beneficiaries, service entries, and assessments. Each log entry should include:
user, action, entity type, entity id, and diff (before/after values).

REQ-ADMIN-003 · Priority: Low · Status: Open
Add a Staff → Centre assignment UI (table of staff users with an editable
centre dropdown) so admins can assign default centres without direct database
access. Resolves token management centre visibility for staff.
```

---

## 12. Settings

### Overview
User-level settings for profile view, password change, and data export preferences.

### Implemented
- [x] Profile tab — email, role, last login (read-only)
- [x] Security tab — password change via Supabase reset email
- [x] Data tab — export all data as JSON (permission-gated)
- [x] Notification toggles (email, reminders, reports) — stored in localStorage
- [x] Logout button

### Known Issues
- [ ] Notification toggles are localStorage-only — not synced to server; reset on new device
- [ ] No option to change display name or profile picture

### Pending / New Requirements
```
REQ-SET-001 · Priority: Low · Status: Open
Persist notification preferences to the user's profile row in Supabase so
they apply across devices/browsers instead of being localStorage-only.
```

---

## 13. Dashboard

### Overview
Landing page with KPI summary cards, trend charts, upcoming and missed camp indicators, and service delivery breakdowns.

### Implemented
- [x] KPI cards: Total beneficiaries, Active buses, Camps conducted, Services provided
- [x] Beneficiary registration trend chart (daily / monthly / yearly / all)
- [x] Service delivery by location chart
- [x] Assessment vs Reassessment count chart
- [x] Upcoming camps (next 3 from `monthly_schedules`)
- [x] Missed camps count (past schedules without matching trips)
- [x] Timeframe filter: Daily / Monthly / Yearly / All with date range selector
- [x] Real-time data via Supabase queries

### Known Issues
- [ ] Dashboard is fully online-only — shows empty/loading state when offline
- [ ] No drill-down from KPI cards to filtered list views

### Pending / New Requirements
```
REQ-DASH-001 · Priority: Medium · Status: Open
Make KPI cards clickable — clicking "Services Provided" should open Service
History pre-filtered for the selected timeframe; "Total Beneficiaries" should
open the beneficiary list; etc.

REQ-DASH-002 · Priority: Low · Status: Open
Add a cached offline summary on the Dashboard — last-known KPI values stored
in Dexie metadata, shown with a "Last updated: X hours ago" banner when offline.
```

---

## 14. Data Masters & Configuration

### Overview
Hardcoded master lists used in dropdown fields across the application.

### Current Masters

**Service Codes (SERVICE_MASTER)**
```
GS   — General Services
ASMT — Assessment
PT-M — Physiotherapy (Morning)
PT-E — Physiotherapy (Evening)
PWC  — Powered Wheelchair
PO   — Prosthetics & Orthotics
PP   — Physiotherapy Plus
```

**Locations (LOCATION_MASTER)**
```
MCB  — Mandya Camp Base
CP   — Camp Place
HG   — Hoskote
NL   — Nelamangala
SN   — Srirangapatna
SH   — Shivamogga
BASE — ROW Base Office
```

**Mode of Service**
```
ROW   — Rehab on Wheels (bus visit)
CAMP  — Camp
HOME  — Home Visit
TELE  — Tele-rehabilitation
```

**Disability Types** (assessment)
```
Locomotor · Neurological · Post-stroke · Cerebral Palsy
Spinal Cord Injury · Amputation · Multiple Disability
```

**Economic Status:** BPL · APL

**Beneficiary Types:** Direct · Referral · Camp · Follow-up

### Known Issues
- [ ] All masters are hardcoded in TypeScript files — adding a new service code or location requires a code change and redeployment
- [ ] No multi-program support — program name "Rehab on Wheels" is hardcoded

### Pending / New Requirements
```
REQ-MASTER-001 · Priority: High · Status: Open
Move SERVICE_MASTER and LOCATION_MASTER to database tables (e.g., service_codes,
locations) with an admin UI to add/edit/deactivate entries. This removes the
need for redeployment when a new service type or location is added.

REQ-MASTER-002 · Priority: Low · Status: Open
Add multi-program support — allow a program field with configurable values
(e.g., Rehab on Wheels, Community Rehab, School Programme) so the app can
be used across different APD programmes without code changes.
```

---

## 15. New Requirements Backlog

_Use this section to log new requirements that don't fit an existing module yet, or cross-cutting concerns._

```
REQ-NEW-001 · Priority: Medium · Status: Open
Beneficiary Photo — allow staff to capture or upload a photo during
registration and display it on the beneficiary profile page.

REQ-NEW-002 · Priority: Medium · Status: Open
SMS / WhatsApp notification to beneficiary — when a service is scheduled
(status = SCHEDULED), automatically send a reminder message with date,
time, and location via a messaging API (e.g., Twilio or WhatsApp Business).

REQ-NEW-003 · Priority: Low · Status: Open
Multi-language support — add a language selector (English / Kannada / Hindi)
for field staff who are more comfortable in regional languages. Priority fields:
form labels, dropdown options, and error messages.

REQ-NEW-004 · Priority: Low · Status: Open
Mobile app packaging — wrap the PWA in a Capacitor or React Native WebView
shell and publish to Google Play Store so field staff can install it as a
native Android app with better offline storage limits.
```

---

## Revision History

| Version | Date | Author | Changes |
|---|---|---|---|
| 1.0 | 2026-05-12 | Shaik Azeem | Initial document — full codebase review |

---

_To add a new requirement: pick the right module section, copy the `REQ-[MODULE]-[NNN]` block format, increment the number, set Priority and Status, and describe what needs to be built._
