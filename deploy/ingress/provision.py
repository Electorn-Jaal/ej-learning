"""Add EJ HTTPS beside the inspected TMS gateway; preserve its bind-mount inode."""
import json
import os
from pathlib import Path
import re
import subprocess
import time
import uuid

IP = '116.206.83.75'
GATEWAY = 'diploma-system-nginx-1'
home = Path.home()
root = home / 'ej-learning' / 'ingress'
source = Path(__file__).resolve().parent
root.mkdir(parents=True, exist_ok=True)

def run(*args, capture=False, input=None):
    result = subprocess.run(args, text=True, input=input,
                            stdout=subprocess.PIPE if capture else None, check=True)
    return result.stdout.strip() if capture else None

def compose(*args):
    return run('docker', 'compose', '-p', 'ej-ingress', '-f', str(root / 'compose.yml'), *args)

def http(path):
    return run('curl', '--fail', '--silent', '--show-error', '--max-time', '15',
               'http://127.0.0.1' + path, capture=True)

def https(path):
    return run('curl', '--fail', '--silent', '--show-error', '--retry', '5',
               '--retry-delay', '2', '--max-time', '20', '--connect-to',
               IP + ':443:127.0.0.1:443', 'https://' + IP + path, capture=True)

gateway = json.loads(run('docker', 'inspect', GATEWAY, capture=True))[0]
mounts = [m for m in gateway['Mounts'] if m['Destination'] == '/etc/nginx/nginx.conf']
assert len(mounts) == 1 and mounts[0]['Type'] == 'bind', 'Unexpected gateway mount'
config = Path(mounts[0]['Source']).resolve()
assert config == (home / 'diplom/infra/nginx/nginx.conf').resolve(), 'Unexpected source path'
assert 'diploma-system_default' in gateway['NetworkSettings']['Networks']
run('docker', 'network', 'inspect', 'ej-learning_default', capture=True)
assert '"ok"' in run('curl', '--fail', '--silent', 'http://127.0.0.1:18080/ej/api/healthz', capture=True)
http('/') # Existing TMS must work before starting.
existing = run('docker', 'ps', '--filter', 'publish=443', '--format', '{{.Names}}', capture=True)
assert not existing or existing == 'ej-ingress-tls-1', 'Port 443 belongs to another service'
listeners = run('ss', '-ltnH', capture=True)
assert existing or not re.search(r'\S+:443\s', listeners), 'Host port 443 already occupied'
run('docker', 'run', '--rm', 'certbot/certbot:v5.4.0', '--version')

for name in ['compose.yml', 'acme.conf', 'tls.conf', 'renew.sh']:
    data = (source / name).read_bytes()
    target = root / name
    # Preserve the inode when Docker already has an individual file mounted.
    with target.open('wb') as stream:
        stream.write(data)
for name in ['webroot/.well-known/acme-challenge', 'certificates', 'staging-certificates',
             'certbot-work', 'certbot-logs', 'staging-work', 'staging-logs', 'backups']:
    (root / name).mkdir(parents=True, exist_ok=True)
(root / 'webroot').chmod(0o755)
(root / 'webroot/.well-known').chmod(0o755)
(root / 'webroot/.well-known/acme-challenge').chmod(0o755)

BEGIN = '        # BEGIN EJ MANAGED INGRESS\n'
END = '        # END EJ MANAGED INGRESS\n'
acme = (source / 'tms-acme.conf').read_text()
redirect = (source / 'tms-redirect.conf').read_text()

