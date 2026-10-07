# HYGIENE 360
## Enterprise Housekeeping, Toilet Hygiene & Inspection Management System

**Hygiene 360** is a production-ready enterprise web application engineered for manufacturing plants to monitor and audit toilet cleanliness, housekeeping compliance, live camera evidence, supervisor inspections, issue lifecycles, drinking water points, and management analytics.

---

## 🚀 Key Highlights & Enterprise Architecture

1. **Facility Hierarchy (Configurable & Dynamic)**:
   - `Plant` → `Building` → `Floor` → `Area` → `Toilet`
   - Configured with Bhiwadi Plant (**16 toilets** across Main Building, Production Block B, and Logistics Block), plus Supa and Noida plants.
   - Built to support unlimited plants and configurable toilets with zero hardcoding.

2. **Role-Based Access Control (RBAC)**:
   - **Super Admin**: Multi-plant control, facilities, QR placards, users, shifts, audit trails.
   - **Plant Admin**: Plant-level administration and reports.
   - **Housekeeping Agent**: Mobile-first portal, QR scan, 3-section checklist, live camera evidence capture, instant status updates.
   - **Supervisor / Incharge**: Scans the **same QR** to open the Inspection Console, reviews latest agent evidence, logs audit score or raises housekeeping issues (`H360-ISS-XXXXXX`), and verifies resolved tickets.
   - **Management**: Read-only executive operations dashboard tracking KPIs, trends, exceptions, recurring problem detection, and day-wise achievement matrix.

3. **QR System & Security Architecture**:
   - Every toilet is assigned a unique random opaque token (`H360-QR-XXXXXXXX`).
   - Third-party scanners (like Google Lens) see only an opaque token requiring authenticated application access.
   - **Role-based QR behavior**:
     - Housekeeping Agent scan → Cleaning Checklist Form.
     - Supervisor scan → Inspection Summary & Deficiency Ticket Form.

4. **Live Evidence & Anti-Fraud Security**:
   - **Mandatory Live Camera**: Direct `getUserMedia` hardware video stream capture to canvas. Gallery file uploads are strictly blocked.
   - **Tamper-Evident Watermark**: Server dynamically stamps plant name, toilet code, server timestamp (`DD-MM-YYYY | HH:mm A`), session ID (`H360-YYYYMMDD-XXXXX`), and SHA-256 hash.
   - **Check-Sheet Date Protection**: Detects date written on the physical check-sheet. If date != today's server date, submission is rejected: *"Today's check-sheet is required. The submitted check-sheet date does not match today's date."*
   - **Duplicate Evidence Protection**: Calculates cryptographic SHA-256 hash of evidence images and rejects previously submitted images.

5. **Issue Lifecycle & Automatic Agent Notification**:
   - Lifecycle: `OPEN` → `ASSIGNED` → `IN PROGRESS` → `RESOLVED` → `VERIFIED` → `CLOSED`.
   - Supervisor issue creation automatically alerts the assigned housekeeping agent in-app.
   - Agent submits resolution remarks & photo; Supervisor verifies on-site to close the ticket.

6. **Drinking Water Module**:
   - Dedicated 7-point hygiene checklist (Water available, Dispenser clean, RO functioning, leakage check, etc.) with live evidence photo.

7. **Recurring Issue Detection Engine**:
   - Analyzes repeat failures over 30 days (e.g. Toilet-07 Floor issue 5x, Flush issue 3x) to alert management for permanent root-cause corrective action.

8. **Immutable Audit Trail**:
   - Cryptographically logs every login, QR scan, cleaning initiation, photo capture, rejection, supervisor inspection, and ticket change with timestamp, role, record ID, and IP address.

---

## 👥 Demo Accounts (One-Click Quick Login or Standard Login)

| Role | Employee ID | Email | Password | Scope |
| :--- | :--- | :--- | :--- | :--- |
| **Super Admin** | `EMP-001` | `admin@hygiene360.com` | `admin123` | Universal Multi-Plant |
| **Plant Admin** | `EMP-002` | `bhiwadi.admin@hygiene360.com` | `admin123` | Bhiwadi Plant |
| **Supervisor** | `SUP-101` | `ramesh.sup@hygiene360.com` | `super123` | Bhiwadi Plant |
| **Housekeeping Agent** | `HK-201` | `sunil.agent@hygiene360.com` | `agent123` | Bhiwadi Plant |
| **Management** | `MGT-501` | `management@hygiene360.com` | `mgmt123` | Executive Analytics |

> *A Persona Quick-Switcher dropdown is also provided in the top header for instant one-click switching during evaluation.*

---

## 🛠️ Running the Application

### 1. Initialize & Seed Database
```bash
node server/seed.js
```

### 2. Build Frontend
```bash
npm run build
```

### 3. Start Production Server
```bash
npm start
```
The server will be available at: **`http://localhost:5000`**

### 4. Run Automated End-to-End Test Suite
```bash
node test/run-test.js
```

---

## 📋 End-to-End Acceptance Test Scenario

1. **Housekeeping Agent Journey**:
   - Login as `sunil.agent@hygiene360.com` (`agent123`) or click **Sunil Verma (Agent)** on the login screen.
   - Click **"Scan Toilet QR"** or select **Toilet 07 (Pending)**.
   - 3-Section Checklist opens: Complete Cleanliness, Consumables, and Equipment items (PASS / FAIL).
   - Test gallery upload attempt: System blocks gallery uploads for official cleaning evidence.
   - Capture Photo 1 (Cleaning Evidence) and Photo 2 (Toilet Condition) with the live camera.
   - Capture Photo 3 (Physical Check-Sheet): Test the date validation switch (selecting an old date like `25-09-2026` triggers date rejection; selecting today's date passes).
   - Click **"Submit Verified Cleaning Checklist"**: Confetti triggers, session is saved, Toilet-07 status becomes **CLEANED**, and compliance updates dynamically.

2. **Supervisor Inspection Journey**:
   - Switch persona to **Ramesh Kumar (Supervisor)**.
   - Scan the **SAME Toilet 07 QR**.
   - Notice the system displays the **Supervisor Inspection Console** (not the agent form).
   - Review agent's score, completion time, and watermarked evidence photos.
   - Click **"Raise Housekeeping Issue"**: Select category `WC not clean`, enter remarks, take deficiency photo, and submit.
   - Ticket `H360-ISS-XXXXXX` is generated, and an automated alert is dispatched to the housekeeping agent.

3. **Issue Resolution & Verification**:
   - Agent views assigned issue in the Housekeeping Portal, adds resolution remarks, and marks **RESOLVED**.
   - Supervisor inspects on-site, adds verification remarks, and marks **CLOSED**.

4. **Executive Management Journey**:
   - Switch persona to **VP Operations (Management)**.
   - View live KPIs: Total Toilets (16), Cleaned Today, Compliance %, Pending, Open Issues, Resolved Issues.
   - Review **7-Day Trend Chart**, **Toilet Performance Matrix**, and the **Recurring Problem Detection Banner** flagging Toilet-07's historical failures.
   - View the **Day-Wise Achievement Table** and export to CSV or Print PDF.
