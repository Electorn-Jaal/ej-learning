# HTTPS without buying a domain

Target: `https://116.206.83.75/ej/`. HTTP path configuration alone cannot enable production login because cookies are Secure.

Let's Encrypt now supports publicly trusted IP certificates. Use Certbot 5.4+ with webroot and the `shortlived` profile. Certificates last about six days, so automated renewal plus webserver reload and expiry monitoring are required. [Official instructions](https://letsencrypt.org/2026/03/11/shorter-certs-certbot/).

Provisioning sequence (not yet executed):

1. Inspect the live TMS Nginx configuration mount, its Compose source and gateway network. Back up the exact config and record existing HTTP responses. Confirm port 443 is free and inbound 443 is allowed. Avoid printing environment files or credentials.
2. Add an ACME webroot route `/.well-known/acme-challenge/` to the existing port-80 gateway, without altering its TMS locations. Serve challenge files from a dedicated shared directory or a small challenge service. Persist this addition in TMS's source config as well. Test config before reload, then test an actual temporary challenge file from outside.
3. Obtain a staging certificate first with Certbot `certonly --staging --preferred-profile shortlived --webroot --webroot-path <challenge-root> --ip-address 116.206.83.75`. Use separate staging state so an untrusted certificate cannot replace the production one. Once validation succeeds, request production without `--staging`.
4. A separate EJ TLS gateway can own the currently unused 443 port and serve only `/ej/`, proxying to EJ web. Mount certificates read-only and keep private keys outside images/Git. This avoids replacing the TMS port-80 container. Keep unrelated HTTPS routes closed until deliberately configured.
5. Redirect only HTTP `/ej` and `/ej/…` to the matching HTTPS URL. Preserve TMS HTTP behavior. Configure automatic renewal at least twice daily, a deploy hook to test/reload the EJ TLS gateway after a successful renewal, and monitor remaining certificate lifetime. Verify renewal with Certbot's supported test procedure.
6. Verify trusted certificate, login/logout, Secure cookie Path=/ej/, PDF viewing and quiz persistence in a browser. Confirm existing TMS URLs still return their baseline responses.

Do not disable Secure cookies or stop TMS to run standalone Certbot on port 80. A future server move with a different IP needs a new certificate; the database, storage and application images can still be transferred unchanged.
