# Prime Easy Learn API

Express 5 API backed by MongoDB. The student, trainer, and admin clients use this API for authentication, courses, learner progress, assessments, uploads, and the super-admin landing-page editor.

## Local setup

1. From the repository root, copy `.env.example` to `server/.env`.
2. Fill in `MONGODB_URI`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, the Cloudinary values, and `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD`. MongoDB is required in development and production; startup now stops immediately with a clear error if it cannot connect.
3. Use separate random JWT secrets with at least 32 characters. The initial super-admin password must have at least 12 characters.
4. Keep `CLIENT_URL` aligned with the frontend origins. Local development defaults are `http://localhost:5173` and `http://localhost:5174`. The production Netlify app at `https://easylearnlms.netlify.app` is also allowed by the API.
5. In this directory, run `npm ci` and `npm run dev`.

The first super-admin is created only if no super-admin account exists. If one already exists, changing `SUPER_ADMIN_EMAIL` or `SUPER_ADMIN_PASSWORD` will not replace it; use the authenticated account management flow instead.

## Production configuration

Set `NODE_ENV=production`, `PORT`, `MONGODB_URI`, both JWT secrets, all Cloudinary credentials, `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD`, and any additional production `CLIENT_URL` origins in the hosting platform's secret manager. Production startup rejects missing provider credentials, short JWT secrets, weak initial super-admin passwords, and non-HTTPS client origins. Production defaults refresh cookies to `SameSite=None; Secure` for the cross-site Netlify and Render deployment; `COOKIE_SAME_SITE` can override this when needed.

Deploy with `npm ci --omit=dev` followed by `npm start`. Terminate TLS at a trusted reverse proxy and restrict database network access to the application. Back up MongoDB and verify a restore before launch. Do not commit `.env` files.

## Main endpoint groups

- `/api/auth` — login, refresh, logout, current user
- `/api/users` — super-admin user management and self-profile updates
- `/api/categories`, `/api/courses`, `/api/modules`, `/api/content` — course structure and trainer content management
- `/api/enrollments` — create, list, extend, and renew enrollment cycles
- `/api/assessments`, `/api/attempts` — assessment creation, question management, auto-save, timed attempts, and server-side grading
- `/api/learner` — dashboard, enrolled courses/player, progress, certificates, messages, support, notifications
- `/api/admin` — trainer summary, platform summaries, reports, certificate generation
- `/api/certificates/verify/:code` — public certificate verification
- `/api/landing` — public landing content; super-admin updates require authorization
- `/api/uploads/signature` — authenticated, rate-limited Cloudinary upload signatures

Authenticated endpoints use `Authorization: Bearer <accessToken>`; refresh uses an HTTP-only cookie. Successful responses use `{ success, message, data }`; errors include a stable `code`.

## Media uploads

The API signs browser-to-Cloudinary uploads without exposing the Cloudinary secret. Signatures are scoped to the user's role folder, an allowlist of file formats, a unique public ID, and `overwrite=false`. Configure upload size and usage limits in Cloudinary as well; those limits are needed to control storage and bandwidth costs.

The current upload rate limiter is process-local. Run one API instance or replace it with a shared store before horizontal scaling. Cloudinary video URLs are public media URLs; private video delivery requires a signed playback policy before using sensitive course videos.

## Flow integration test

`npm test` runs unit tests and skips the API flow test unless `TEST_MONGODB_URI` is set. Point it at a disposable database named `pel_flow_test` or `pel_flow_test_<hex>`; the flow test validates the name and drops that database when it finishes. Never point this variable at the application or production database. To include a tiny real Cloudinary image upload round trip, set `TEST_CLOUDINARY_UPLOADS=true`; the test deletes the temporary image during cleanup.

## Security and remaining launch work

Server-side role and resource checks protect learner enrollments, trainer-owned courses, user role management, assessment answers, and certificate eligibility. The API still needs deployed MongoDB/Cloudinary credentials and a live staging smoke test. The admin and client also contain unfinished demo-only pages and local presentation data; review those product flows before announcing a complete production launch.
