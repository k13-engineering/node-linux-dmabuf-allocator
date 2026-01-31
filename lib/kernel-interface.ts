/* c8 ignore start */
type TDmabufHeapKernelInterface = {
  endianness: "LE" | "BE";
  determinePageSize: () => number;
  ioctl: (args: { fd: number; request: bigint, arg: Uint8Array }) => { errno: undefined, ret: bigint } | { errno: number, ret: undefined };
  dup: (args: { fd: number }) => number;
  close: (args: { fd: number }) => void;

  // dmabuf heap listing
  readdir: ({ path }: { path: string }) => { errno: undefined, entries: string[] } | { errno: number, entries: undefined };
  open: (args: { path: string, flags: number }) => { errno: undefined, fd: number } | { errno: number, fd: undefined };

  // udmabuf allocator
  fcntl: (args: { fd: number; cmd: number; arg: number }) => { errno: undefined } | { errno: number };
  memfd_create: (args: { name: string; flags: number }) => { errno: undefined, memfd: number } | { errno: number, memfd: undefined };
  ftruncate: (args: { fd: number; length: number }) => { error: undefined } | { error: Error };
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

type TDmabufUdmabufAllocatorKernelInterface = Pick<TDmabufHeapKernelInterface,
  "endianness" |
  "determinePageSize" |
  "fcntl" |
  "memfd_create" |
  "ftruncate" |
  "ioctl" |
  "close"
>;

export type {
  TDmabufHeapKernelInterface,
  TDmabufHeapAllocatorKernelInterface,
  TDmabufHeapIoctlKernelInterface,
  TDmabufUdmabufAllocatorKernelInterface
};
/* c8 ignore stop */
