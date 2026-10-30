# Rangrez 3.0 — QR Pass & Entry Gate System

**A great celebration starts with a warm welcome.**  
Rangrez 3.0 brings student registration, digital QR passes, volunteer pass delivery, and gate check-in together in one workflow—so every guest can spend less time waiting and more time enjoying the occasion. 💛

This project has two parts that work together:

1. **`qr-import/`** prepares attendee records, creates one-time QR passes, and helps volunteers send those passes through WhatsApp.
2. **`gate-app/`** is the event-day mobile app used to scan passes, check in attendees, register walk-ins, and monitor arrivals.

## How the parts fit together

```text
Registration spreadsheet
          |
          v
qr-import/import.mjs
   |                  |
   |                  +--> QR image files in qr-import/qr/
   |                  +--> Private token record in qr-import/tokens.csv
   v
Supabase: students + hashed tickets
   |                              |
   |                              +--> gate-app checks passes and records entries
   v
qr-import/build-sender.mjs
   |
   +--> Volunteer-specific sender pages in qr-import/site/
   +--> Volunteer assignment links in qr-import/volunteers.txt
                  |
                  v
        Student opens their pass
        and shows its QR at the gate
```

The importer creates a random ticket token for each eligible student. Supabase stores the token's SHA-256 hash—not the original token. The original token is used to make the QR image and pass link, then presented by the gate app for backend validation. The backend should allow a ticket only once and reject repeat scans.

## Project layout

| Path | What it is |
| --- | --- |
| `qr-import/` | Spreadsheet import, ticket and QR generation, and volunteer pass-delivery tools |
| `qr-import/import.mjs` | Cleans spreadsheet rows, upserts students, creates tickets, and generates QR images |
| `qr-import/build-sender.mjs` | Splits pass recipients among volunteers and builds sender pages |
| `qr-import/pass.html` | Student-facing pass page; creates the displayed QR from the pass token |
| `qr-import/sender-template.html` | Volunteer page with recipient search and WhatsApp message links |
| `qr-import/qr/` | Generated QR image files, named by student UID |
| `qr-import/tokens.csv` | Sensitive mapping of students to their original ticket tokens |
| `qr-import/site/` | Generated static pages for pass viewing and volunteer sending |
| `qr-import/volunteers.txt` | Volunteer-specific sender links; treat as private |
| `gate-app/` | Expo / React Native event-day gate app |
| `gate-app/App.js` | Gate screens, QR scanning, roster search, walk-ins, and stats |
| `gate-app/config.js` | Gate app's Supabase URL, public key, and app key configuration |

Generated pass files, token lists, volunteer links, attendee spreadsheets, and credentials contain private information. Do not publish or commit them to a public repository.

## 1. Prepare the attendee data and create passes

### Requirements

- Node.js and npm
- A Supabase project configured with the required `students` and `tickets` tables
- A registration workbook with columns matching the importer's expected headers:
  `UID`, `Full Name`, `Email Address`, `Mobile Number`, `Course/Branch`, `Semester`, `Hostel`, and `Room No.`

The importer trims header whitespace and normalizes student details. It skips rows without a UID or name, skips duplicate UIDs within the spreadsheet, and reports invalid mobile numbers. A phone number must resolve to 10 digits for WhatsApp delivery.

### Install dependencies

```powershell
cd qr-import
npm install
```

### Configure the private Supabase credentials

Create a `qr-import/.env` file containing the following values for your own project:

```dotenv
SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
SUPABASE_SERVICE_KEY=YOUR_PRIVATE_SERVICE_ROLE_KEY
```

The importer and sender builder use the service-role key to write/read event data. **Keep this key secret:** never place it in the gate app, a generated website, a volunteer message, or source control. Use a private local `.env` file and restrict access to it.

The repository does not include the database schema or SQL functions. Configure the Supabase tables, policies, and gate RPC functions for your project before importing or running the gate app.

### Run a dry check, then import

From `qr-import/`, first check the spreadsheet without writing to Supabase:

```powershell
node import.mjs "registration-responses.xlsx" --dry
```

Review the row warnings and counts. Then run the real import:

