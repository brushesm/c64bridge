import { Buffer } from "node:buffer";
import {
  createOperationDispatcher,
  defineToolModule,
  discriminatedUnionSchema,
} from "../types.js";
import { graphicsModule, graphicsOperationHandlers as groupedGraphicsHandlers } from "../graphics.js";
import {
  booleanSchema,
  literalSchema,
  numberSchema,
  objectSchema,
  optionalSchema,
  stringSchema,
} from "../schema.js";
import {
  buildDescriptorIndex,
  ensureDescriptor,
  extendSchemaWithOp,
  createOperationHandlers,
  type GroupedOperationConfig,
  type GenericOperationMap,
} from "./utils.js";
import {
  ToolError,
  toolErrorResult,
  unknownErrorResult,
} from "../errors.js";
import { jsonResult } from "../responses.js";

const graphicsDescriptorIndex = buildDescriptorIndex(graphicsModule);

const captureFrameArgsSchema = objectSchema({
  description: "Capture one or more complete video frames from the active backend.",
  properties: {
    op: literalSchema("capture_frame"),
    count: optionalSchema(numberSchema({
      description: "Number of frames to capture.",
      integer: true,
      minimum: 1,
      maximum: 32,
      default: 1,
    }), 1),
    includePixels: optionalSchema(booleanSchema({
      description: "Include pixel payload bytes in the response.",
      default: true,
    }), true),
    encoding: optionalSchema(stringSchema({
      description: "Encoding used for the pixel payload when included.",
      enum: ["base64", "hex"],
      default: "base64",
    }), "base64"),
  },
  required: ["op"],
  additionalProperties: false,
});

const graphicsOperations: GroupedOperationConfig[] = [
  {
    op: "capture_frame",
    schema: captureFrameArgsSchema.jsonSchema,
    handler: async (rawArgs, ctx) => {
      try {
        const parsed = captureFrameArgsSchema.parse(rawArgs);
        ctx.logger.info("Capturing frame buffer", {
          count: parsed.count,
          includePixels: parsed.includePixels,
          encoding: parsed.encoding,
        });

        const capture = await ctx.client.captureFrames({ count: parsed.count });
        const includePixels = parsed.includePixels !== false;
        const encoding = parsed.encoding ?? "base64";
        const frames = capture.frames.map((frame, index) => {
          const pixels = includePixels
            ? {
                encoding,
                data: encoding === "hex"
                  ? Buffer.from(frame.pixels).toString("hex")
                  : Buffer.from(frame.pixels).toString("base64"),
              }
            : undefined;

          return {
            index,
            frameNumber: frame.frameNumber,
            width: frame.width,
            height: frame.height,
            bitsPerPixel: frame.bitsPerPixel,
            byteLength: frame.pixels.length,
            complete: frame.complete,
            ...(pixels ? { pixels } : {}),
          };
        });

        return jsonResult(
          {
            backend: capture.backend,
            count: frames.length,
            frames,
          },
          {
            success: true,
            backend: capture.backend,
            count: frames.length,
            includePixels,
            encoding: includePixels ? encoding : null,
          },
        );
      } catch (error) {
        if (error instanceof ToolError) {
          return toolErrorResult(error);
        }
        return unknownErrorResult(error);
      }
    },
  },
  {
    op: "create_petscii",
    schema: extendSchemaWithOp(
      "create_petscii",
      ensureDescriptor(graphicsDescriptorIndex, "create_petscii").inputSchema,
      { description: "Generate PETSCII art from prompts, text, or explicit bitmap data." },
    ),
    handler: groupedGraphicsHandlers.create_petscii,
  },
  {
    op: "render_petscii",
    schema: extendSchemaWithOp(
      "render_petscii",
      ensureDescriptor(graphicsDescriptorIndex, "render_petscii").inputSchema,
      { description: "Render PETSCII text with optional border/background colours." },
    ),
    handler: groupedGraphicsHandlers.render_petscii,
  },
  {
    op: "generate_sprite",
    schema: extendSchemaWithOp(
      "generate_sprite",
      ensureDescriptor(graphicsDescriptorIndex, "generate_sprite").inputSchema,
      { description: "Build and run a sprite PRG from raw 63-byte sprite data." },
    ),
    handler: groupedGraphicsHandlers.generate_sprite,
  },
  {
    op: "generate_bitmap",
    schema: extendSchemaWithOp(
      "generate_bitmap",
      ensureDescriptor(graphicsDescriptorIndex, "generate_bitmap").inputSchema,
      { description: "Import an image file, convert it to VIC bitmap memory, and enable bitmap mode." },
    ),
    handler: groupedGraphicsHandlers.generate_bitmap,
  },
];

const graphicsOperationHandlers = createOperationHandlers(graphicsOperations);

export const graphicsModuleGroup = defineToolModule({
  domain: "graphics",
  summary: "Grouped PETSCII, sprite, bitmap, and frame capture helpers.",
  resources: ["c64://specs/vic", "c64://specs/basic", "c64://specs/assembly"],
  prompts: ["graphics-demo", "basic-program", "assembly-program"],
  defaultTags: ["graphics", "vic"],
  workflowHints: [
    "Use PETSCII helpers for text art and clarify whether the BASIC program executed or stayed a dry run.",
    "Mention sprite positions/colours so follow-up memory inspection stays grounded.",
  ],
  supportedPlatforms: ["c64u", "vice"],
  tools: [
    {
      name: "c64_graphics",
      description: "Grouped entry point for PETSCII art, sprite previews, bitmap import, and frame capture.",
      summary: "Generates PETSCII art, renders text screens, imports bitmap images, or runs sprite demos from one tool.",
      inputSchema: discriminatedUnionSchema({
        description: "Graphics operations available via the c64_graphics tool.",
        variants: graphicsOperations.map((operation) => operation.schema),
      }),
      tags: ["graphics", "vic", "grouped"],
      examples: [
        {
          name: "Capture one frame",
          description: "Grab the current framebuffer from the active backend",
          arguments: { op: "capture_frame" },
        },
        {
          name: "Create PETSCII art (dry run)",
          description: "Synthesize art without uploading to the C64",
          arguments: { op: "create_petscii", prompt: "duck on a pond", dryRun: true },
        },
        {
          name: "Render PETSCII text",
          description: "Print HELLO with blue border",
          arguments: { op: "render_petscii", text: "HELLO", borderColor: 6 },
        },
        {
          name: "Display sprite",
          description: "Show sprite data at coordinates",
          arguments: { op: "generate_sprite", sprite: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" },
        },
        {
          name: "Import bitmap image",
          description: "Convert a PNG into VIC bitmap memory and display it",
          arguments: { op: "generate_bitmap", imagePath: "./artifacts/sample.png", format: "hires" },
        },
      ],
      execute: createOperationDispatcher<GenericOperationMap>(
        "c64_graphics",
        graphicsOperationHandlers,
      ),
    },
  ],
});
