# Appointment Module — Data Flow

How data flows through the appointment module: entities, relations, and request → database → response.

---

## Entity Overview

### 1. `appointment` (table: `appointment`)

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `customer_name` | String | Customer display name |
| `time` | String | Time (e.g. `"14:30"` or `"2:30 PM"`) |
| `date` | DateTime | Appointment date |
| `reason` | String | Reason for appointment |
| `assignedTo` | String | Employee name(s); comma-separated when multiple |
| `employeId` | String? | **Legacy** first/primary employee ID (kept for compatibility) |
| `duration` | Float? | Duration in hours (default 1) |
| `details` | String? | Optional notes |
| `isClient` | Boolean? | Whether linked to a CRM customer |
| `userId` | String | Owner/creator → `User.id` |
| `customerId` | String? | Optional link to `Customers.id` |
| `reminder` | Int? | Reminder (e.g. minutes before); default 0 |
| `reminderSent` | Boolean | Whether reminder was sent |
| `createdAt` | DateTime | Created at |

**Relations:**

- `user` → `User` (owner)
- `appointmentEmployees` → `AppointmentEmployee[]` (many-to-many with employees)

---

### 2. `AppointmentEmployee` (table: `appointment_employee`)

Junction table: one row per employee assigned to an appointment.

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `appointmentId` | String | → `appointment.id` |
| `employeeId` | String | → `Employees.id` |
| `assignedTo` | String | Employee name for this appointment |
| `createdAt` | DateTime | Created at |

**Constraints:**

- `@@unique([appointmentId, employeeId])` — same employee cannot be assigned twice to the same appointment.
- Indexes on `appointmentId` and `employeeId` for queries.

**Relations:**

- `appointment` → `appointment`
- `employee` → `Employees`

---

## Data Flow Diagrams

### Create appointment (single or multiple employees)

```
Client Request (POST /)
  │
  ├─ Body: customer_name, time, date, reason, [assignedTo | employeId] or assignedTo[]
  │
  ▼
Controller: createAppointment
  │
  ├─ Normalize employees: assignedTo[] or employe[] → dedupe by employeId
  ├─ Validate: required fields, date, duration > 0
  ├─ Validate: all employeId exist in Employees
  ├─ For each employee: checkAppointmentOverlap(employeId, date, time, duration)
  │     └─ 409 if overlap
  ├─ Build appointment payload (assignedTo = names joined; employeId = first for legacy)
  │
  ▼
Prisma: appointment.create
  │  data: { ...appointmentData, appointmentEmployees: { create: [...] } }
  │  include: appointmentEmployees { include: employee { select: id, employeeName, email } }
  │
  ├─ DB: INSERT appointment, INSERT appointment_employee (per employee)
  │
  ├─ If isClient && customerId: CustomerHistorie.create (Termin), notificationSend(Appointment_Created)
  │
  ▼
formatAppointmentResponse(appointment)
  │  assignedTo → [{ employeId, assignedTo }, ...]; drop appointmentEmployees, employeId
  │
  ▼
Response: 201 { success: true, appointment }
```

### Update appointment

```
Client Request (PUT /:id)
  │
  ▼
Controller: updateAppointment
  │
  ├─ Load existing appointment + appointmentEmployees
  ├─ Normalize employees (assignedTo[] / employe[]), dedupe
  ├─ Merge with existing (time, date, duration, employeId, etc.)
  ├─ Validate date, duration, employee existence
  ├─ checkAppointmentOverlap(..., excludeAppointmentId = id) per employee
  │
  ▼
Prisma: appointment.update
  │  data: { ...updateData, appointmentEmployees: { deleteMany: {}, create: [...] } }
  │
  ├─ DB: UPDATE appointment; DELETE appointment_employee for this appointment; INSERT new rows
  │
  ▼
formatAppointmentResponse(updatedAppointment) → Response: 200 { success: true, appointment }
```

### Read flows

- **GET /**  
  `prisma.appointment.findMany` + `include` user + appointmentEmployees.employee → `formatAppointmentResponse` on each → list.

- **GET /:id**  
  `prisma.appointment.findUnique` + same includes → `formatAppointmentResponse` → single appointment.

- **GET /my**  
  Filter `userId: id`, paginate, search (customer_name, details, reason, assignedTo, time) → same include + format → `data` + `pagination`.

- **GET /by-date**  
  Filter by `userId`, optional date range or `dates[]`, optional `employee` IDs (via `appointmentEmployees.some.employeeId`), cursor pagination → same include + format → `data` + `pagination`.

- **GET /all-appointments-date**  
  Raw SQL (or equivalent) for distinct `date` in year/month for user (and optional employee filter) → `{ dates: string[] }`.

- **GET /system-appointment/:customerId/:appointmentId**  
  `findFirst` where `id = appointmentId` and `customerId = customerId` + includes → `formatAppointmentResponse` (no auth).

- **GET /available-slots**  
  Query params `employeId`, `date` → find appointments for that employee on that date → compute 30-min slots 08:00–18:00, exclude overlapping → `{ availableSlots, existingAppointments }`.

---

## Response Shape (API)

After `formatAppointmentResponse`, an appointment looks like:

```json
{
  "id": "uuid",
  "customer_name": "...",
  "time": "14:30",
  "date": "2025-03-15T00:00:00.000Z",
  "reason": "...",
  "assignedTo": [
    { "employeId": "uuid", "assignedTo": "Employee Name" }
  ],
  "duration": 1,
  "details": null,
  "userId": "uuid",
  "customerId": null,
  "reminder": 0,
  "reminderSent": false,
  "createdAt": "...",
  "user": { "name": "...", "email": "..." }
}
```

For legacy single-employee payloads, `assignedTo` can still be a string; the API normalizes to the array form when `appointmentEmployees` exists.

---

## Dependencies

- **Prisma**: `appointment`, `AppointmentEmployee`, `User`, `Employees`, `Customers`, `CustomerHistorie`.
- **Middleware**: `verifyUser("PARTNER", "ADMIN", "EMPLOYEE")` (except system-appointment).
- **Utils**: `notificationSend` for in-app notifications on create.

For full API and validation details, see **DEVELOPER.md**.
