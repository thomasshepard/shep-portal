# Shep Portal

A private family/business portal with authentication, property tracking, shared files, and custom HTML tools. Built with React + Vite, Supabase (auth + database + storage), and deployed to GitHub Pages.

---

## Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project
- A GitHub repository with GitHub Pages enabled

---

## Setup

### 1. Database

Run `supabase-setup.sql` in the Supabase SQL editor (Dashboard → SQL Editor).

### 2. Storage Buckets

Create three buckets in the Supabase Dashboard under **Storage → New Bucket**:

| Bucket | Type |
|---|---|
| `property-photos` | Public |
| `property-docs` | Private |
| `shared-files` | Private |

Add storage policies for each bucket:
- `property-photos` — read access for authenticated users
- `property-docs` / `shared-files` — read for authenticated; upload/delete for admin only

### 3. First Admin User

1. Go to **Authentication → Users → Add User** in the Supabase dashboard
2. Create your account with email + password
3. Run this SQL to grant admin role (replace the email):

```sql
UPDATE public.profiles SET role = 'admin' WHERE email = 'your-email@example.com';
```

### 4. Local Development

```bash
git clone https://github.com/thomasshepard/shep-portal
cd shep-portal
cp .env.example .env
# Fill in your Supabase URL and anon key in .env
npm install
npm run dev
```

### 5. GitHub Pages Deployment

1. Push to the `main` branch
2. Add these repository secrets in **Settings → Secrets → Actions**:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. Enable GitHub Pages from the `gh-pages` branch in **Settings → Pages**

The GitHub Actions workflow automatically builds and deploys on every push to `main`.

---

## Adding Users

Go to **Authentication → Users → Add User** in Supabase. New users automatically get a `member` profile via the database trigger. To make someone an admin, update their `role` in the `profiles` table.

## Adding Custom HTML Tools

1. Log in as admin and go to **Admin → Content**
2. Click **New Tool**, enter a title, slug, and paste in the HTML
3. Set it active and save — it will appear in the Tools section for all users

## Uploading Property Photos and Files

- **Property photos/docs**: Use the Supabase Storage dashboard to upload files into `property-photos/<property-id>/` and `property-docs/<property-id>/`
- **Shared files**: Log in as admin and use the **Files** section upload button
