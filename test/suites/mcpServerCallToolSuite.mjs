import test from "#test/runner";
import assert from "#test/assert";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { assertToolUnsupported } from "../helpers/toolAssertions.mjs";
import { getChargenGlyphs } from "../../src/chargen.js";

function getTextContent(result) {
  return result.content.find((entry) => entry.type === "text");
}

const CHAR_TO_SCREEN = (() => {
  const map = new Map();
  for (const glyph of getChargenGlyphs()) {
    if (!glyph || typeof glyph.screenCode !== "number") {
      continue;
    }
    if (glyph.basic && glyph.basic.length === 1 && !map.has(glyph.basic)) {
      map.set(glyph.basic, glyph.screenCode & 0xff);
    }
    const ascii = String.fromCharCode(glyph.petsciiCode & 0xff);
    if (!map.has(ascii)) {
      map.set(ascii, glyph.screenCode & 0xff);
    }
  }
  if (!map.has(" ")) {
    map.set(" ", 0x20);
  }
  return map;
})();

const SPACE_SCREEN_CODE = CHAR_TO_SCREEN.get(" ") ?? 0x20;

function writeScreenTextAsCodes(state, row, column, text) {
  const columns = 40;
  const base = 0x0400 + (row * columns) + column;
  const screenEnd = 0x0400 + 0x03e8;
  const rowStart = 0x0400 + (row * columns);
  state.memory.fill(SPACE_SCREEN_CODE, rowStart, rowStart + columns);
  for (let i = 0; i < text.length; i += 1) {
    const code = CHAR_TO_SCREEN.get(text[i]) ?? SPACE_SCREEN_CODE;
    const offset = base + i;
    if (offset >= 0x0400 && offset < screenEnd) {
      state.memory[offset] = code;
    }
  }
}

function toolIsAvailable(ctx, toolName) {
  if (typeof ctx.isToolSupported === "function") {
    try {
      return ctx.isToolSupported(toolName);
    } catch {
      return false;
    }
  }
  return true;
}

function assertUnsupportedOperation(result, platform, expectedTool) {
  assert.equal(result.isError, true);
  assert.equal(result.metadata?.error?.kind, "execution");
  assert.equal(result.metadata?.error?.code, "unsupported_platform");
  assert.equal(result.metadata?.error?.details?.platform, platform);
  if (expectedTool) {
    assert.equal(result.metadata?.error?.details?.tool, expectedTool);
  }
}

async function callTool(ctx, toolName, args) {
  const supported = toolIsAvailable(ctx, toolName);
  const result = await ctx.client.request(
    {
      method: "tools/call",
      params: {
        name: toolName,
        arguments: args,
      },
    },
    CallToolResultSchema,
  );

  if (!supported) {
    assertToolUnsupported(result, toolName, ctx.platform);
  }

  return { result, supported };
}

