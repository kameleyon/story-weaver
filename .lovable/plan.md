

# Plan: Add Admin Link to User Menu and Clickable User Name in Admin Panel

## Overview
This plan adds an "Admin" menu item to the user dropdown menu for admin users, and makes the user's name in the Admin Control Panel header clickable to navigate to Settings.

---

## Changes Required

### 1. Add Admin Menu Item to AppSidebar User Dropdown

**File: `src/components/layout/AppSidebar.tsx`**

- Import the `useAdminAuth` hook to check admin status
- Import the `Shield` icon from lucide-react
- Add "Admin" menu item conditionally (only shown to admin users)
- Add in both locations:
  - **Mobile header dropdown** (lines 232-258)
  - **Desktop footer dropdown** (lines 545-571)

The Admin menu item will:
- Appear after "Settings" and "Usage & Billing"
- Use a Shield icon to match the Admin page branding
- Navigate to `/admin` when clicked

### 2. Make User Name Clickable in Admin Panel Header

**File: `src/pages/Admin.tsx`**

- Wrap the user avatar and name in a clickable element
- Navigate to `/settings` when clicked
- Add hover styles to indicate it's clickable

---

## Technical Details

### AppSidebar Changes

```tsx
// Import additions
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { Shield } from "lucide-react";

// In component body, add admin check
const { isAdmin } = useAdminAuth();

// Mobile dropdown - add after Usage & Billing
{isAdmin && (
  <DropdownMenuItem onClick={() => { navigate("/admin"); toggleSidebar(); }}>
    <Shield className="mr-2 h-4 w-4" />
    <span>Admin</span>
  </DropdownMenuItem>
)}

// Desktop dropdown - add after Usage & Billing
{isAdmin && (
  <DropdownMenuItem onClick={() => navigate("/admin")}>
    <Shield className="mr-2 h-4 w-4" />
    <span>Admin</span>
  </DropdownMenuItem>
)}
```

### Admin.tsx Changes

```tsx
// User section - make clickable
<button
  onClick={() => navigate("/settings")}
  className="flex items-center gap-2 cursor-pointer hover:opacity-80"
>
  <div className="w-8 h-8 rounded-full bg-primary...">
    {user?.email?.charAt(0).toUpperCase()}
  </div>
  <span className="hidden sm:block text-sm">
    {user?.email?.split("@")[0]}
  </span>
</button>
```

---

## Summary

| Location | Change |
|----------|--------|
| AppSidebar (Mobile) | Add Admin menu item for admin users |
| AppSidebar (Desktop) | Add Admin menu item for admin users |
| Admin.tsx | Make user avatar/name clickable → navigates to Settings |

No database changes required. The existing `useAdminAuth` hook already provides the admin status check.

