declare module '@ovhcloud/node-ovh' {
  interface OvhClient {
    request(
      method: string,
      path: string,
      callback: (error: { error: number; message: string } | null, result: unknown) => void
    ): void;
    request(
      method: string,
      path: string,
      body: unknown,
      callback: (error: { error: number; message: string } | null, result: unknown) => void
    ): void;
    requestPromised(method: string, path: string, body?: unknown): Promise<unknown>;
  }

  interface OvhOptions {
    endpoint?: string;
    appKey?: string;
    appSecret?: string;
    consumerKey?: string;
    clientID?: string;
    clientSecret?: string;
  }

  function ovh(options: OvhOptions): OvhClient;
  export default ovh;
}
