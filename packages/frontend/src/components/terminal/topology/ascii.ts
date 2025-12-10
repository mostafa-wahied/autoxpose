import { getProviderDisplayName } from '../provider-icons';

interface ServiceItem {
  id: string;
  name: string;
  subdomain: string;
  enabled: boolean;
}

interface ASCIIOptions {
  services: ServiceItem[];
  dnsProvider: string | null | undefined;
  proxyProvider: string | null | undefined;
  dnsConfigured: boolean;
  proxyConfigured: boolean;
}

function centerText(text: string, width: number): string {
  const totalPadding = width - text.length;
  const leftPad = Math.floor(totalPadding / 2);
  const rightPad = totalPadding - leftPad;
  return ' '.repeat(Math.max(0, leftPad)) + text + ' '.repeat(Math.max(0, rightPad));
}

function wrapText(text: string, maxWidth: number): string[] {
  if (text.length <= maxWidth) return [text];

  const lines: string[] = [];
  let remaining = text;

  while (remaining.length > maxWidth) {
    let breakPoint = maxWidth;
    const searchText = remaining.slice(0, maxWidth + 1);
    const lastSpace = searchText.lastIndexOf(' ');
    const lastDash = searchText.lastIndexOf('-');

    if (lastSpace > maxWidth / 2) {
      breakPoint = lastSpace;
    } else if (lastDash > maxWidth / 2 && lastDash < maxWidth) {
      breakPoint = lastDash + 1;
    }

    lines.push(remaining.slice(0, breakPoint).trim());
    remaining = remaining.slice(breakPoint).trim();
  }

  if (remaining.length > 0) {
    lines.push(remaining);
  }

  return lines;
}

function padLines(lines: string[], targetHeight: number): string[] {
  const padded = [...lines];
  while (padded.length < targetHeight) {
    padded.push('');
  }
  return padded;
}

function buildFlowBox(content: string, width: number): string {
  const centeredContent = centerText(content, width);
  const topLine = `      \u2554${'═'.repeat(width + 2)}\u2557\n`;
  const contentLine = `      \u2551 ${centeredContent} \u2551\n`;
  const bottomLine = `      \u255a${'═'.repeat(width + 2)}\u255d\n`;
  return topLine + contentLine + bottomLine;
}

function buildServiceBox(name: string, width: number, height = 1): string {
  const lines = padLines(wrapText(name, width), height);
  const topLine = `      \u2554${'═'.repeat(width + 2)}\u2557\n`;

  let contentLines = '';
  for (const line of lines) {
    const centered = centerText(line, width);
    contentLines += `      \u2551 ${centered} \u2551\n`;
  }

  const bottomLine = `      \u255a${'═'.repeat(width + 2)}\u255d\n`;
  return topLine + contentLines + bottomLine;
}