```powershell
node import.mjs "registration-responses.xlsx"
```

You can also import another workbook with a source label:

```powershell
node import.mjs "additional-students.xlsx" --source=offline
```

The script upserts students by UID. It creates a ticket and QR only when that student does not already have a ticket, so rerunning the import does not intentionally regenerate an existing pass. New QR files are written to `qr-import/qr/`, and their original tokens are appended to `qr-import/tokens.csv`.

**Protect `tokens.csv`.** It contains the original pass tokens, which can be used to present entry passes. Keep it private, share it only with trusted operators who need it, and do not upload it as a public download. The database hash cannot be used to recover the original tokens if this file is lost.

## 2. Create volunteer sender pages

After importing, run this from `qr-import/`:

```powershell
node build-sender.mjs --volunteers=22
```

Choose the number of volunteers needed; if omitted, the script uses 10. The builder:

1. Reads `tokens.csv` and checks student UIDs against Supabase.
2. Omits token entries whose student no longer exists in Supabase.
3. Sorts the remaining recipients by name and divides them among volunteers.
4. Creates a volunteer-specific sender page for each group in `qr-import/site/`.
5. Creates `qr-import/site/index.html` for the student pass page and writes private assignment links to `qr-import/volunteers.txt`.

The sender pages allow a volunteer to search their assigned students and open a pre-filled WhatsApp message containing that student's pass link. The page marks a message as sent in that browser's local storage when the WhatsApp link is opened; this is a local reminder, not confirmation that the message was delivered.

The builder recreates the `site/` output folder each time it runs. If you need to preserve an earlier generated site, back it up before rebuilding.

### Publish and send passes

1. Upload the generated `qr-import/site/` folder to a private or access-controlled static hosting destination.
2. Replace `<SITE-LINK>` in `qr-import/volunteers.txt` with the deployed site URL.
3. Give each volunteer only their own sender link.
4. Ask volunteers to open their page from the hosted URL, search for a student, and use the WhatsApp button.
5. The student opens the received pass link and presents the QR code at the event gate.

The pass URL includes a bearer token in its URL fragment. Treat both student pass links and volunteer sender links as private: anyone with a pass link may be able to display that pass. Do not post the pages publicly or forward links to people who do not need them. The generated site sets no-index-related headers, but that is not access control.

## 3. Check students in at the event

See the detailed mobile-app guide in [`gate-app/README.md`](./gate-app/README.md).

Quick overview:

- Configure `gate-app/config.js` with the Supabase project URL, a **public/anon or publishable key**, and the app key expected by your backend.
- Install and start the Expo app from `gate-app/`.
- Use **Scan** to scan a QR. The gate app accepts QR strings with the `DN26.` prefix and asks Supabase to validate the ticket and record entry.
- Use **Entries** to search the roster or record manual entry.
- Use **Walk-in** to register and admit a new attendee.
- Use the **Home** dashboard and admin dashboard to monitor arrivals.

The gate app refreshes the roster and dashboard data periodically. A cached roster can be shown offline, but QR verification, check-ins, walk-in registration, and live statistics require connectivity to Supabase.

**Never put the service-role key in `gate-app/config.js`.** A key bundled into a mobile app can be extracted. The mobile app must use only a public/anon or publishable key, with authorization and ticket validation enforced by the backend.

## Important operational checks

- Confirm the Supabase project, tables, RPC functions, and app/admin keys before event day.
- Run the importer with `--dry` and review warnings before writing registration data.
- Verify that the imported roster and ticket counts look right in Supabase.
- Test one pass from delivery through scanning, including a repeat scan that should be rejected.
- Confirm camera permission and reliable internet at the entrance.
- Keep backups of the workbook and private token records in an approved secure location.
- Avoid printing, posting, or committing student personal data, tokens, private sender links, or credentials.

## A thank-you

To every volunteer welcoming students, every person helping prepare the passes, and everyone bringing Rangrez to life: thank you. The technology helps the entry move smoothly, but it is your care and energy that make each guest feel welcome. Here’s to a joyful night, memorable dances, and a celebration we create together. 💛🪘
