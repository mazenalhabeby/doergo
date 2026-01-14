# DOERGO Design System

> Design tokens and guidelines extracted from Figma designs.
> Last Updated: 2026-01-14

---

## Quick Start

### 1. Import Tailwind Preset

```typescript
// tailwind.config.ts
import doergoPreset from '@doergo/shared/design/tailwind-preset';

export default {
  presets: [doergoPreset],
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  // ... your config
}
```

### 2. Import Global CSS

```css
/* app/globals.css */
@import '@doergo/shared/design/globals.css';
```

### 3. Use Design Tokens

```typescript
import { colors, typography, statusBadgeVariants } from '@doergo/shared';
```

---

## Color Palette

### Brand Colors

| Name | Hex | Tailwind | Usage |
|------|-----|----------|-------|
| Primary | `#2563EB` | `brand-600` | Buttons, links, active states |
| Primary Hover | `#1D4ED8` | `brand-700` | Hover states |
| Primary Light | `#DBEAFE` | `brand-100` | Backgrounds |
| Accent | `#F97316` | `accent-500` | Logo, urgent indicators |

### Status Colors

| Status | Color | Light BG | Usage |
|--------|-------|----------|-------|
| Completed | `#22C55E` | `#DCFCE7` | Success states, completed tasks |
| In Progress | `#3B82F6` | `#DBEAFE` | Active/ongoing states |
| Pending | `#EAB308` | `#FEF9C3` | Waiting states |
| Scheduled | `#F97316` | `#FFEDD5` | Scheduled items |
| Error/Declined | `#EF4444` | `#FEE2E2` | Errors, declined items |
| Blocked | `#6B7280` | `#F3F4F6` | Blocked/unavailable |
| On Vacation | `#8B5CF6` | `#EDE9FE` | Away status |

### Text Colors

| Name | Hex | Tailwind | Usage |
|------|-----|----------|-------|
| Primary | `#1E293B` | `slate-800` | Headings, body text |
| Secondary | `#64748B` | `slate-500` | Muted text, labels |
| Tertiary | `#94A3B8` | `slate-400` | Placeholders |

### Background Colors

| Name | Hex | Tailwind | Usage |
|------|-----|----------|-------|
| White | `#FFFFFF` | `white` | Cards, modals |
| Background | `#F8FAFC` | `slate-50` | Page background |
| Border | `#E2E8F0` | `slate-200` | Borders |

---

## Typography

### Font Family

```css
font-family: 'Inter', system-ui, -apple-system, sans-serif;
```

### Font Sizes

| Name | Size | Line Height | Usage |
|------|------|-------------|-------|
| xs | 12px | 16px | Labels, badges |
| sm | 14px | 20px | Body text, buttons |
| base | 16px | 24px | Default text |
| lg | 18px | 28px | Subheadings |
| xl | 20px | 28px | Section titles |
| 2xl | 24px | 32px | Page titles |
| 3xl | 30px | 36px | Large headings |

### Font Weights

| Name | Weight | Usage |
|------|--------|-------|
| Normal | 400 | Body text |
| Medium | 500 | Buttons, labels |
| Semibold | 600 | Subheadings |
| Bold | 700 | Headings |

---

## Components

### Status Badges

```html
<!-- Completed -->
<span class="badge badge-completed">Completed</span>

<!-- In Progress -->
<span class="badge badge-in-progress">In Progress</span>

<!-- Pending -->
<span class="badge badge-pending">Pending</span>

<!-- Scheduled -->
<span class="badge badge-scheduled">Scheduled</span>
```

**Design Specs:**
- Height: 24px
- Padding: 0 10px
- Border Radius: Full (pill)
- Font Size: 12px
- Font Weight: 500

### Buttons

```html
<!-- Primary -->
<button class="btn btn-primary btn-md">Submit</button>

<!-- Secondary -->
<button class="btn btn-secondary btn-md">Cancel</button>

<!-- Outline -->
<button class="btn btn-outline btn-md">View Details</button>

<!-- Danger -->
<button class="btn btn-danger btn-md">Decline</button>
```

**Sizes:**
- `btn-sm`: 32px height, 12px padding
- `btn-md`: 40px height, 16px padding (default)
- `btn-lg`: 48px height, 24px padding

### Cards

```html
<div class="card card-hover">
  <h3>Card Title</h3>
  <p>Card content...</p>
</div>
```