function generateServicesASCII(services: ServiceItem[]): string {
  const boxWidth = 38;

  if (services.length === 0) {
    return buildServiceBox('No Services Exposed', boxWidth) + '                         \u2502\n';
  }

  if (services.length === 1) {
    return buildServiceBox(services[0].name, boxWidth) + '                         \u2502\n';
  }

  if (services.length === 2) {
    const width1 = 16;
    const width2 = 16;
    const wrapped1 = wrapText(services[0].name, width1);
    const wrapped2 = wrapText(services[1].name, width2);
    const maxHeight = Math.max(wrapped1.length, wrapped2.length);
    const lines1 = padLines(wrapped1, maxHeight);
    const lines2 = padLines(wrapped2, maxHeight);

    let diagram =
      '            \u250c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u253c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510\n';
    diagram += '            \u2502                  \u2502                  \u2502\n';
    diagram += `      \u2554${'═'.repeat(width1 + 2)}\u2557 \u2554${'═'.repeat(width2 + 2)}\u2557\n`;

    for (let i = 0; i < maxHeight; i++) {
      const c1 = centerText(lines1[i], width1);
      const c2 = centerText(lines2[i], width2);
      diagram += `      \u2551 ${c1} \u2551 \u2551 ${c2} \u2551\n`;
    }

    diagram += `      \u2552${'═'.repeat(width1 + 2)}\u2555 \u2552${'═'.repeat(width2 + 2)}\u2555\n`;
    diagram +=
      '            \u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u253c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518\n';
    diagram += '                         \u2502\n';
    return diagram;
  }

  if (services.length === 3) {
    const width1 = 12;
    const width2 = 10;
    const width3 = 12;
    const wrapped1 = wrapText(services[0].name, width1);
    const wrapped2 = wrapText(services[1].name, width2);
    const wrapped3 = wrapText(services[2].name, width3);
    const maxHeight = Math.max(wrapped1.length, wrapped2.length, wrapped3.length);
    const lines1 = padLines(wrapped1, maxHeight);
    const lines2 = padLines(wrapped2, maxHeight);
    const lines3 = padLines(wrapped3, maxHeight);

    let diagram =
      '            \u250c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u253c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510\n';
    diagram += '            \u2502            \u2502            \u2502\n';
    diagram += `      \u2554${'═'.repeat(width1 + 2)}\u2557 \u2554${'═'.repeat(width2 + 2)}\u2557 \u2554${'═'.repeat(width3 + 2)}\u2557\n`;

    for (let i = 0; i < maxHeight; i++) {
      const c1 = centerText(lines1[i], width1);
      const c2 = centerText(lines2[i], width2);
      const c3 = centerText(lines3[i], width3);
      diagram += `      \u2551 ${c1} \u2551 \u2551 ${c2} \u2551 \u2551 ${c3} \u2551\n`;
    }

    diagram += `      \u2552${'═'.repeat(width1 + 2)}\u2555 \u2552${'═'.repeat(width2 + 2)}\u2555 \u2552${'═'.repeat(width3 + 2)}\u2555\n`;
    diagram +=
      '            \u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u253c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518\n';
    diagram += '                         \u2502\n';
    return diagram;
  }

  const countText = `${services.length} Services`;
  return buildServiceBox(countText, boxWidth) + '                         \u2502\n';
}

export function generateTopologyASCII(options: ASCIIOptions): string {
  const { services, dnsProvider, proxyProvider, dnsConfigured, proxyConfigured } = options;
  const dnsName = dnsProvider ? getProviderDisplayName(dnsProvider) : 'DNS Not Set';
  const proxyName = proxyProvider ? getProviderDisplayName(proxyProvider) : 'Proxy Not Set';
  const check = '\u2713';
  const cross = '\u2717';

  const dnsStatus = dnsConfigured ? check : cross;
  const proxyStatus = proxyConfigured ? check : cross;
  const internetStatus = dnsConfigured && proxyConfigured ? check : cross;
  const boxWidth = 38;
  const headerIndent = '        ';
  const headerWidth = boxWidth - 2;

  const topBorder = `${headerIndent}\u250f${'━'.repeat(headerWidth)}\u2513\n`;
  const titleText = 'autoxpose Network Topology';
  const titlePadding = headerWidth - titleText.length;
  const titleLeftPad = Math.floor(titlePadding / 2);
  const titleRightPad = titlePadding - titleLeftPad;
  const title = `${headerIndent}\u2503${' '.repeat(titleLeftPad)}${titleText}${' '.repeat(titleRightPad)}\u2503\n`;
  const bottomBorder = `${headerIndent}\u2517${'━'.repeat(headerWidth)}\u251b\n`;

  let header = topBorder + title + bottomBorder;
  header += '                         \u2502\n';

  let diagram = buildFlowBox('Docker', boxWidth);
  diagram += '                         \u2502\n';

  diagram += generateServicesASCII(services);

  const dnsLabel = `${dnsName} DNS ${dnsStatus}`;
  const proxyLabel = `${proxyName} Proxy ${proxyStatus}`;
  const internetLabel = `Internet ${internetStatus}`;

  diagram += buildFlowBox(dnsLabel, boxWidth);
  diagram += '                         \u2502\n';
  diagram += buildFlowBox(proxyLabel, boxWidth);
  diagram += '                         \u2502\n';
  diagram += buildFlowBox(internetLabel, boxWidth);

  return header + diagram + '\ngithub.com/mostafa-wahied/autoxpose';
}
