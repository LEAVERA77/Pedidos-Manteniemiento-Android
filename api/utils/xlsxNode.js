// SheetJS recomienda el build CommonJS en Node: incluye filesystem y codepages.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
export default require("xlsx");
