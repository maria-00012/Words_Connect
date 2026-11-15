# Words Connect frontend prototype

React + Vite classroom frontend. All account, invitation, classroom, and learning data are browser-local mock data; there is no backend, Firebase connection, email delivery, or production authentication.

## Run locally

```sh
npm install
npm run dev
```

## Demo accounts

Use password `connect123` with one of these accounts:

- Student: `student@wordsconnect.demo`
- Teacher: `teacher@wordsconnect.demo`
- Admin: `admin@wordsconnect.demo`

Teacher invitation preview: `/invite/teacher?token=teacher-demo-invite` (invited email `new.teacher@example.com`). Student invitation preview: `/register?invite=student-demo-invite`.

Mock state persists in local storage. Newly registered demo passwords are stored only as local SHA-256 digests; this is not a production password system. Clear the site’s local storage to reset the demo. Route guards only demonstrate frontend navigation and do not provide security.

## Verification

```sh
npm run build
npm run test:e2e
```
