# Migration Commands Reference

## Available Migration Commands

### 1. `npm run migrate:rename-transitions`
**Purpose**: Renames database table from `maßschuhe_transitions` to `admin_order_transitions`

**When to use**: 
- After updating schema.prisma to rename `maßschuhe_transitions` model to `admin_order_transitions`
- Before running `npx prisma generate`

**Usage**:
```bash
npm run migrate:rename-transitions
```

---

### 2. `npm run migrate:diagnosis-status`
**Purpose**: Converts `diagnosis_status` column from single enum to enum array

**When to use**: 
- For migrating diagnosis status fields in Versorgungen, customerProduct, and customer_versorgungen tables

**Usage**:
```bash
npm run migrate:diagnosis-status
```

---

## Quick Reference

| Command | What it does |
|---------|-------------|
| `npm run migrate:rename-transitions` | ✅ **Use this** to rename transitions table |
| `npm run migrate:diagnosis-status` | Different migration (not related) |
