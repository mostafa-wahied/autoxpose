import { ConfirmDialog } from '../../components/terminal';
import { type ServiceRecord } from '../../lib/api';

export type ConfirmAction =
  | { type: 'expose-all' }
  | { type: 'unexpose-all' }
  | { type: 'delete'; service: ServiceRecord }
  | null;

interface ConfirmDialogsProps {
  action: ConfirmAction;
  serviceCount: number;
  exposedCount: number;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialogs({
  action,
  serviceCount,
  exposedCount,
  onConfirm,
  onCancel,
}: ConfirmDialogsProps): JSX.Element {
  const unexposedCount = serviceCount - exposedCount;
  const deleteName = action?.type === 'delete' ? action.service.name : '';

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
        title="Delete Service"
        message={`Remove "${deleteName}" from tracking? This will also unexpose it if exposed.`}
        confirmText="Delete"
        variant="danger"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    </>
  );
}
