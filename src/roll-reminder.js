import { useEffect, useState } from "react";
import "./roll-reminder.css";

export function useRollReminder(ready) {
  const [remind, setRemind] = useState(false);
  useEffect(() => {
    if (!ready) {
      setRemind(false);
      return;
    }
    const timer = setTimeout(() => setRemind(true), 5000);
    return () => clearTimeout(timer);
  }, [ready]);
  return ready && remind;
}
