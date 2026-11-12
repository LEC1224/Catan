import { createLucideIcon } from "lucide-react";

export const Sheep = createLucideIcon("Sheep", [
  ["path", {
    key: "fleece",
    d: "M15.5 8C15.3 5.1 12.4 3.9 10.5 5.9 9.1 3.4 5.7 4.2 5.1 7 2.3 7.1 1.3 10.1 3.2 12 1.7 14.4 4 17.4 6.4 16.1 7.6 18.2 10.2 18.4 11.8 16.5 13.8 17.3 15.5 16.1 15.5 14Z",
  }],
  ["path", { key: "head", d: "M15.5 8 17 5.5Q19 5.8 19.5 8.5L21.6 11.2Q22.5 12.7 21 13.6 20.5 14 19 14H15.5" }],
  ["path", { key: "legs", d: "M6.5 16.7V20.5M13 16.7V20.5" }],
  ["circle", { key: "eye", cx: 18.3, cy: 10.4, r: 0.8, fill: "currentColor", stroke: "none" }],
]);