**Design Specs:**
- Padding: 24px
- Border Radius: 12px (rounded-xl)
- Shadow: `shadow-card`

### Form Inputs

```html
<input type="text" class="input" placeholder="Enter text..." />
```

**Design Specs:**
- Height: 40px
- Border Radius: 6px
- Border: 1px solid `#E2E8F0`
- Focus: Blue border + ring

### Sidebar Navigation

```html
<nav class="w-sidebar bg-white h-screen">
  <a href="#" class="sidebar-item sidebar-item-active">
    <Icon /> Active Item
  </a>
  <a href="#" class="sidebar-item">
    <Icon /> Normal Item
  </a>
</nav>
```

**Design Specs:**
- Width: 256px (collapsed: 80px)
- Item Height: 44px
- Active: Blue background (`#2563EB`), white text
- Hover: Light gray background (`#F1F5F9`)

---

## Layout

### Sidebar Layout (Web)

```
┌────────────────────────────────────────────────┐
│ Logo                              │  Header    │
├─────────────┬──────────────────────────────────┤
│             │                                  │
│   Sidebar   │         Main Content             │
│   256px     │                                  │
│             │                                  │
│             │                                  │
│─────────────│                                  │
│ User Info   │                                  │
└─────────────┴──────────────────────────────────┘
```

### Mobile Layout

```
┌──────────────────────┐
│ Header (56px)        │
├──────────────────────┤
│                      │
│    Main Content      │
│                      │
│                      │
├──────────────────────┤
│ Bottom Nav / Actions │
└──────────────────────┘
```

---

## Spacing Scale

| Name | Value | Pixels |
|------|-------|--------|
| 1 | 0.25rem | 4px |
| 2 | 0.5rem | 8px |
| 3 | 0.75rem | 12px |
| 4 | 1rem | 16px |
| 5 | 1.25rem | 20px |
| 6 | 1.5rem | 24px |
| 8 | 2rem | 32px |
| 10 | 2.5rem | 40px |
| 12 | 3rem | 48px |

---

## Border Radius

| Name | Value | Usage |
|------|-------|-------|
| sm | 4px | Small elements |
| md | 6px | Inputs |
| lg | 8px | Buttons |
| xl | 12px | Cards |
| 2xl | 16px | Modals |
| full | 9999px | Badges, avatars |

---

## Shadows

| Name | Value | Usage |
|------|-------|-------|
| card | `0 1px 3px rgba(0,0,0,0.1)` | Cards |
| dropdown | `0 4px 6px rgba(0,0,0,0.1)` | Dropdowns |
| modal | `0 25px 50px rgba(0,0,0,0.25)` | Modals |

---

## Icons

The designs use a consistent icon style:
- Stroke width: 1.5-2px
- Size: 20px (sidebar), 16px (buttons), 24px (headers)
- Style: Outlined

Recommended icon libraries:
- **Lucide React** (recommended)
- Heroicons
- Tabler Icons

---

## Role-Specific Notes

### Partner Portal
- Primary actions: Create task, view task status
- Focus on task creation form and task list
- Invoice/billing section

### Office Portal
- Primary actions: Assign technicians, manage requests
- Worker map view
- Technician management
- More navigation items than Partner

### Mobile Worker App
- Primary actions: Start job, finish job, report issue
- Timer display for active jobs
- GPS navigation integration
- Photo capture for documentation
- Vertical progress stepper

---

## File Locations

```
packages/shared/src/design/
├── tokens.ts          # All design tokens (colors, typography, spacing)
├── tailwind-preset.ts # Tailwind CSS preset
├── globals.css        # Global CSS with component classes
└── index.ts           # Exports
```

---

## Usage Examples

### Import Colors in Component

```typescript
import { colors, statusBadgeVariants } from '@doergo/shared';

// Get status color
const getStatusColor = (status: string) => {
  return statusBadgeVariants[status]?.color || colors.text.secondary;
};
```

### Tailwind Classes

```html
<!-- Primary Button -->
<button class="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg">
  Submit
</button>

<!-- Status Badge -->
<span class="bg-success-light text-success px-2.5 py-0.5 rounded-full text-xs font-medium">
  Completed
</span>

<!-- Card -->
<div class="bg-white rounded-xl shadow-card p-6">
  Content
</div>
```
