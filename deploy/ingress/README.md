# EJ public ingress

The existing TMS gateway continues to own HTTP port 80. This provisioning adds:

- An ACME challenge service on the TMS Docker network.
- A separate EJ HTTPS gateway on port 443, connected only to the EJ network.
- A managed block in TMS nginx.conf for the challenge path and HTTP /ej redirects.
- A trusted Let's Encrypt IP certificate and a twice-daily renewal cron job.

`provision.py` checks the known gateway mount, network, port ownership and existing TMS/EJ responses. It backs up each changed TMS configuration, validates a candidate in a separate container, preserves the file inode used by the live bind mount, tests nginx again, and gracefully reloads. It restores the prior configuration if applying/testing it fails. It never restarts TMS containers or modifies their databases.

Persistent state is under `$HOME/ej-learning/ingress`; application releases and their database remain separate. Staging certificate state is separate from production. `renew.sh` renews and reloads only the EJ HTTPS gateway; its output goes to `renew.log`. Review that log and certificate expiry as part of operations. Back up certificate state securely along with the existing application backup process.

**Keep the managed TMS nginx block in the TMS source repository.** Its deployment pipeline copies nginx.conf and can overwrite server-only changes. The exact two snippets are `tms-acme.conf` and `tms-redirect.conf`. The block must remain inside the existing `server {}`. Do not deploy the snippets as standalone nginx.conf files.

On a different host/network/IP, review the constants and network names before running this provisioning; request a new certificate if the IP changes. Application images and storage remain portable.

The provisioning workflow's push trigger is restricted to its bootstrap branch. After the initial setup, use workflow_dispatch only; remove the bootstrap trigger before merging.
