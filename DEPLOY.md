# Deploying Decal to your own server

How `apps/web` gets from a push on `main` to running on your Ubuntu Server
box at home. One-time setup below; after that, `git push` is the whole
deploy process.

## How it works

- **CI** (`.github/workflows/deploy.yml`, `ci` job) runs on every push and
  pull request, on GitHub's own cloud runners: install, generate the
  Prisma client, lint, typecheck, build. Nothing here ever touches your
  server.
- **Deploy** (`deploy` job in the same file) runs only on a push to `main`,
  and only after `ci` passes. It runs on a **self-hosted runner** — GitHub
  Actions' agent installed directly on your Ubuntu box — so the job
  executes right there on the machine, with no SSH keys or dynamic DNS.
  The runner reaches out to GitHub, not the other way around.
- The deploy step itself is `docker compose up -d --build`, which runs
  the app container bound to `127.0.0.1:3000` only. The nginx already
  running on the box for Pterodactyl reverse-proxies a second domain to
  it (see step 6) — Decal never opens its own ports 80/443, so there's no
  conflict with Pterodactyl. `mobile` isn't part of any of this — the
  Capacitor app is still built by hand on a Mac (see
  `apps/mobile/README.md`).

## 1. Point your domain at home

Add a DNS **A record** for the (sub)domain you want to use — e.g.
`decal.yourdomain.com` — pointing at your home network's public IP. Check
it at [whatismyip.com](https://www.whatismyip.com) or `curl -4 ifconfig.me`
from the server.

**If your ISP doesn't give you a static IP** (most residential ones
don't), that A record will go stale whenever your IP changes. Either ask
your ISP for a static IP / business plan, or set up dynamic DNS — many
registrars (Cloudflare, Namecheap, etc.) and routers support a DDNS client
that keeps the record updated automatically. Worth confirming this now,
since a certificate renewal failing months from now because your IP
quietly changed is an annoying thing to debug later.

## 2. Ports 80 and 443

If Pterodactyl's panel is already reachable from outside your network,
these are already forwarded to this box and there's nothing to do here.
If not — router admin page, forward external 80 and 443 to the server's
internal IP. Either way, a DHCP reservation for the server (so its LAN IP
never changes) is worth having.

## 3. Prerequisites on the Ubuntu box

```bash
# Docker + the compose plugin
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
# log out and back in for the group change to take effect

git --version   # install via apt if missing
```

## 4. Install the self-hosted runner

GitHub → your repo → **Settings → Actions → Runners → New self-hosted
runner** → Linux/x64. Follow GitHub's generated commands to download and
configure it — when it asks for labels, add `decal-server` (the workflow
targets `runs-on: [self-hosted, decal-server]` specifically, so a stray
runner on some other machine can never accidentally pick up this job).

Then install it as a systemd service so it survives reboots and doesn't
depend on a logged-in terminal, instead of running `./run.sh` by hand:

```bash
cd ~/actions-runner   # wherever you extracted it
sudo ./svc.sh install
sudo ./svc.sh start
sudo ./svc.sh status   # should show "active (running)"
```

**If this repo is public**, know what a self-hosted runner means: the `ci`
job (which can run arbitrary code from a pull request, including from
forks) is pinned to `runs-on: ubuntu-latest` specifically so it never
touches this machine — only `deploy`, gated to pushes on `main`, runs
here. Don't loosen that `runs-on` in `ci`, and think twice before adding
other self-hosted jobs.

## 5. First-time checkout and `.env`

The runner needs an actual clone of the repo sitting in its job workspace
before the first workflow run creates one automatically — and more
importantly, this is where your real secrets live, completely separate
from anything in git or CI. This is also where `deploy/decal.nginx.conf`
(needed in the next step) actually comes from — it's a file in this repo,
so nothing in step 6 works until it's cloned:

```bash
# GitHub shows the exact path when you register the runner; it's
# typically:
cd ~/actions-runner/_work
mkdir -p decal/decal && cd decal/decal
git clone <your-repo-url> .
cp .env.example .env
nano .env   # fill in NEXTAUTH_URL, NEXTAUTH_SECRET, GOOGLE_CLIENT_ID/SECRET
```

Generate `NEXTAUTH_SECRET` with `openssl rand -base64 32`. `NEXTAUTH_URL`
should be `https://` plus the exact domain from step 1.

This `.env` is never committed (it's gitignored) and never touched by CI —
`deploy.yml`'s checkout step explicitly sets `clean: false` so it survives
every future run untouched.

## 6. Add Decal as a second nginx site

Pterodactyl's nginx already owns 80/443 on this box, so Decal rides on
that same nginx as a second virtual host (a different `server_name`, on
the same ports — that's how one nginx serves any number of domains, no
conflict) rather than running its own. `deploy/decal.nginx.conf`, in the
clone from step 5, has the config:

```bash
cd ~/actions-runner/_work/decal/decal   # the clone from step 5
sudo cp deploy/decal.nginx.conf /etc/nginx/sites-available/decal
sudo nano /etc/nginx/sites-available/decal   # replace decal.yourdomain.com with your real domain
sudo ln -s /etc/nginx/sites-available/decal /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d decal.yourdomain.com
```

`certbot` (if you don't already have it: `sudo apt install certbot
python3-certbot-nginx`) gets a certificate for this domain specifically —
independent of whatever cert Pterodactyl uses, since it's a different
domain — and rewrites the file to add the HTTPS server block and an
http→https redirect automatically.

## 7. Google OAuth Console

**Credentials → your OAuth 2.0 Client ID**, add:

- Authorized JavaScript origin: `https://decal.yourdomain.com`
- Authorized redirect URI: `https://decal.yourdomain.com/api/auth/callback/google`

(matching whatever you set `NEXTAUTH_URL` to in step 5, exactly).

## 8. First deploy

```bash
cd ~/actions-runner/_work/decal/decal   # the clone from step 5
docker compose up -d --build
docker compose logs -f web              # watch it come up; Ctrl-C to stop watching
```

You should see `[decal] Applying database migrations...` followed by
`[decal] Starting server...`. Then visit `https://decal.yourdomain.com` —
if nginx can't reach it, double-check the container's actually listening
(`docker compose ps`) and that step 6's config points at `127.0.0.1:3000`.

From here on, `git push` to `main` (after CI passes) does this exact same
`docker compose up -d --build` for you automatically.

## Troubleshooting / operations

- **Watch a deploy happen**: GitHub → repo → **Actions** tab shows every
  run, including the self-hosted `deploy` job's live log output.
- **Runner not picking up jobs**: `sudo ~/actions-runner/svc.sh status` on
  the server; `sudo journalctl -u actions.runner.* -f` for its logs.
- **App logs**: `docker compose logs -f web` from the repo checkout
  directory. **nginx/certificate issues**: `sudo nginx -t` to check config,
  `sudo journalctl -u nginx -f` or `/var/log/nginx/error.log`, and
  `sudo certbot certificates` to check what's issued.
- **Database lives on a named Docker volume** (`decal-data`), not inside
  the image or the git checkout — `docker compose up -d --build` never
  touches it, so redeploys never lose data. `docker volume inspect
  decal_decal-data` shows where it actually lives on disk if you ever want
  to back up the raw SQLite file directly.
- **Rolling back**: `git revert` the bad commit (or `git reset` and
  force-push, if you're comfortable with that) and push to `main` — same
  pipeline, just deploying an older version forward.
- **Manual redeploy without a new commit**: from the checkout directory on
  the server, `git pull && docker compose up -d --build` does exactly what
  CI would have.
