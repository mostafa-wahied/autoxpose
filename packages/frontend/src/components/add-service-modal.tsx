import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../lib/api';
import { FormButtons } from './form-buttons';
import { FormInput } from './form-input';
import { FormSelect } from './form-select';
import { Modal } from './modal';

interface Props {
  onClose: () => void;
  onSuccess: () => void;
}

const SCHEMES = [
  { value: 'http', label: 'HTTP' },
  { value: 'https', label: 'HTTPS' },
];

export function AddServiceModal({ onClose, onSuccess }: Props): JSX.Element {
  const [name, setName] = useState('');
  const [domain, setDomain] = useState('');
  const [port, setPort] = useState('');
  const [scheme, setScheme] = useState('http');

  const mutation = useMutation({
    mutationFn: () => api.services.create({ name, domain, port: parseInt(port, 10), scheme }),
    onSuccess: () => {
      onSuccess();
      onClose();
    },
  });

  return (
    <Modal title="Add Service" onClose={onClose}>
      <form
        onSubmit={e => {
          e.preventDefault();
          mutation.mutate();
        }}
        className="space-y-4"
      >
        <FormInput label="Name" value={name} onChange={setName} required />
        <FormInput
          label="Domain"
          value={domain}
          onChange={setDomain}
          placeholder="app.example.com"
          required
        />
        <div className="grid grid-cols-2 gap-4">
          <FormInput label="Port" value={port} onChange={setPort} type="number" required />
          <FormSelect label="Scheme" value={scheme} onChange={setScheme} options={SCHEMES} />
        </div>
        {mutation.error && <p className="text-sm text-red-600">{String(mutation.error)}</p>}
        <FormButtons
          onCancel={onClose}
          isPending={mutation.isPending}
          submitLabel="Add Service"
          pendingLabel="Adding..."
        />
      </form>
    </Modal>
  );
}
