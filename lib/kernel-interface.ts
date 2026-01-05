/* c8 ignore start */
type TDmabufHeapKernelInterface = {
  endianness: "LE" | "BE";
  determinePageSize: () => number;
  ioctl: (args: { fd: number; request: bigint, arg: Uint8Array }) => { errno: undefined | number };
  dup: (args: { fd: number }) => number;
  close: (args: { fd: number }) => void;

  // dmabuf heap listing
  readdir: ({ path }: { path: string }) => { errno: undefined, entries: string[] } | { errno: number, entries: undefined };
  open: (args: { path: string, flags: number }) => { errno: undefined, fd: number } | { errno: number, fd: undefined };
};

type TDmabufHeapAllocatorKernelInterface = Pick<TDmabufHeapKernelInterface,
  "endianness" |
  "determinePageSize" |
  "ioctl" |
  "dup" |
  "close"
>;

type TDmabufHeapIoctlKernelInterface = Pick<TDmabufHeapKernelInterface,
  "endianness" |
  "ioctl"
>;

export type {
  TDmabufHeapKernelInterface,
  TDmabufHeapAllocatorKernelInterface,
  TDmabufHeapIoctlKernelInterface
};
/* c8 ignore stop */