export function registerMcpServerCallToolTests(withSharedMcpClient) {
  test("CallTool returns structured error for unknown tools", async () => {
    await withSharedMcpClient(async ({ client }) => {
      const result = await client.request(
        {
          method: "tools/call",
          params: {
            name: "nonexistent_tool",
          },
        },
        CallToolResultSchema,
      );

      assert.ok(Array.isArray(result.content), "CallTool result should contain content array");
      assert.ok(result.content.length > 0, "CallTool result should include at least one message");

      const first = getTextContent(result);
      assert.ok(first, "Expected text response content");
      assert.equal(first.type, "text");
      assert.match(first.text, /Unknown tool/i);

      assert.ok(result.metadata, "CallTool result should include metadata for errors");
      assert.ok(result.metadata?.error, "Metadata should expose error details");
      assert.equal(result.metadata?.error?.kind, "unknown");
    });
  });

  test("c64_program upload_run_basic operation proxies to C64 client", async () => {
    await withSharedMcpClient(async (ctx) => {
      const { mockServer } = ctx;
      const program = `10 PRINT "HELLO"\n20 GOTO 10`;
      const { result, supported } = await callTool(ctx, "c64_program", {
        op: "upload_run_basic",
        program,
      });

      if (!supported) {
        return;
      }

      assert.ok(Array.isArray(result.content));
      const textContent = getTextContent(result);
      assert.ok(textContent, "Expected text response content");
      assert.match(textContent.text, /BASIC program uploaded/i);

      assert.ok(result.metadata?.success, "metadata should flag success");
      assert.equal(result.metadata?.details?.result ?? "ok", "ok");
      assert.equal(mockServer.state.runCount, 1, "mock server should execute program once");
      assert.ok(mockServer.state.lastPrg, "mock server should receive PRG payload");
    });
  });

  test("c64_program upload_run_asm assembles source and runs program", async () => {
    await withSharedMcpClient(async (ctx) => {
      const { mockServer } = ctx;
      const program = `\n      .org $0801\nstart:\n      lda #$01\n      sta $0400\n      rts\n    `;

      const { result, supported } = await callTool(ctx, "c64_program", {
        op: "upload_run_asm",
        program,
      });

      if (!supported) {
        return;
      }

      assert.ok(Array.isArray(result.content));
      const textContent = getTextContent(result);
      assert.ok(textContent, "Expected text response content");
      assert.match(textContent.text, /Assembly program assembled/i);

      assert.ok(result.metadata?.success, "metadata should flag success");
      assert.equal(result.metadata?.details?.result ?? "ok", "ok");
      assert.equal(mockServer.state.runCount, 1, "mock server should execute program once");
      assert.ok(mockServer.state.lastPrg, "mock server should receive PRG payload");
    });
  });

  test("Drive and storage tools operate via MCP", async () => {
    await withSharedMcpClient(async (ctx) => {
      const { mockServer } = ctx;

      const listCall = await callTool(ctx, "c64_disk", { op: "list_drives" });
      if (!listCall.supported) {
        return;
      }
      const { result: listResult } = listCall;

      assert.equal(listResult.metadata?.success, true, "list_drives operation should succeed");
      assert.ok(listResult.metadata?.drives, "drives_list should include drive metadata");

      const { result: mountResult } = await callTool(ctx, "c64_disk", {
        op: "mount",
        drive: "drive8",
        image: "/tmp/demo.d64",
        type: "d64",
        attachmentMode: "readwrite",
      });

      assert.equal(mountResult.metadata?.success, true, "mount operation should succeed");
      assert.equal(mockServer.state.lastDriveOperation?.action, "mount");
      assert.deepEqual(mockServer.state.drives.drive8.mountedImage, {
        image: "/tmp/demo.d64",
        type: "d64",
        mode: "readwrite",
      });

      const modeCall = await callTool(ctx, "c64_drive", {
        op: "set_mode",
        drive: "drive8",
        mode: "1571",
      });
      if (!modeCall.supported) {
        return;
      }
      const { result: modeResult } = modeCall;

      assert.equal(modeResult.metadata?.success, true, "set_mode operation should succeed");
      assert.equal(mockServer.state.drives.drive8.mode, "1571");

      const { result: onResult } = await callTool(ctx, "c64_drive", {
        op: "power_on",
        drive: "drive8",
      });

      assert.equal(onResult.metadata?.success, true, "power_on operation should succeed");
      assert.equal(mockServer.state.drives.drive8.power, "on");

      const { result: offResult } = await callTool(ctx, "c64_drive", {
        op: "power_off",
        drive: "drive8",
      });

      assert.equal(offResult.metadata?.success, true, "power_off operation should succeed");
      assert.equal(mockServer.state.drives.drive8.power, "off");

      const { result: resetResult } = await callTool(ctx, "c64_drive", {
        op: "reset",
        drive: "drive8",
      });

      assert.equal(resetResult.metadata?.success, true, "reset operation should succeed");
      assert.equal(mockServer.state.drives.drive8.resetCount, 1);

      const { result: romResult } = await callTool(ctx, "c64_drive", {
        op: "load_rom",
        drive: "drive8",
        path: "/roms/custom.rom",
      });

      if (ctx.platform === "vice") {
        assertUnsupportedOperation(romResult, ctx.platform, "drive_load_rom");
      } else {
        assert.equal(romResult.metadata?.success, true, "load_rom operation should succeed");
        assert.equal(mockServer.state.drives.drive8.lastRom, "/roms/custom.rom");
      }

      const { result: removeResult } = await callTool(ctx, "c64_disk", {
        op: "unmount",
        drive: "drive8",
      });

      assert.equal(removeResult.metadata?.success, true, "unmount operation should succeed");
      assert.equal(mockServer.state.drives.drive8.mountedImage, null);

      const { result: infoResult } = await callTool(ctx, "c64_disk", {
        op: "file_info",
        path: "/tmp/demo.d64",
      });

      if (ctx.platform === "vice") {
        assertUnsupportedOperation(infoResult, ctx.platform, "file_info");
      } else {
        assert.equal(infoResult.metadata?.success, true, "file_info operation should succeed");
        assert.equal(mockServer.state.lastFileInfo, "/tmp/demo.d64");
      }

      const { result: createD64Result } = await callTool(ctx, "c64_disk", {
        op: "create_image",
        format: "d64",
        path: "/tmp/new.d64",
        tracks: 35,
        diskname: "DISK1",
      });

      if (ctx.platform === "vice") {
        assertUnsupportedOperation(createD64Result, ctx.platform, "create_image");
        return;
      }

      assert.equal(createD64Result.metadata?.success, true, "create_image (d64) should succeed");

      const { result: createD71Result } = await callTool(ctx, "c64_disk", {
        op: "create_image",
        format: "d71",
        path: "/tmp/new.d71",
        diskname: "DISK2",
      });

      assert.equal(createD71Result.metadata?.success, true, "create_image (d71) should succeed");

      const { result: createD81Result } = await callTool(ctx, "c64_disk", {
        op: "create_image",
        format: "d81",
        path: "/tmp/new.d81",
        diskname: "DISK3",
      });

      assert.equal(createD81Result.metadata?.success, true, "create_image (d81) should succeed");

      const { result: createDnpResult } = await callTool(ctx, "c64_disk", {
        op: "create_image",
        format: "dnp",
        path: "/tmp/new.dnp",
        tracks: 80,
        diskname: "DISK4",
      });

      assert.equal(createDnpResult.metadata?.success, true, "create_image (dnp) should succeed");
      assert.equal(mockServer.state.createdImages.length, 4, "All disk creations should be tracked");
      const createdTypes = mockServer.state.createdImages.map((entry) => entry.type).sort();
      assert.deepEqual(createdTypes, ["d64", "d71", "d81", "dnp"], "Disk creation types should match requests");
    });
  });

  test("c64_program grouped platform restrictions are enforced via MCP", async () => {
    await withSharedMcpClient(async (ctx) => {
      const { result: loadResult, supported } = await callTool(ctx, "c64_program", {
        op: "load_prg",
        path: "//USB0/demo.prg",
      });

      if (!supported) {
        return;
      }

      const { result: crtResult } = await callTool(ctx, "c64_program", {
        op: "run_crt",
        path: "//USB0/demo.crt",
      });

      if (ctx.platform !== "vice") {
        return;
      }

      assertUnsupportedOperation(loadResult, ctx.platform, "load_prg");
      assertUnsupportedOperation(crtResult, ctx.platform, "run_crt");
    });
  });

  test("c64_sound grouped platform restrictions are enforced via MCP", async () => {
    await withSharedMcpClient(async (ctx) => {
      const { result: sidResult, supported } = await callTool(ctx, "c64_sound", {
        op: "play_sid_file",
        path: "//USB0/demo.sid",
      });

      if (!supported) {
        return;
      }

      const { result: modResult } = await callTool(ctx, "c64_sound", {
        op: "play_mod_file",
        path: "//USB0/demo.mod",
      });

      if (ctx.platform !== "vice") {
        return;
      }

      assertUnsupportedOperation(sidResult, ctx.platform, "sidplay_file");
      assertUnsupportedOperation(modResult, ctx.platform, "modplay_file");
    });
  });

  test("c64_graphics capture_frame returns normalized frame data via MCP", async () => {
    await withSharedMcpClient(async (ctx) => {
      const { result, supported } = await callTool(ctx, "c64_graphics", {
        op: "capture_frame",
      });

      if (!supported) {
        return;
      }

      assert.equal(result.metadata?.success, true, "capture_frame should succeed");
      assert.equal(result.structuredContent?.type, "json");
      const frame = result.structuredContent?.data?.frames?.[0];
      assert.ok(frame, "capture_frame should return at least one frame");
      assert.ok(frame.complete, "captured frame should be complete");
      assert.ok(frame.byteLength > 0, "captured frame should include bytes");

      if (ctx.platform === "vice") {
        assert.equal(result.structuredContent?.data?.backend, "vice");
        assert.equal(frame.width, 320);
        assert.equal(frame.height, 200);
      } else {
        assert.equal(result.structuredContent?.data?.backend, "c64u");
        assert.equal(frame.width, 384);
        assert.equal(frame.height, 272);
        assert.equal(ctx.mockServer.state.streams.video.active, false);
        assert.ok(ctx.mockServer.state.streams.video.packetsSent >= 68);
      }
    });
  });

  test("c64_sound capture_samples returns streamed PCM data via MCP", async () => {
    await withSharedMcpClient(async (ctx) => {
      const { result, supported } = await callTool(ctx, "c64_sound", {
        op: "capture_samples",
      });

      if (!supported) {
        return;
      }

      if (ctx.platform === "vice") {
        assertUnsupportedOperation(result, ctx.platform, "capture_samples");
        return;
      }

      assert.equal(result.metadata?.success, true, "capture_samples should succeed");
      assert.equal(result.structuredContent?.type, "json");
      assert.equal(result.structuredContent?.data?.backend, "c64u");
      assert.equal(result.structuredContent?.data?.samplePairs, 256);
      assert.equal(result.structuredContent?.data?.channels, 2);
      assert.equal(result.structuredContent?.data?.samples?.encoding, "base64");
      assert.equal(ctx.mockServer.state.streams.audio.active, false);
      assert.ok(ctx.mockServer.state.streams.audio.packetsSent >= 2);
    });
  });

  test("c64_rag basic retrieval returns references", async () => {
    await withSharedMcpClient(async (ctx) => {
      const { result, supported } = await callTool(ctx, "c64_rag", {
        op: "basic",
        q: "print reverse text",
        k: 2,
      });

      if (!supported) {
        return;
      }

      assert.ok(Array.isArray(result.content));
      const textContent = getTextContent(result);
      assert.ok(textContent, "Expected text response content");
      assert.match(textContent.text, /Primary knowledge resources/i);

      assert.ok(result.metadata?.success, "metadata should flag success");
      assert.ok(result.structuredContent?.data?.refs, "should return structured refs");
      assert.ok(result.structuredContent?.data?.refs.length <= 2);
    });
  });

  test("Developer configuration tools operate via MCP", async () => {
    await withSharedMcpClient(async (ctx) => {
      const { mockServer } = ctx;
      const list = await callTool(ctx, "c64_config", { op: "list" });
      if (!list.supported) {
        return;
      }
      const listResult = list.result;
      assert.equal(listResult.metadata?.success, true, "list operation should succeed");
      const listContent = getTextContent(listResult);
      assert.ok(listContent, "config_list should return text content");
      const categories = JSON.parse(listContent.text)?.categories ?? [];
      assert.ok(Array.isArray(categories), "config_list should return categories array");
      assert.ok(categories.includes("Audio"));
      assert.equal(listResult.structuredContent?.type, "json");
      assert.deepEqual(listResult.structuredContent?.data?.categories, categories);

      const { result: getItemResult } = await callTool(ctx, "c64_config", {
        op: "get",
        category: "Audio",
        item: "Volume",
      });

      assert.equal(getItemResult.metadata?.success, true, "get operation should succeed");
      assert.equal(getItemResult.metadata?.category, "Audio");
      assert.equal(getItemResult.metadata?.item, "Volume");

      const { result: setResult } = await callTool(ctx, "c64_config", {
        op: "set",
        category: "Audio",
        item: "Volume",
        value: 11,
      });

      assert.equal(setResult.metadata?.success, true, "set operation should succeed");
      assert.equal(mockServer.state.configs.Audio.Volume, "11");

      const { result: batchResult } = await callTool(ctx, "c64_config", {
        op: "batch_update",
        Audio: {
          Balance: "left",
        },
        Video: {
          Mode: "NTSC",
        },
      });

      assert.equal(batchResult.metadata?.success, true, "batch_update operation should succeed");
      assert.equal(mockServer.state.configs.Audio.Balance, "left");
      assert.equal(mockServer.state.configs.Video.Mode, "NTSC");

      const { result: saveResult } = await callTool(ctx, "c64_config", { op: "save_flash" });

      if (ctx.platform === "vice") {
        assertUnsupportedOperation(saveResult, ctx.platform, "config_save_to_flash");
      } else {
        assert.equal(saveResult.metadata?.success, true, "save_flash operation should succeed");
        assert.ok(mockServer.state.flashSnapshot, "flash snapshot should be captured after save");
      }

      const { result: resetResult } = await callTool(ctx, "c64_config", { op: "reset_defaults" });

      if (ctx.platform === "vice") {
        assertUnsupportedOperation(resetResult, ctx.platform, "config_reset_to_default");
      } else {
        assert.equal(resetResult.metadata?.success, true, "reset_defaults operation should succeed");
        assert.equal(mockServer.state.configs.Audio.Volume, "6", "reset should restore default volume");
      }

      const { result: loadResult } = await callTool(ctx, "c64_config", { op: "load_flash" });

      if (ctx.platform === "vice") {
        assertUnsupportedOperation(loadResult, ctx.platform, "config_load_from_flash");
      } else {
        assert.equal(loadResult.metadata?.success, true, "load_flash operation should succeed");
        assert.equal(mockServer.state.configs.Video.Mode, "NTSC", "load should restore saved snapshot");
      }
    });
  });

  test("Streaming tools operate via MCP", async () => {
    await withSharedMcpClient(async (ctx) => {
      const { mockServer } = ctx;
      const { result: startResult, supported } = await callTool(ctx, "c64_stream", {
        op: "start",
        stream: "audio",
        target: "127.0.0.1:9000",
      });

      if (!supported) {
        return;
      }

      assert.equal(startResult.metadata?.success, true, "start operation should succeed");
      assert.equal(mockServer.state.streams.audio.active, true);
      assert.equal(mockServer.state.streams.audio.target, "127.0.0.1:9000");

      const { result: stopResult } = await callTool(ctx, "c64_stream", {
        op: "stop",
        stream: "audio",
      });

      assert.equal(stopResult.metadata?.success, true, "stop operation should succeed");
      assert.equal(mockServer.state.streams.audio.active, false);
    });
  });

}
