import { useCallback, useEffect, useRef } from "react";
import socket from "../services/socket";

const CODE_SYNC_INTERVAL_MS = 75;

function useCodeSync() {
  const lastSentAtRef = useRef(0);
  const pendingCodeRef = useRef();
  const timeoutRef = useRef();

  const sendPendingCode = useCallback(() => {
    if (pendingCodeRef.current === undefined) {
      return;
    }

    socket.emit("code-change", pendingCodeRef.current);
    pendingCodeRef.current = undefined;
    lastSentAtRef.current = Date.now();
    timeoutRef.current = undefined;
  }, []);

  const emitCodeChange = useCallback(
    (code) => {
      const elapsed = Date.now() - lastSentAtRef.current;

      if (elapsed >= CODE_SYNC_INTERVAL_MS && !timeoutRef.current) {
        socket.emit("code-change", code);
        lastSentAtRef.current = Date.now();
        return;
      }

      pendingCodeRef.current = code;

      if (!timeoutRef.current) {
        timeoutRef.current = window.setTimeout(
          sendPendingCode,
          Math.max(CODE_SYNC_INTERVAL_MS - elapsed, 0),
        );
      }
    },
    [sendPendingCode],
  );

  useEffect(
    () => () => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }

      sendPendingCode();
    },
    [sendPendingCode],
  );

  return emitCodeChange;
}

export default useCodeSync;
