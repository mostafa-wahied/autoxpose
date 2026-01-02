import { useState } from 'react';
import { ConfirmDialog } from '../../components/terminal';
import { type ServiceRecord } from '../../lib/api';

export type ConfirmAction =
  | { type: 'expose-all' }
  | { type: 'unexpose-all' }
  | { type: 'delete'; service: ServiceRecord; shouldUnexpose?: boolean }
  | null;

interface ConfirmDialogsProps {
  action: ConfirmAction;
  serviceCount: number;
  exposedCount: number;
  onConfirm: () => void;
  onCancel: () => void;
  onUnexposeChange?: (shouldUnexpose: boolean) => void;
}

export function ConfirmDialogs({
  action,
  serviceCount,
  exposedCount,
  onConfirm,
  onCancel,
  onUnexposeChange,
}: ConfirmDialogsProps): JSX.Element {
  const unexposedCount = serviceCount - exposedCount;
  const deleteName = action?.type === 'delete' ? action.service.name : '';
  const hasResources =
    action?.type === 'delete' &&
    (action.service.dnsRecordId !== null || action.service.proxyHostId !== null);
  const defaultUnexpose = hasResources ? true : false;
  const [unexposeChecked, setUnexposeChecked] = useState(defaultUnexpose);

  const handleUnexposeChange = (checked: boolean): void => {
    setUnexposeChecked(checked);
    onUnexposeChange?.(checked);
  };

  const deleteMessage = hasResources
    ? `"${deleteName}" is currently exposed. Uncheck to keep it accessible.`
    : `Remove "${deleteName}" from tracking?`;

  return (
    <>
      <ConfirmDialog
        isOpen={action?.type === 'expose-all'}
        title="Expose All Services"
        message={`This will expose ${unexposedCount} service(s) to the internet. Continue?`}
        confirmText="Expose All"
        variant="default"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
      <ConfirmDialog
        isOpen={action?.type === 'unexpose-all'}
        title="Unexpose All Services"
        message={`This will unexpose ${exposedCount} service(s) from the internet. Continue?`}
        confirmText="Unexpose All"
        variant="warning"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
      <ConfirmDialog
        isOpen={action?.type === 'delete'}
        title="Remove Service"
        message={deleteMessage}
        confirmText="Remove"
        variant="danger"
        showCheckbox={hasResources}
        checkboxLabel="Also remove DNS record and proxy host"
        checkboxChecked={unexposeChecked}
        onCheckboxChange={handleUnexposeChange}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    </>
  );
}
