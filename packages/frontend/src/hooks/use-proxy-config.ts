import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { api, type ProviderStatus } from '../lib/api';

type ProxyConfigReturn = {
  provider: string;
  setProvider: Dispatch<SetStateAction<string>>;
  url: string;
  setUrl: Dispatch<SetStateAction<string>>;
  username: string;
  setUsername: Dispatch<SetStateAction<string>>;
  password: string;
  setPassword: Dispatch<SetStateAction<string>>;
  mutation: UseMutationResult<{ success: boolean }, Error, void, unknown>;
};

export function useProxyConfig(current: ProviderStatus | null): ProxyConfigReturn {
  const [provider, setProvider] = useState(current?.provider || 'npm');
  const [url, setUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const qc = useQueryClient();

  useEffect(() => {
    if (current?.provider) setProvider(current.provider);
    if (current?.config) {
      setUrl(current.config.url || '');
      setUsername(current.config.username || '');
    }
  }, [current]);

  const mutation = useMutation({
    mutationFn: () => api.settings.saveProxy(provider, { url, username, password }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] });
      setPassword('');
    },
  });

  return {
    provider,
    setProvider,
    url,
    setUrl,
    username,
    setUsername,
    password,
    setPassword,
    mutation,
  };
}
