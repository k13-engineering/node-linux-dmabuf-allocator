import { createDmabufHeapFactory, type TDmabufHeap } from "./dmabuf-heap.ts";
import type { TDmabufHeapKernelInterface } from "../kernel-interface.ts";

const findDefaultDmabufHeapDevFolder = (): string => {
  return "/dev/dma_heap";
};

type TDmabufHeapInfo = {
  name: string;
  properties: {
    physicalMemory: {
      contiguous: boolean | undefined;
    },
    cachable: boolean | undefined;
    protected: boolean | undefined;
  }
};

type TDmabufHeapPropertySpecification = "required" | "preferred" | "optional" | "forbidden";
type TDmabufHeapSpecification = {
  physicalMemory: {
    contiguous: TDmabufHeapPropertySpecification;
  },
  cachable: TDmabufHeapPropertySpecification;
  protected: TDmabufHeapPropertySpecification;
};

const wellKnownHeapPropertiesByName: { [key: string]: TDmabufHeapInfo["properties"] } = {
  // eslint-disable-next-line quote-props
  "system": {
    physicalMemory: {
      contiguous: false
    },
    cachable: true,
    protected: false
  },
  // eslint-disable-next-line quote-props
  "default_cma_region": {
    physicalMemory: {
      contiguous: true
    },
    cachable: true,
    protected: false
  }
};

const heapInfoByName = ({ name }: { name: string }): TDmabufHeapInfo => {
  const wellKnownProperties = wellKnownHeapPropertiesByName[name];
  if (wellKnownProperties === undefined) {
    return {
      name,
      properties: {
        physicalMemory: {
          contiguous: undefined
        },
        cachable: undefined,
        protected: undefined
      }
    };
  }

  return {
    name,
    properties: wellKnownProperties
  };
};

const createDmabufHeapManager = ({
  dmabufHeapDevFolder,
  kernelInterface
}: {
  dmabufHeapDevFolder: string,
  kernelInterface: TDmabufHeapKernelInterface
}) => {

  const heapFactory = createDmabufHeapFactory({ kernelInterface });

  const findAvailableDmabufHeapInfos = (): TDmabufHeapInfo[] => {
    const { errno, entries } = kernelInterface.readdir({ path: dmabufHeapDevFolder });
    if (errno !== undefined) {
      throw Error(`failed to read dmabuf heap dev folder ${dmabufHeapDevFolder}, errno ${errno}`);
    }

    const infos = entries.map((entryName) => {
      return heapInfoByName({ name: entryName });
    });

    return infos;
  };

  try {
    findAvailableDmabufHeapInfos();
  } catch (ex) {
    throw Error("valid dmabuf heap dev folder required to create dmabuf heap manager, look before you leap", { cause: ex });
  }

  const findDmabufHeapInfosBySpecification = ({
    specification
  }: {
    specification: TDmabufHeapSpecification
  }) => {
    const availableHeaps = findAvailableDmabufHeapInfos();

    // eslint-disable-next-line complexity, max-statements
    const matchingHeaps = availableHeaps.filter((heapInfo) => {
      const props = heapInfo.properties;

      // physicalMemory.contiguous
      const contiguousSpec = specification.physicalMemory.contiguous;
      if (contiguousSpec === "required" && props.physicalMemory.contiguous !== true) {
        return false;
      }
      if (contiguousSpec === "forbidden" && props.physicalMemory.contiguous === true) {
        return false;
      }

      // cachable
      const cachableSpec = specification.cachable;
      if (cachableSpec === "required" && props.cachable !== true) {
        return false;
      }
      if (cachableSpec === "forbidden" && props.cachable === true) {
        return false;
      }

      // protected
      const protectedSpec = specification.protected;
      if (protectedSpec === "required" && props.protected !== true) {
        return false;
      }
      if (protectedSpec === "forbidden" && props.protected === true) {
        return false;
      }

      return true;
    });

    return matchingHeaps;
  };

  type TOpenByNameResult = {
    error: Error,
    dmabufHeap: undefined
  } | {
    error: undefined,
    dmabufHeap: TDmabufHeap
  };

  const O_RDWR = 0x02;
  const O_CLOEXEC = 0x80000;

  const ENOENT = 2;
  const EACCES = 13;

  const createOpenErrorByErrno = ({ errno, dmabufHeapPath }: { errno: number, dmabufHeapPath: string }): Error => {

    if (errno === ENOENT) {
      return Error(`dmabuf heap at "${dmabufHeapPath}" does not exist`);
    }

    if (errno === EACCES) {
      return Error(`permission denied opening dmabuf heap at "${dmabufHeapPath}", your process may lack required privileges`);
    }

    return Error(`open dmabuf heap at "${dmabufHeapPath}" failed, errno ${errno}`);
  };

  const openDmabufHeapByName = ({ name }: { name: string }): TOpenByNameResult => {

    const dmabufHeapPath = `${dmabufHeapDevFolder}/${name}`;

    const { errno: openErrno, fd: dmabufHeapFd } = kernelInterface.open({
      path: dmabufHeapPath,
      flags: O_RDWR | O_CLOEXEC
    });

    if (openErrno !== undefined) {
      return {
        error: createOpenErrorByErrno({ errno: openErrno, dmabufHeapPath }),
        dmabufHeap: undefined
      };
    }

    try {
      const dmabufHeap = heapFactory.openDmabufHeapAllocatorByDuppingFd({
        dmabufHeapFd
      });

      return {
        error: undefined,
        dmabufHeap
      };
    } finally {
      kernelInterface.close({ fd: dmabufHeapFd });
    }

  };

  return {
    findAvailableDmabufHeapInfos,
    findDmabufHeapInfosBySpecification,
    openDmabufHeapByName
  };
};

type TDmabufHeapManager = ReturnType<typeof createDmabufHeapManager>;

export {
  findDefaultDmabufHeapDevFolder,
  createDmabufHeapManager
};

export type {
  TDmabufHeapManager,
};
