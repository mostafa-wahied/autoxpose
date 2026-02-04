import { useState } from 'react';
import { type SettingsStatus, type WildcardConfig, type WildcardDetection } from '../../../lib/api';
import { DnsEditForm, DnsDisplay, DNS_PROVIDERS } from './dns-form';
import {
  DnsDisabledState,
  DnsHeader,
  WildcardChoiceSection,
  WildcardModeDisplay,
} from './dns-wildcard';

export { DNS_PROVIDERS };

interface DnsConfigSectionProps {
  current: SettingsStatus['dns'] | null;
  proxyConfigured?: boolean;
  wildcardConfig?: WildcardConfig | null;
  wildcardDetection?: WildcardDetection | null;
}

export function DnsConfigSection({
  current,
  proxyConfigured = true,
  wildcardConfig,
  wildcardDetection,
}: DnsConfigSectionProps): JSX.Element {
  const [isEditing, setIsEditing] = useState(false);
  const isWildcardMode = wildcardConfig?.enabled ?? false;
  const isConfigured = current?.configured ?? false;
  const showDnsForm = !isWildcardMode && (isEditing || !isConfigured);

  if (!proxyConfigured) {
    return <DnsDisabledState />;
  }

  if (isWildcardMode) {
    return (
      <WildcardModeDisplay wildcardConfig={wildcardConfig} wildcardDetection={wildcardDetection} />
    );
  }

  return (
    <div className="rounded border border-[#30363d] bg-[#161b22] p-4">
      <DnsHeader
        isConfigured={isConfigured}
        isEditing={isEditing}
        isWildcardMode={false}
        onEdit={() => setIsEditing(true)}
      />
      {!isConfigured && wildcardDetection && (
        <WildcardChoiceSection wildcardDetection={wildcardDetection} />
      )}
      {showDnsForm ? (
        <DnsEditForm current={current} onDone={() => setIsEditing(false)} />
      ) : (
        <DnsDisplay current={current} />
      )}
    </div>
  );
}
