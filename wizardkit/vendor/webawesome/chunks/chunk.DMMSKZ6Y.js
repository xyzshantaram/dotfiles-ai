/*! Copyright 2026 Fonticons, Inc. - https://webawesome.com/license */
import {
  WaPagination
} from "./chunk.Z7M3UHNZ.js";

// src/react/pagination/index.ts
import { createComponent } from "@lit/react";
import * as React from "react";
import "@lit/react";
var tagName = "wa-pagination";
var reactWrapper = createComponent({
  tagName,
  elementClass: WaPagination,
  react: React,
  events: {
    onWaBeforePageChange: "wa-before-page-change",
    onWaPageChange: "wa-page-change"
  },
  displayName: "WaPagination"
});
var pagination_default = reactWrapper;

export {
  pagination_default
};
