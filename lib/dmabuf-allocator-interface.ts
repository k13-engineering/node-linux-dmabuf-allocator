/* c8 ignore start */
type TDmabufAllocateArgs = {
  size: number;
};

type TDmabufAllocateResult = {
  error: Error;
  dmabufFd: undefined;
} | {
  error: undefined;
  dmabufFd: number;
};

type TDmabufAllocator = {
  allocate: (args: TDmabufAllocateArgs) => TDmabufAllocateResult;
  pageSize: number;
  determineOptimalAllocationSize: (args: { minimumSize: number }) => number;
};

export type {
  TDmabufAllocator
};
/* c8 ignore end */
