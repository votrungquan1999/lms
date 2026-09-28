## entry (src/app/page.tsx, src/app/redirect/page.tsx, src/app/admin/login/page.tsx, src/app/student/login/page.tsx, src/app/join/[token]/page.tsx, src/app/admin/(dashboard)/dashboard/page.tsx)

- [T1] entry/landing: `/` signed out — the two role cards (Student / Administrator)
- [T1] entry/admin-login: `/admin/login` signed out — Google sign-in card
- [T1] entry/student-login: `/student/login` signed out — username/password card, no errors
- [T1] entry/student-login-empty-submit: Sign In clicked with both fields blank — the browser's own `required` bubble, the app shows nothing of its own (student-login-form.tsx:72,84). Capture is flagged `stable: false` because Chromium's bubble is transient; the image still holds it
- [T2] entry/student-login-blank-username: username `"   "`, password `password123` — the only reachable path to the form's own "Username and password are required" (`required` treats whitespace as filled; student-login-form.tsx:36-37)
- [T2] entry/student-login-wrong-credentials: unknown username + wrong password — "Invalid username or password" (student-login-form.tsx:48)
- [T2] entry/join-invalid-token: `/join/this-token-does-not-exist` — "Invitation no longer valid" card (join-page.ui.tsx:39)
- [T1] entry/join-valid-token: a live invite path read off the seeded course — invite card with the self-signup form and the Google button
- [T2] entry/redirect-logged-out: `/redirect` with no session — **HTTP 500**, not the landing page (see notes)
- [T2] entry/admin-url-logged-out: `/admin/students` opened with no session — lands on `/admin/login`; `/admin/students` is outside proxy.ts's `protectedRoutes` (proxy.ts:5-10), so the dashboard layout's guard does the redirect (page-guard.ts:46-47)
- [T2] entry/admin-url-forbidden: `/admin/students` opened by a signed-in student — the 403 "Access Denied" page (page-guard.ts:49-50 → forbidden.tsx)
- [T1] entry/admin-dashboard: admin overview with the Students / Courses / Grading stat cards
- [skip] entry/redirect-logged-in: unreachable as a screen — every branch of RedirectPage calls `redirect()` and it returns no JSX (redirect/page.tsx:28-41); signed in as admin it just lands on `/admin/dashboard`, already captured above
- [skip] entry/admin-login-unclassified: needs a real Google OAuth round trip to mint a session with no admin/student record (admin/login/page.tsx:37-38); not drivable offline
- [skip] entry/join-google-*: `?google=1` provisioning branches need a completed Google OAuth callback (join/[token]/page.tsx:76-88); not drivable offline
