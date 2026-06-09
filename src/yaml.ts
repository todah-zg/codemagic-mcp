import Ajv from "ajv";
import * as yaml from "js-yaml";
export { getYamlTemplate, listYamlTemplateTypes } from "./templates.js";

const ajv = new Ajv({ allErrors: true });

let schema: object | null = null;

async function getSchema(): Promise<object> {
  if (schema) return schema;
  const response = await fetch("https://codemagic.io/codemagic-schema.json");
  if (!response.ok) {
    throw new Error(`Failed to fetch schema: ${response.status} ${response.statusText}`);
  }
  schema = await response.json() as object;
  return schema;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export async function validateCodemagicYaml(yamlContent: string): Promise<ValidationResult> {
  let parsed: unknown;
  try {
    parsed = yaml.load(yamlContent);
  } catch (e) {
    return {
      valid: false,
      errors: [`YAML syntax error: ${e instanceof Error ? e.message : String(e)}`],
    };
  }

  const schemaObj = await getSchema();
  const validate = ajv.compile(schemaObj);
  const valid = validate(parsed) as boolean;

  return {
    valid,
    errors: valid ? [] : (validate.errors ?? []).map(e => `${e.dataPath} ${e.message}`),
  };
}