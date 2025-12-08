import https from 'node:https';

export async function verifyHttpsReachability(
  domain: string,
  attempts = 6,
  intervalMs = 5000
): Promise<boolean> {
  for (let i = 1; i <= attempts; i++) {
    if (await headHttps(domain)) return true;
    if (i < attempts) await delay(intervalMs);
  }
  return false;
}

async function headHttps(domain: string): Promise<boolean> {
  return new Promise(resolve => {
    const req = https.request({ hostname: domain, port: 443, method: 'HEAD', timeout: 5000 }, () =>
      resolve(true)
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

function delay(ms: number): Promise<void> {
  return new Promise(res => setTimeout(res, ms));
}
