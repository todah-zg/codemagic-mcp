import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { validateCodemagicYaml, getYamlTemplate, listYamlTemplateTypes } from "../yaml.js";


export function registerYamlTools(server: McpServer): void {

  server.registerTool("validate_codemagic_yaml", {
    description: "Validate a codemagic.yaml file against the official Codemagic JSON schema",
    inputSchema: {
      yaml_content: z.string().describe("The full contents of a codemagic.yaml file"),
    },
  }, async ({ yaml_content }) => {
    const result = await validateCodemagicYaml(yaml_content);
    if (result.valid) {
      return {
        content: [{ type: "text", text: "Valid codemagic.yaml — no errors found." }],
      };
    }
    const text = `Invalid codemagic.yaml — ${result.errors.length} error(s):\n${result.errors.map(e => `  - ${e}`).join("\n")}`;
    return {
      content: [{ type: "text", text }],
      isError: true,
    };
  });

  server.registerTool("get_yaml_template", {
    description: "Get a starter codemagic.yaml template for a given project type. Templates cover build and signing only — publishing is handled separately via App Store Connect tools.",
    inputSchema: {
      project_type: z.enum([
        "android",
        "ios",
        "flutter",
        "flutter-native",
        "react-native",
        "ionic-capacitor",
        "ionic-cordova",
        "kmm",
        "snap",
        "unity",
        "unity-oculus",
        "dotnet-maui",
        "android-debug",
        "flutter-android-debug",
        "react-native-android-debug",
      ]).describe("The project type to get a template for"),
    },
  }, async ({ project_type }) => {
    const template = getYamlTemplate(project_type);
    if (!template) {
      return {
        content: [{ type: "text", text: `No template found for project type: ${project_type}` }],
        isError: true,
      };
    }
    return {
      content: [{ type: "text", text: template }],
    };
  });

  server.registerTool("list_yaml_template_types", {
    description: "List all available codemagic.yaml template types",
  }, async () => {
    const types = listYamlTemplateTypes();
    return {
      content: [{ type: "text", text: types.join("\n") }],
    };
  });

}
