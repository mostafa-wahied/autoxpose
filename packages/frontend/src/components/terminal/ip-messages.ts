import { useMemo } from 'react';
import { type IpState } from '../../lib/api';

export type IpMsg = {
  text: string;
  dismissible: boolean;
  severity: 'error' | 'warning' | 'info';
};

function getServerIpMessage(state: IpState, ip: string, detected: string | null): IpMsg {
  const msgs: Record<IpState, IpMsg> = {
    missing: {
      text: `Server IP: localhost (set SERVER_IP)`,
      dismissible: false,
      severity: 'error',
    },
    invalid: { text: `Server IP: invalid format "${ip}"`, dismissible: false, severity: 'error' },
    placeholder: {
      text: `Server IP: placeholder "${ip}" (set real IP)`,
      dismissible: false,
      severity: 'error',
    },
    valid: { text: '', dismissible: false, severity: 'info' },
    'bridge-autodetected': { text: '', dismissible: false, severity: 'info' },
    mismatch: {
      text: detected ? `Server IP: ${ip} but detected ${detected} (VPN?)` : '',
      dismissible: true,
      severity: 'warning',
    },
  };
  return msgs[state];
}

function getLanIpMessage(state: IpState, ip: string): IpMsg {
  const msgs: Record<IpState, IpMsg> = {
    missing: { text: '', dismissible: false, severity: 'info' },
    invalid: { text: `LAN IP: invalid format "${ip}"`, dismissible: false, severity: 'error' },
    placeholder: {
      text: `LAN IP: placeholder "${ip}" (set real IP)`,
      dismissible: false,
      severity: 'error',
    },
    valid: { text: '', dismissible: false, severity: 'info' },
    'bridge-autodetected': {
      text: `LAN IP: auto-detected ${ip} (set LAN_IP if needed)`,
      dismissible: true,
      severity: 'info',
    },
    mismatch: { text: '', dismissible: false, severity: 'info' },
  };
  return msgs[state];
}

function buildIpMessages(p: {
  srv: IpState | undefined;
  lan: IpState | undefined;
  srvIp: string;
  lanIp: string;
  det: string | null;
  proxyCfg: boolean;
  dis: Set<string>;
}): Array<IpMsg & { key: string }> {
  const res: Array<IpMsg & { key: string }> = [];

  if (p.srv && p.srv !== 'valid') {
    const k = `server:${p.srv}:${p.srvIp}`;
    if (!p.dis.has(k)) {
      const m = getServerIpMessage(p.srv, p.srvIp, p.det);
      if (m.text) res.push({ ...m, key: k });
    }
  }

  if (p.lan && p.lan !== 'valid' && p.proxyCfg) {
    const k = `lan:${p.lan}:${p.lanIp}`;
    if (!p.dis.has(k)) {
      const m = getLanIpMessage(p.lan, p.lanIp);
      if (m.text) res.push({ ...m, key: k });
    }
  }

  return res;
}

export function useIpMessages(params: {
  serverIpState: IpState | undefined;
  lanIpState: IpState | undefined;
  serverIp: string | undefined;
  lanIp: string | undefined;
  detectedIp: string | null | undefined;
  proxyConfigured: boolean;
  dismissed: Set<string>;
}): Array<IpMsg & { key: string }> {
  const { serverIpState, lanIpState, serverIp, lanIp, detectedIp, proxyConfigured, dismissed } =
    params;
  return useMemo(
    () =>
      buildIpMessages({
        srv: serverIpState,
        lan: lanIpState,
        srvIp: serverIp || '',
        lanIp: lanIp || '',
        det: detectedIp || null,
        proxyCfg: proxyConfigured,
        dis: dismissed,
      }),
    [serverIpState, lanIpState, serverIp, lanIp, detectedIp, proxyConfigured, dismissed]
  );
}
