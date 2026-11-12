# Production on HP-ProDesk

[catan.lecani.se](https://catan.lecani.se) uses a proxied Cloudflare CNAME to
`origin.lecani.se`. The IIS site with the same name uses
`D:\Sites\catan-iis\web.config` and proxies both HTTP requests and WebSocket
upgrades to Node on `127.0.0.1:3417`. IIS ARR must preserve the original Host
header for Socket.IO's origin check. The host's existing win-acme task renews
the site's Let's Encrypt certificate using the HTTP challenge route.

The `LeCataNi Web` scheduled task starts at boot, runs as Local Service, and
retries if the launcher exits. The app root is `D:\Catan\app`; Local Service
can read the release and write to `.runtime`. The lobby snapshot and the
current process's stdout and stderr logs are in that directory.

To update, run `npm ci`, `npm test`, and `npm run build` in the intended
source checkout. Stage `dist`, `server`, `shared`, `deploy/Start-LeCataNi.ps1`,
`package.json`, and `package-lock.json` on HP-ProDesk and run
`npm ci --omit=dev` in the staged directory. During a maintenance window, stop
`LeCataNi Web` and confirm port 3417 is free, back up the current app and its
`.runtime` directory, and replace the release files while preserving
`.runtime` and its permissions. Copy `deploy/web.config` to the IIS root if
it changed, then start the task again. If the new release fails, restore the
previous release files and restart the task.

Check [the health endpoint](https://catan.lecani.se/api/health), then open the
game and create a private lobby. Join its invite from another browser session
to check that both clients receive live updates.
