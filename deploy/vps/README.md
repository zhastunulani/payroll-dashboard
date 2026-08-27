# Payroll VPS deployment

Payroll is isolated from GrantScope at every runtime boundary:

- Linux user: `payroll`
- application root: `/var/www/payroll-dashboard`
- application port: `127.0.0.1:4300`
- service: `payroll-dashboard.service`
- Nginx host: `payroll.zhastunulani.kz`
- environment file: `/var/www/payroll-dashboard/shared/.env`

GitLab CI keeps every deployed commit under `releases/<commit-sha>` and switches
the `current` symlink only after a release archive is uploaded successfully.
Production secrets remain on the server and are never committed to GitLab.

Required protected GitLab CI variables:

- `DEPLOY_HOST`
- `DEPLOY_USER`
- `DEPLOY_ROOT`
- `DEPLOY_SSH_KEY_B64`
