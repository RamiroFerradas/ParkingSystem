// Shared setup for every vitest unit test (jsdom environment).
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// React Testing Library does not auto-cleanup when `globals` is off.
afterEach(() => {
  cleanup();
});
