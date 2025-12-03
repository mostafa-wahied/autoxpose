import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { AddServiceModal } from '../components/add-service-modal';
import { ServiceRow } from '../components/service-row';
import { ServicesEmptyState } from '../components/services-empty';
import { ServicesHeader } from '../components/services-header';
import { ServicesTable } from '../components/services-table';
import { api } from '../lib/api';

export function Services(): JSX.Element {
  const [showModal, setShowModal] = useState(false);
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ['services'],
    queryFn: api.services.list,
  });

  if (isLoading)
    return <div className="flex h-64 items-center justify-center text-neutral-500">Loading...</div>;
  if (error)
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
        Failed to load
      </div>
    );

  const services = data?.services || [];
  const openModal = (): void => setShowModal(true);
  const closeModal = (): void => setShowModal(false);
  const refresh = (): void => {
    queryClient.invalidateQueries({ queryKey: ['services'] });
  };

  return (
    <div>
      <ServicesHeader onAdd={openModal} />
      {services.length === 0 ? (
        <ServicesEmptyState onAdd={openModal} />
      ) : (
        <ServicesTable>
          {services.map(s => (
            <ServiceRow key={s.id} service={s} />
          ))}
        </ServicesTable>
      )}
      {showModal && <AddServiceModal onClose={closeModal} onSuccess={refresh} />}
    </div>
  );
}
