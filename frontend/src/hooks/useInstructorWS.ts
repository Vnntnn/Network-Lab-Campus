import { useEffect, useRef } from "react";
import { useInstructorStore, type PushEvent } from "@/stores/instructorStore";
import { buildWsUrl } from "@/api/ws";

export function useInstructorWS() {
  const pin = useInstructorStore((s) => s.pin);
  const authed = useInstructorStore((s) => s.authed);
  const setAuthed = useInstructorStore((s) => s.setAuthed);
  const setStatus = useInstructorStore((s) => s.setStatus);
  const addEvent = useInstructorStore((s) => s.addEvent);

  const ws = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!authed) return;

    setStatus("connecting");
    const socket = new WebSocket(buildWsUrl("/api/v1/instructor/ws"));
    ws.current = socket;

    socket.onopen = () => {
      socket.send(JSON.stringify({ pin }));
    };

    socket.onmessage = (event) => {
      const msg = JSON.parse(event.data) as { ok?: boolean; error?: string; type?: string };
      if (msg.ok) {
        setStatus("authed");
        return;
      }
      if (msg.error) {
        setStatus("error");
        setAuthed(false);
        socket.close();
        return;
      }
      if (msg.type === "push") {
        addEvent(msg as PushEvent);
      }
    };

    socket.onerror = () => {
      setStatus("error");
      setAuthed(false);
    };

    socket.onclose = () => {
      setStatus("disconnected");
    };

    return () => {
      socket.close();
      ws.current = null;
    };
  }, [authed, pin, setAuthed, setStatus, addEvent]);
}
