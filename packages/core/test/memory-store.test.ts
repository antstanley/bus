import { storeConformance } from "./store-conformance.ts";
import { MemoryStore } from "../src/index.ts";

storeConformance("memory", () => ({ store: new MemoryStore() }));
