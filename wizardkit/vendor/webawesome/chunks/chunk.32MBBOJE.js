/*! Copyright 2026 Fonticons, Inc. - https://webawesome.com/license */
import {
  WaOtpInput
} from "./chunk.QOAPQ5KN.js";

// src/react/otp-input/index.ts
import { createComponent } from "@lit/react";
import * as React from "react";
import "@lit/react";
var tagName = "wa-otp-input";
var reactWrapper = createComponent({
  tagName,
  elementClass: WaOtpInput,
  react: React,
  events: {
    onWaComplete: "wa-complete",
    onWaClear: "wa-clear",
    onWaInvalid: "wa-invalid"
  },
  displayName: "WaOtpInput"
});
var otp_input_default = reactWrapper;

export {
  otp_input_default
};
