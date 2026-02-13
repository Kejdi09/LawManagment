Deployment checklist

1) Commit & push your changes

   git add .
   git commit -m "Add secure auth, CORS config, and deployment files"
   git push origin main

2) Backend (Render)
- Create a new Web Service on Render and connect your GitHub repo.
- Render will use `render.yaml` to configure the service. Set these environment variables in Render:
  - `MONGODB_URI` -> your MongoDB connection string
  - `JWT_SECRET` -> a long random secret
  - `DB_NAME` -> optional (defaults to `lawman`)
  - `ALLOWED_ORIGINS` -> your frontend URL(s), comma-separated (e.g. https://your-app.vercel.app)
- Start command: `npm run server`

3) Frontend (Vercel)
- Connect your GitHub repo to Vercel and configure the project.
- Build command: `npm run build`
- Output directory: `dist`
- Set environment variable `VITE_API_URL` to your Render service base URL (e.g. https://lawman-backend.onrender.com)

4) Test after deploy
- Open frontend, login with seeded account:
  - username: adidafku
  - password: adixhamiadurres
- Confirm `/api/me` returns authenticated and that cookies are set (network tab).

Notes & next steps
- Consider securing Render with HTTPS (default) and ensuring ALLOWED_ORIGINS matches your Vercel domain.
- Move secrets to a secrets manager and rotate the `JWT_SECRET` periodically.
