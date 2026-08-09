# map

Smart Survey Map – Complete Lovable Prompt

Build a premium mobile-first Android application with an Apple iOS 26 Liquid Glass (Glassmorphism) inspired interface using React + TypeScript + Tailwind CSS + shadcn/ui.

The design should feel like Apple's latest UI:

- Liquid Glass cards

- Frosted glass panels

- Blur backgrounds

- Smooth animations

- Rounded corners (20–28px)

- Soft shadows

- Premium transitions

- Blue + White + Black color palette

- Minimal, clean, modern interface

- 60 FPS animations

- Professional production-quality UI

---

Authentication

Create a beautiful login screen.

Login UI

- Glassmorphism background

- App Logo at top

- Welcome Text

- Username field

- Password should use 6 OTP-style rounded boxes

- Auto move cursor while typing

- Backspace support

- Show/Hide Password

- Remember Me

- Login Button

- Forgot Password

- Error Message

- Loading Animation

---

Default Users (Development Only)

Automatically create:

Username:

admin1

Password:

950534

Username:

chw1

Password:

950534

Passwords must be hashed.

Only create these on first database initialization.

---

Roles

Admin

Survey User

Only admin can access Admin Panel.

---

Admin Panel

Create complete Admin Dashboard.

Features:

Dashboard

Total Users

Active Users

Inactive Users

Total Pins

Today's Pins

Map Overview

Recent Activity

User Management

Create User

Edit User

Delete User

Reset Password

Enable User

Disable User

Search User

Filter Users

View User Details

Pin Management

View All Pins

Edit Pins

Delete Pins

Filter by User

Filter by Pin Type

Search House ID

Export CSV

Export Excel

Settings

Theme

Map Icons

Backup Database

Restore Database

Logout

---

Login Flow

Login

↓

Open Home Screen

↓

Map Screen

---

Home Screen

Bottom Navigation

Map

Records

Settings

Profile

Floating Glass Action Button

---

Map Screen

Use:

OpenStreetMap

Leaflet

GPS

Automatically:

Ask Location Permission

Detect Current GPS

Center Map

Blue Current Location Marker

Live Accuracy Circle

Smooth Zoom

---

Add Pin

Floating Add Pin Button

User taps map

↓

Draggable Marker

↓

Bottom Sheet opens

Show

Latitude

Longitude

Pin Type

Save Button

Cancel Button

---

Pin Types

House

Locked House

Refused

Shop

Mosque

Temple

Church

School

College

Hospital

Office

Government Office

Apartment

Construction

Empty Land

Park

Hotel

Restaurant

Petrol Pump

Other

Other should allow custom text.

---

Conditional Form

If House selected

Show

House ID

House Number

Owner Name (Optional)

If other selected

Hide House ID

Only save selected type.

---

Save Pin

Store

Latitude

Longitude

GPS Accuracy

User ID

Username

Pin Type

House ID

Custom Type

Created Date

Updated Date

Device Time

Device ID

---

Pins on Map

Show every saved pin.

Different icon for each type.

Cluster markers.

Tap marker

↓

Popup

Pin Type

House ID

Created By

Date

Latitude

Longitude

Open Details

Edit

Delete (Admin only)

---

Records Screen

Beautiful searchable list.

Card Layout.

Each card shows

Icon

House ID

Type

Date

Time

Distance

Search

Sort

Filter

Swipe Actions

Delete

Edit

Open Map

---

Record Details

Large Card

Show

All information

Open on Map

Navigate

Share

Edit

Delete

---

Settings

Theme

Light

Dark

Auto

Map Settings

Marker Size

Marker Color

Marker Icons

Map Style

Export

CSV

Excel

Backup

Restore

Language

English

Hindi

Urdu

---

Profile

Profile Photo

Name

Username

Role

Phone

Logout

---

Search

Search by

House ID

Username

Pin Type

Location

---

Offline Support

Offline Database

Queue Sync

Auto Sync

Conflict Resolution

---

Database

Users

Pins

Settings

Icons

Activity Logs

Backups

---

Security

Hashed Passwords

Role Based Access

Secure APIs

Protected Routes

Session Timeout

Auto Logout

---

Performance

Lazy Loading

Image Optimization

Code Splitting

Fast Rendering

Offline Cache

Smooth Animations

---

UI Style

Apple iOS 26 Liquid Glass

Glassmorphism

Blur Panels

Rounded Corners

Floating Cards

Floating Navigation

Premium Icons

SF Pro style typography

Blue Gradient Accents

White Background

Black Text

Subtle Transparency

Modern Shadows

Premium Buttons

Beautiful Empty States

Animated Bottom Sheets

Animated Floating Buttons

Premium Charts

Professional Dashboard

Everything should feel polished like an Apple native application.

---

Tech Stack

React

TypeScript

Tailwind CSS

shadcn/ui

OpenStreetMap

Leaflet

Geolocation API

Supabase

React Query

Zustand

React Hook Form

Framer Motion

PapaParse (CSV Export)

---

Final Goal

Build a complete production-ready Survey Mapping Application with a premium Apple Liquid Glass interface, GPS-based OpenStreetMap integration, secure authentication, a full Admin Panel, user management, pin management, records, settings, offline capability, CSV/Excel export, and an extremely clean, modern, responsive UI optimized for Android devices.                                                                                                                                             Replace the authentication system with a 6-digit PIN login

Remove the traditional username + text password authentication.

Login Method

Use a 6-digit numeric PIN instead of a text password.

Login Screen

- Modern Apple iOS Liquid Glass UI.

- Glassmorphism design.

- Blue + White + Black theme.

- App logo at the top.

- Welcome message.

- Username field.

- Below it, show 6 rounded OTP-style PIN boxes.

- Each box accepts numbers only (0–9).

- Automatically move to the next box after entering a digit.

- Backspace should move to the previous box.

- Allow pasting a full 6-digit PIN.

- Automatically submit when all 6 digits are entered.

- Show a loading animation while verifying.

- Display an error message for an invalid PIN.

- Include biometric login (Fingerprint/Face ID) as an optional future feature.

Default Users (Development Only)

Create these accounts automatically on first database initialization:

- Username: "admin1"

  

  - PIN: "950534"

  - Role: Admin

- Username: "chw1"

  

  - PIN: "950534"

  - Role: Survey User

Security

- Store the PIN securely as a hashed value, never in plain text.

- Only numeric 6-digit PINs are allowed.

- Do not allow letters or special characters.

- Lock the account temporarily after multiple failed attempts.

- Protect all admin routes.

- Keep the user logged in until they manually log out or the session expires.

Admin Panel

The Admin must be able to:

- Create users.

- Edit users.

- Delete users.

- Reset a user's 6-digit PIN.

- Enable or disable accounts.

- Assign roles (Admin or Survey User).

When creating a user, the PIN field must accept exactly 6 numeric digits only.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://mapv1-ibrahimlabs.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/8f510f96-2bbb-4a0d-917e-4ce215aefebb).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
