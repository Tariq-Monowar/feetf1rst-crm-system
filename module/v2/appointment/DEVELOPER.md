# Appointment Module — Developer Documentation

Developer guide for the **Appointment** module (`module/v2/appointment/`): API, auth, validation, and conventions.

---

## Overview

The appointment module handles:

- **CRUD** for appointments (create, read, update, delete)
- **Multi-employee** assignments via `AppointmentEmployee` (many-to-many)
- **Overlap checks** per employee (time/duration)
- **Available time slots** for an employee on a given date
- **Calendar/date queries**: by date range, specific dates, or distinct dates in a year/month
- **Customer history** and **notifications** when creating client-linked appointments

---

## Module Structure

```
module/v2/appointment/
├── appointment.routes.ts      # Express routes + auth
├── appointment.controllers.ts # Business logic, Prisma, validation
├── DEVELOPER.md               # This file
└── DATA_FLOW.md               # Data flow & entity relations
```

---

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/` | PARTNER, ADMIN, EMPLOYEE | Create appointment |
| `GET` | `/` | PARTNER, ADMIN, EMPLOYEE | List all appointments |
| `GET` | `/:id` | PARTNER, ADMIN, EMPLOYEE | Get appointment by ID |
| `PUT` | `/:id` | PARTNER, ADMIN, EMPLOYEE | Update appointment |
| `DELETE` | `/:id` | PARTNER, ADMIN, EMPLOYEE | Delete appointment |
| `GET` | `/my` | PARTNER, ADMIN, EMPLOYEE | Paginated list for current user |
| `GET` | `/by-date` | PARTNER, ADMIN, EMPLOYEE | Appointments by date range or specific dates |
| `GET` | `/all-appointments-date` | PARTNER, ADMIN, EMPLOYEE | Distinct dates with appointments (year/month) |
| `GET` | `/available-slots` | PARTNER, ADMIN, EMPLOYEE | Available time slots for employee + date |
| `GET` | `/system-appointment/:customerId/:appointmentId` | Public | Get appointment for customer (e.g. client portal) |

Auth is enforced via `verifyUser("PARTNER", "ADMIN", "EMPLOYEE")` from `middleware/verifyUsers`.  
`getSystemAppointment` is **unauthenticated** (used for customer-facing links).

---

## Request/Response Conventions

- **Success**: `{ success: true, ... }` with `appointment` or `appointments` / `data` as needed.
- **Error**: `{ success: false, message: string, error?: string }`.
- **Validation**: 400 with message; **conflict** (overlap): 409; **not found**: 404; **server**: 500.

---

## Create Appointment

**Body (single employee, legacy):**

- `customer_name`, `time`, `date`, `reason` — required
- `assignedTo` (string), `employeId` — single employee
- `duration` (default 1), `details`, `isClient`, `customerId`, `reminder` — optional

**Body (multi-employee, preferred):**

- `assignedTo` as **array**: `[{ employeId, assignedTo }, ...]`
- Or `employe` array with same shape
- Duplicates by `employeId` are stripped

**Validation:**

- Date must be valid.
- Duration &gt; 0.
- All `employeId`s must exist in `Employees`.
- Overlap check runs for each employee (time + date + duration); 409 if overlap.

**Side effects:**

- If `isClient && customerId`: creates `CustomerHistorie` (category `"Termin"`) and `notificationSend(..., "Appointment_Created", ...)`.

---

## Update Appointment

- Same body shape as create (single or multi-employee).
- Missing fields fall back to existing appointment.
- Overlap check excludes current appointment ID.
- Multi-employee: existing `AppointmentEmployee` rows are replaced (deleteMany + create).

---

## Get by Date / Calendar

- **`/by-date`**:  
  - Query: `startDate`, `endDate` **or** `dates` (comma-separated), optional `employee` (comma-separated IDs), `limit`, `cursor`.  
  - Requires either date filter or at least one employee ID.  
  - Returns paginated list; `assignedTo` is formatted via `formatAppointmentResponse`.

- **`/all-appointments-date`**:  
  - Query: `year`, optional `month`, optional `employee` (comma-separated).  
  - Returns `{ dates: string[] }` — distinct dates (ISO date strings) in range that have appointments for the user (and optional employee filter).

---

## Available Time Slots

- **Query**: `employeId`, `date` (required).
- **Logic**: Working window 08:00–18:00, 30-minute slots; excludes slots that overlap existing appointments (using `duration`).
- **Response**: `availableSlots`, `existingAppointments`.

---

## Helpers (controllers)

- **`formatAppointmentResponse(appointment)`**  
  Maps `appointmentEmployees` to an array `[{ employeId, assignedTo }, ...]`, sets top-level `assignedTo` to that array (or legacy string), and removes `appointmentEmployees` and redundant `employeId` from the payload.

- **`checkAppointmentOverlap(employeeId, date, time, duration, excludeAppointmentId?)`**  
  Returns `{ hasOverlap, conflictingAppointment?, message? }`. Used for create and update.

---

## Database

- **Tables**: `appointment`, `appointment_employee` (see Prisma schema and `DATA_FLOW.md`).
- **Relations**: `appointment.userId` → `User`; `AppointmentEmployee` links `appointment` ↔ `Employees`.
- **Cascades**: Delete appointment → delete related `AppointmentEmployee`; delete user → delete their appointments.

---

## Testing & Extending

- Add or change routes in `appointment.routes.ts` and keep auth consistent.
- Keep overlap and slot logic in controllers (or extract to a service if it grows).
- When adding new response fields, consider updating `formatAppointmentResponse` so list/detail responses stay consistent.

For entity relations and request → DB → response flow, see **DATA_FLOW.md**.