def patch_gateway(include_redirect):
    original = config.read_text()
    if BEGIN in original:
        assert original.count(BEGIN) == 1 and original.count(END) == 1
        base = original[:original.index(BEGIN)] + original[original.index(END) + len(END):]
    else:
        base = original
        assert '/.well-known/acme-challenge/' not in base and 'location /ej' not in base
    anchor = '        server_name _;\n'
    assert base.count(anchor) == 1, 'Gateway layout changed; manual review required'
    candidate = base.replace(anchor, anchor + BEGIN + acme + (redirect if include_redirect else '') + END)
    if candidate == original:
        return
    candidate_path = root / 'candidate-nginx.conf'
    candidate_path.write_text(candidate)
    run('docker', 'run', '--rm', '--network', 'diploma-system_default',
        '-v', str(candidate_path) + ':/etc/nginx/nginx.conf:ro', gateway['Config']['Image'], 'nginx', '-t')
    backup = root / 'backups' / ('nginx-' + str(time.time_ns()) + '.conf')
    backup.write_text(original)
    backup.chmod(0o600)
    assert config.read_text() == original, 'Gateway changed concurrently'
    try:
        with config.open('r+') as stream:
            stream.write(candidate)
            stream.truncate()
            stream.flush()
            os.fsync(stream.fileno())
        run('docker', 'exec', GATEWAY, 'nginx', '-t')
        run('docker', 'exec', GATEWAY, 'nginx', '-s', 'reload')
        http('/')
    except Exception:
        with config.open('r+') as stream:
            stream.write(original)
            stream.truncate()
        run('docker', 'exec', GATEWAY, 'nginx', '-t')
        run('docker', 'exec', GATEWAY, 'nginx', '-s', 'reload')
        raise
    print('Gateway config backed up, tested and gracefully reloaded', flush=True)

compose('up', '-d', 'acme')
# Keep an existing working redirect during repeat provisioning.
patch_gateway('https://' + IP in config.read_text())
probe_name = 'ej-probe-' + uuid.uuid4().hex
probe = root / 'webroot/.well-known/acme-challenge' / probe_name
probe.write_text(probe_name)
probe.chmod(0o644)
try:
    for attempt in range(10):
        try:
            assert http('/.well-known/acme-challenge/' + probe_name) == probe_name
            break
        except Exception:
            if attempt == 9: raise
            time.sleep(2)
finally:
    probe.unlink()

def certbot(staging):
    config_dir, work, logs = ('staging-certificates', 'staging-work', 'staging-logs') if staging else ('certificates', 'certbot-work', 'certbot-logs')
    command = ['docker', 'run', '--rm',
        '-v', str(root / config_dir) + ':/etc/letsencrypt',
        '-v', str(root / work) + ':/var/lib/letsencrypt',
        '-v', str(root / logs) + ':/var/log/letsencrypt',
        '-v', str(root / 'webroot') + ':/var/www/acme',
        'certbot/certbot:v5.4.0', 'certonly', '--non-interactive', '--agree-tos',
        '--register-unsafely-without-email', '--preferred-profile', 'shortlived',
        '--webroot', '--webroot-path', '/var/www/acme', '--ip-address', IP, '--cert-name', 'ej-ip',
        '--keep-until-expiring']
    if staging: command.append('--staging')
    run(*command)

print('Requesting staging IP certificate', flush=True)
certbot(True)
print('Requesting trusted IP certificate', flush=True)
certbot(False)
compose('up', '-d', 'tls')
compose('exec', '-T', 'tls', 'nginx', '-t')
compose('exec', '-T', 'tls', 'nginx', '-s', 'reload')
assert '"ok"' in https('/ej/api/healthz')
assert '/ej/assets/' in https('/ej/')
patch_gateway(True)
http('/')
status = run('curl', '--silent', '--output', '/dev/null', '--write-out', '%{http_code}',
             'http://127.0.0.1/ej/', capture=True)
assert status == '308'
cron = subprocess.run(['crontab', '-l'], capture_output=True, text=True)
assert cron.returncode == 0 or 'no crontab' in cron.stderr.lower(), cron.stderr
line = '17 1,13 * * * /bin/bash "$HOME/ej-learning/ingress/renew.sh" >> "$HOME/ej-learning/ingress/renew.log" 2>&1 # EJ certificate renewal'
lines = [item for item in cron.stdout.splitlines() if '# EJ certificate renewal' not in item]
run('crontab', '-', input='\n'.join(lines + [line]) + '\n')
run('bash', str(root / 'renew.sh'))
print('PUBLIC HTTPS READY: https://' + IP + '/ej/', flush=True)
print('TMS HTTP root still healthy; certificate renewal scheduled twice daily.', flush=True)
