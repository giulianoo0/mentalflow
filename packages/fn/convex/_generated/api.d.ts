/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as chat from "../chat.js";
import type * as flows from "../flows.js";
import type * as http from "../http.js";
import type * as lib_widget_utils from "../lib/widget_utils.js";
import type * as maintenance from "../maintenance.js";
import type * as messages from "../messages.js";
import type * as users from "../users.js";
import type * as voice from "../voice.js";
import type * as widgetLinks from "../widgetLinks.js";
import type * as widgets from "../widgets.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  chat: typeof chat;
  flows: typeof flows;
  http: typeof http;
  "lib/widget_utils": typeof lib_widget_utils;
  maintenance: typeof maintenance;
  messages: typeof messages;
  users: typeof users;
  voice: typeof voice;
  widgetLinks: typeof widgetLinks;
  widgets: typeof widgets;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
