import { dlopen, FFIType, ptr } from "bun:ffi";

const isDarwin = process.platform === "darwin";
const libPath = isDarwin ? "libSystem.B.dylib" : "libc.so.6";

// macOS: 0x80087467, Linux: 0x5414
const TIOCSWINSZ = isDarwin ? 0x80087467n : 0x5414n;

const libc = dlopen(libPath, {
  openpty: {
    args: [FFIType.ptr, FFIType.ptr, FFIType.ptr, FFIType.ptr, FFIType.ptr],
    returns: FFIType.i32,
  },
  close: {
    args: [FFIType.i32],
    returns: FFIType.i32,
  },
  ioctl: {
    args: [FFIType.i32, FFIType.u64, FFIType.ptr],
    returns: FFIType.i32,
  },
});

export interface PTYSession {
  masterFd: number;
  slaveFd: number;
  resize: (rows: number, cols: number) => void;
  closeSlave: () => void;
  close: () => void;
}

/**
 * Creates a native pseudo-terminal pair via POSIX openpty.
 */
export function createPTY(rows = 24, cols = 80): PTYSession {
  const masterBuf = new Int32Array(1);
  const slaveBuf = new Int32Array(1);
  const winBuf = new Uint16Array([rows, cols, 0, 0]);

  const ret = libc.symbols.openpty(
    ptr(masterBuf),
    ptr(slaveBuf),
    null,
    null,
    ptr(winBuf)
  );

  if (ret !== 0) {
    throw new Error(`Failed to open PTY, errno=${ret}`);
  }

  const masterFd = masterBuf[0];
  const slaveFd = slaveBuf[0];
  let masterClosed = false;
  let slaveClosed = false;

  const closeSlave = () => {
    if (!slaveClosed && slaveFd >= 0) {
      slaveClosed = true;
      try {
        libc.symbols.close(slaveFd);
      } catch {}
    }
  };

  const closeMaster = () => {
    if (!masterClosed && masterFd >= 0) {
      masterClosed = true;
      try {
        libc.symbols.close(masterFd);
      } catch {}
    }
  };

  return {
    masterFd,
    slaveFd,
    resize: (newRows: number, newCols: number) => {
      winBuf[0] = newRows;
      winBuf[1] = newCols;
      libc.symbols.ioctl(masterFd, TIOCSWINSZ, ptr(winBuf));
    },
    closeSlave,
    close: () => {
      closeSlave();
      closeMaster();
    },
  };
}
