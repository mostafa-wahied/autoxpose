export interface ChangeInfo {
  version: number;
  lastChange: number;
}

export class ChangeTracker {
  private version: number = 0;
  private lastChange: number = Date.now();

  increment(): void {
    this.version++;
    this.lastChange = Date.now();
  }

  getInfo(): ChangeInfo {
    return {
      version: this.version,
      lastChange: this.lastChange,
    };
  }
}
