import { useEffect, useRef } from "react";
import type { SessionSnapshot } from "../../types/session";

type UseSessionSnapshotParams = {
  snapshot: SessionSnapshot;
  onSnapshot: (snapshot: SessionSnapshot) => void;
};

export function useSessionSnapshot({ snapshot, onSnapshot }: UseSessionSnapshotParams) {
  const snapshotRef = useRef("");

  useEffect(() => {
    const serialized = JSON.stringify(snapshot);
    if (serialized !== snapshotRef.current) {
      snapshotRef.current = serialized;
      onSnapshot(snapshot);
    }
  }, [snapshot, onSnapshot]);
}
