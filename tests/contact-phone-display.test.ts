import assert from "node:assert/strict";
import test from "node:test";

import { contactPhoneDisplay } from "../lib/contactPhoneDisplay";

test("shows the contact's international dial code separately from the national number", () => {
  assert.deepEqual(contactPhoneDisplay("+44 20 7946 0958"), {
    countryAndCode: "🇬🇧  +44",
    nationalNumber: "207 946 0958",
  });
});

test("uses the contact's own country to disambiguate a shared +1 dial code", () => {
  assert.deepEqual(
    contactPhoneDisplay("+1 416 555 0198", { location: "Toronto, Canada" }),
    {
      countryAndCode: "🇨🇦  +1",
      nationalNumber: "416 555 0198",
    }
  );
});

test("can recover a missing dialing code from the contact's enriched country", () => {
  assert.deepEqual(
    contactPhoneDisplay("20 7946 0958", { country: "United Kingdom" }),
    {
      countryAndCode: "🇬🇧  +44",
      nationalNumber: "207 946 0958",
    }
  );
});
