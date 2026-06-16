import assert from "node:assert/strict";
import { addressCandidates, phoneCandidates } from "../dist/trust-signals-audit.js";

const contactText = `
  Contact Us Office Address 1 and 2 Floor Khykha Court II 82 Stage 2 Block Hosur
  Main road, Koramangala, Bangalore, Karnataka, India 560034
  Our Email service@payrupikloan.in Call Center 022489-30118
  Plugin version 3.23.0 - 25-07-2024
`;

assert.deepEqual(phoneCandidates(contactText), ["022489-30118"]);

assert.equal(
  addressCandidates(contactText)[0],
  "1 and 2 Floor Khykha Court II 82 Stage 2 Block Hosur Main road, Koramangala, Bangalore, Karnataka, India 560034"
);

console.log("trust signals helper tests passed");
