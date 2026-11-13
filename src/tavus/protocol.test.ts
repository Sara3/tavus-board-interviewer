import { describe, expect, it } from "vitest";
import { parseToolCall } from "./protocol";

describe("parseToolCall", () => {
  it("parses the docs shape with stringified arguments", () => {
    expect(parseToolCall({ event_type: "conversation.tool_call", properties: { name: "set_stage", arguments: '{"stage":"api"}', tool_call_id: "c1" } }))
      .toEqual({ name: "set_stage", args: { stage: "api" }, id: "c1" });
  });
  it("parses the event-schema shape", () => {
    expect(parseToolCall({ event_type: "conversation.tool_call", function: { name: "read_board", arguments: "{}" } }))
      .toEqual({ name: "read_board", args: {}, id: undefined });
  });
  it("parses the skills-repo shape with object arguments", () => {
    expect(parseToolCall({ event_type: "conversation.tool_call", properties: { tool_name: "show_list", arguments: { title: "x", items: [] } } }))
      .toMatchObject({ name: "show_list", args: { title: "x", items: [] } });
  });
  it("maps dashboard-renamed _legacy tools back to the app's names", () => {
    expect(parseToolCall({ event_type: "conversation.tool_call", properties: { name: "read_board_legacy", arguments: "{}", tool_call_id: "x" } })?.name).toBe("read_board");
  });
  it("ignores other events", () => {
    expect(parseToolCall({ event_type: "conversation.utterance" })).toBeNull();
  });
});

import { echo as echoMsg } from "./protocol";
describe("echo", () => {
  it("makes the replica say fixed text", () => {
    expect(echoMsg("c1", "Two minutes left.")).toEqual({ message_type: "conversation", event_type: "conversation.echo", conversation_id: "c1", properties: { modality: "text", text: "Two minutes left." } });
  });
});
