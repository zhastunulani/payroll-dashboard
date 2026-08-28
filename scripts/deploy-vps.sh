#!/usr/bin/env bash
set -euo pipefail

: "${CI_COMMIT_SHA:?CI_COMMIT_SHA is required}"
: "${DEPLOY_HOST:?DEPLOY_HOST is required}"
: "${DEPLOY_USER:?DEPLOY_USER is required}"
: "${DEPLOY_ROOT:?DEPLOY_ROOT is required}"

release_dir="${DEPLOY_ROOT}/releases/${CI_COMMIT_SHA}"
archive="payroll-${CI_COMMIT_SHA}.tar.gz"
remote="${DEPLOY_USER}@${DEPLOY_HOST}"
ssh_options=(-o BatchMode=yes -o StrictHostKeyChecking=yes)

tar -czf "${archive}" .output

ssh "${ssh_options[@]}" "${remote}" \
  "mkdir -p '${release_dir}'"

scp "${ssh_options[@]}" "${archive}" \
  "${remote}:${release_dir}/${archive}"

ssh "${ssh_options[@]}" "${remote}" \
  "tar -xzf '${release_dir}/${archive}' -C '${release_dir}' && \
   ln -sfn '${release_dir}' '${DEPLOY_ROOT}/current' && \
   sudo /usr/bin/systemctl restart payroll-dashboard.service && \
   sudo /usr/bin/systemctl is-active --quiet payroll-dashboard.service && \
   for attempt in {1..30}; do \
     if curl --fail --silent --show-error http://127.0.0.1:4300/api/ping; then \
       exit 0; \
     fi; \
     sleep 1; \
   done; \
   echo 'Payroll health check timed out after 30 seconds.' >&2; \
   exit 1"
